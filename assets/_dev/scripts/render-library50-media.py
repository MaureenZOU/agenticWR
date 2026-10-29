"""Render frozen surfaces and keypoint PCA panels; imported by the media generator."""
from pathlib import Path
import json,math,struct,subprocess,tempfile
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from matplotlib import font_manager
OUT=Path('/workspace/worldstring-demos/library50-full256-20261029')
OBJECTS={}

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
    encoded[0].save(dest/f'{name}.gif',save_all=True,append_images=encoded[1:],duration=meta.get('frame_duration_ms',100),loop=0,disposal=2,optimize=False)
    images[0].save(dest/f'{name}.png')
    write(dest/'complete.json',dict(complete=True,object=name,actual_inference_frames=len(stats),
          image_size=[720,400],frame_duration_ms=meta.get('frame_duration_ms',100),source_order=True,interpolated_frames=False,
          camera=dict(basis=basis.tolist(),center=center.tolist(),scale=scale,static_across_frames=True),
          surface_bounds=bounds,frames=stats,gif_bytes=(dest/f'{name}.gif').stat().st_size))
    print('COMPLETE',name,len(stats),flush=True)
