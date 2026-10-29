"""Frozen soft-object inference and temporal gallery rendering; no training."""
from pathlib import Path
import argparse
import fcntl
import json
import math
import struct
import subprocess
import sys
import tempfile
import time

import numpy as np
import torch
import trimesh
from PIL import Image, ImageDraw, ImageFont
from skimage.measure import marching_cubes
from matplotlib import font_manager

BASE = Path('/workspace/worldstring-general')
GALLERY = Path('/workspace/worldstring-general-gallery30-20260926')
OUT = Path('/workspace/worldstring-object-zoo-five-20261026')
DATA = BASE / 'data/ws_deform30_single_episode_20260919'
CHECKPOINT = BASE / 'runs/ws_deform30_single_episode40k_20260919/train/step_040000.pth'
sys.path.insert(0, str(BASE / 'scripts/ws_deform30_single_episode'))
from runtime import SingleEpisodeModel

OBJECTS = {
    '008-pink-cloth': ('Pink cloth', '#FFAFBC'),
    '051-cube': ('Soft cube', '#A6BFEA'),
    '056-makeup-sponge': ('Makeup sponge', '#E3AEDB'),
    '081-stripe-rope': ('Striped rope', '#96DBE1'),
    '096-octopus': ('Octopus plush', '#D0B2F0'),
}


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')
    temp.replace(path)


def camera_basis():
    yaw = math.atan2(.34, 1.) + 2 * math.pi * 20 / 480
    el = math.radians(16)
    back = np.array([math.sin(yaw) * math.cos(el), math.sin(el), math.cos(yaw) * math.cos(el)])
    right = np.cross([0, 1, 0], back)
    right /= np.linalg.norm(right)
    return np.stack([right, np.cross(back, right), -back], axis=1)


def infer_object(name, net, ck, worker, count):
    dest = OUT / name
    dest.mkdir(parents=True, exist_ok=True)
    meta = json.loads((GALLERY / 'geometry/softbody' / name / 'metadata.json').read_text())
    records = json.loads((DATA / name / 'split.json').read_text())['records']
    with np.load(DATA / name / 'rigid_coordinates.npz') as z:
        coords = {k: z[k].copy() for k in z.files}
    ids = meta['display_frame_ids']
    assert all(records[i]['split'] == 'test' for i in ids)
    # Even coverage in source time, selected before any new predictions.
    source_times = np.array([records[i]['source_frame'] for i in ids])
    assert np.all(np.diff(source_times) > 0)
    chosen = np.unique(np.argmin(abs(source_times[:, None] - np.linspace(source_times[0], source_times[-1], count)[None]), axis=0))
    frames = [ids[i] for i in chosen]
    plan = dict(object=name, checkpoint=str(CHECKPOINT), checkpoint_step=40000,
                frame_selection='Nearest held-out states to uniformly spaced source times; no score selection',
                dataset_frames=frames, source_frames=[records[i]['source_frame'] for i in frames],
                timeline='Source order; uniform 100 ms display per sampled state, not original recording speed',
                grid=[256, 256, 256], query_convention='i represents (i+0.5)/256-0.5',
                postprocessing='None; all extracted triangles/components retained',
                rigid_alignment='Original per-frame rigid KP alignment; fixed reference PCA orientation',
                original_metadata=str(GALLERY / 'geometry/softbody' / name / 'metadata.json'))
    write(dest / 'plan.json', plan)
    oid = ck['recipe']['objects'].index(name)
    orientation = np.array(meta['display_orientation'])
    stats = []
    for index, frame in enumerate(frames):
        target = dest / f'surface_{index:03d}.npz'
        receipt = dest / f'frame_{index:03d}.json'
        if target.exists() and receipt.exists():
            stats.append(json.loads(receipt.read_text()))
            continue
        start = time.monotonic()
        with np.load(DATA / name / 'frames' / f'{frame:06d}.npz') as z:
            k = int(z['keypoint_count'])
            kp_array = z['keypoints'][:k].copy()
        rotation, translation = coords['rotation'][frame], coords['translation_normalized'][frame]
        np.testing.assert_allclose((kp_array / 256 - .5) @ rotation + translation,
                                   coords['keypoints_canonical'][frame], atol=1e-6)
        kp = torch.tensor(kp_array, device='cuda')[None]
        lengths = torch.tensor([k], device='cuda')
        rows, masks = ck['static_rows'][oid:oid+1, :k].cuda(), ck['token_mask'][oid:oid+1, :k].cuda()
        assert int(masks.sum()) == k
        with torch.inference_mode(), torch.autocast('cuda', dtype=torch.bfloat16):
            context = net.encode_nodes(kp, lengths, rows, masks)
            probe = torch.tensor(np.random.default_rng(731).uniform(0, 255, (1, 512, 3)), dtype=torch.float32, device='cuda')
            direct = net(probe, kp, lengths, rows, masks).float()
            cached = net.decode_queries(probe, context, kp, lengths).float()
            error = float((direct - cached).abs().max())
            assert error < 1e-4
            values = np.empty(256**3, np.float32)
            for begin in range(0, len(values), 65536):
                flat = np.arange(begin, min(begin + 65536, len(values)))
                q = np.stack([flat // 65536, flat // 256 % 256, flat % 256], axis=-1).astype(np.float32)
                logits = net.decode_queries(torch.tensor(q, device='cuda')[None], context, kp, lengths)[0].float()
                values[begin:begin+len(q)] = (logits[:, 1] - logits[:, 0]).cpu().numpy()
        assert np.isfinite(values).all() and values.min() < 0 < values.max()
        volume = values.reshape((256,)*3)
        boundary = max(float(a.max()) for a in [volume[0], volume[-1], volume[:, 0], volume[:, -1], volume[:, :, 0], volume[:, :, -1]])
        assert boundary < 0, (name, frame, 'occupied query boundary', boundary)
        vertices, faces, _, _ = marching_cubes(volume, level=0, allow_degenerate=False, gradient_direction='ascent')
        vertices = (((vertices + .5) / 256 - .5) @ rotation + translation) @ orientation
        mesh = trimesh.Trimesh(vertices, faces, process=False)
        normals = np.asarray(mesh.vertex_normals, np.float32)
        assert len(faces) and np.isfinite(vertices).all() and np.isfinite(normals).all()
        np.savez_compressed(target, vertices=vertices.astype(np.float32), faces=faces, normals=normals)
        stat = dict(index=index, dataset_frame=frame, source_frame=records[frame]['source_frame'],
                    vertices=len(vertices), triangles=len(faces), boundary_max=boundary,
                    cached_forward_max_abs_error=error, elapsed_seconds=time.monotonic()-start)
        write(receipt, stat)
        stats.append(stat)
        write(OUT / f'worker_{worker}.json', dict(object=name, phase='inference', done=index+1, total=len(frames)))
        print(name, 'inference', index+1, '/', len(frames), round(stat['elapsed_seconds'], 2), flush=True)
    render_object(name, meta, chosen, stats)


def render_object(name, meta, chosen, stats):
    dest = OUT / name
    title, color = OBJECTS[name]
    basis = camera_basis()
    lo, hi = np.full(3, np.inf), np.full(3, -np.inf)
    for i in range(len(stats)):
        with np.load(dest / f'surface_{i:03d}.npz') as z:
            p = z['vertices'] @ basis
            lo, hi = np.minimum(lo, p.min(0)), np.maximum(hi, p.max(0))
    center = (lo + hi) * .5
    width, height, ss = 440, 310, 2
    scale = min((width-36)/(hi[0]-lo[0]), (height-32)/(hi[1]-lo[1]))
    base_rgb = np.array([int(color[j:j+2], 16)/255 for j in [1, 3, 5]])
    linear = np.where(base_rgb <= .04045, base_rgb/12.92, ((base_rgb+.055)/1.055)**2.4)
    key, fill = np.array([-.45,.65,-1.]), np.array([.7,.25,-.7])
    key /= np.linalg.norm(key); fill /= np.linalg.norm(fill)
    half = key + [0,0,-1]; half /= np.linalg.norm(half)
    xy, train = np.array(meta['display_trajectory_xy']), np.array(meta['display_train_xy'])
    fontpath = font_manager.findfont('DejaVu Sans', fallback_to_default=False)
    title_font, label_font = ImageFont.truetype(fontpath, 40), ImageFont.truetype(fontpath, 20)
    images, bounds = [], []
    for i in range(len(stats)):
        with np.load(dest / f'surface_{i:03d}.npz') as z:
            p, n, f = z['vertices'] @ basis, z['normals'] @ basis, z['faces']
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
        n[n[:,2] > 0] *= -1
        light = .58 + .32*np.maximum(n@key, 0) + .10*np.maximum(n@fill, 0)
        value = np.clip(linear[None]*light[:,None] + .05*np.maximum(n@half,0)[:,None]**40, 0, 1)
        rgb = np.where(value <= .0031308, value*12.92, 1.055*value**(1/2.4)-.055)
        p -= center
        p[:,0] = (width/2 + p[:,0]*scale)*ss
        p[:,1] = (height/2 - p[:,1]*scale)*ss
        triangles = np.concatenate([p[f], rgb[f]], axis=-1).astype('<f4')
        with tempfile.TemporaryDirectory(dir=dest) as temp:
            raw, output = Path(temp)/'input.bin', Path(temp)/'output.rgba'
            with raw.open('wb') as stream:
                stream.write(struct.pack('<iii', width*ss, height*ss, len(f)))
                stream.write(triangles.tobytes())
            subprocess.run([str(OUT/'rasterize'), str(raw), str(output)], check=True)
            surface = Image.frombytes('RGBA', (width*ss,height*ss), output.read_bytes())
        bbox = surface.getbbox()
        assert bbox and min(bbox[:2]) > 8 and bbox[2] < width*ss-8 and bbox[3] < height*ss-8
        bounds.append(list(bbox))
        canvas = Image.new('RGB', (1440,800), 'white')
        draw = ImageDraw.Draw(canvas)
        draw.text((40,30), title, font=title_font, fill='#273F4B')
        draw.polygon([(42,128),(50,110),(58,128)], fill='#BF6B63')
        draw.text((67,107), 'Training poses', font=label_font, fill='#607E88')
        draw.line([(275,120),(304,120)], fill=color, width=3)
        draw.text((315,107), 'Inference trajectory', font=label_font, fill='#607E88')
        draw.ellipse((34,212,450,628), fill='#FCFDFE', outline='#DDE3E8', width=2)
        def point(v): return (242+v[0]*196,420-v[1]*196)
        current = point(xy[chosen[i]])
        pale = tuple(round(c*.20+255*.80) for c in tuple(int(color[j:j+2],16) for j in [1,3,5]))
        for end in [(545,205),(545,670)]: draw.line([current,end],fill=pale,width=1)
        draw.line([point(v) for v in xy], fill=color,width=3)
        for v in train:
            x,y=point(v)
            draw.polygon([(x,y-6),(x-6,y+5),(x+6,y+5)],fill='#BF6B63',outline='white')
        x,y=current
        draw.ellipse((x-17,y-17,x+17,y+17),fill=pale)
        draw.ellipse((x-10,y-10,x+10,y+10),fill=color,outline='white',width=3)
        draw.ellipse((x-3,y-3,x+3,y+3),fill='white')
        canvas.paste(surface,(550,155),surface)
        image = canvas.resize((720,400),Image.Resampling.LANCZOS)
        image.save(dest/f'render_{i:03d}.png')
        images.append(image)
    # A single global palette prevents palette flicker between states.
    sheet = Image.new('RGB',(720*len(images),400),'white')
    for i, im in enumerate(images): sheet.paste(im,(720*i,0))
    palette = sheet.quantize(colors=192, method=Image.Quantize.MEDIANCUT)
    encoded = [im.quantize(palette=palette,dither=Image.Dither.NONE) for im in images]
    encoded[0].save(dest/f'{name}.gif',save_all=True,append_images=encoded[1:],duration=100,loop=0,disposal=2,optimize=False)
    images[0].save(dest/f'{name}.png')
    write(dest/'complete.json',dict(complete=True,object=name,actual_inference_frames=len(stats),
          image_size=[720,400],frame_duration_ms=100,source_order=True,interpolated_frames=False,
          camera=dict(basis=basis.tolist(),center=center.tolist(),scale=scale,static_across_frames=True),
          surface_bounds=bounds,frames=stats,gif_bytes=(dest/f'{name}.gif').stat().st_size))
    print('COMPLETE',name,len(stats),flush=True)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--worker',type=int,default=0)
    parser.add_argument('--workers',type=int,default=2)
    parser.add_argument('--frames',type=int,default=40)
    args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    with (OUT/f'worker_{args.worker}.lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        torch.set_num_threads(2)
        torch.backends.cuda.matmul.allow_tf32=False
        ck=torch.load(CHECKPOINT,map_location='cpu',weights_only=False)
        assert ck['step']==40000 and not ck['smoke']
        net=SingleEpisodeModel(ck['recipe']['model_config'])
        net.load_state_dict({k.removeprefix('net.'):v for k,v in ck['model_state_dict'].items()},strict=True)
        net.cuda().eval().requires_grad_(False)
        names=list(OBJECTS)[args.worker::args.workers]
        for name in names:
            infer_object(name,net,ck,args.worker,args.frames)
        write(OUT/f'worker_{args.worker}_complete.json',dict(complete=True,objects=names))


if __name__=='__main__': main()
