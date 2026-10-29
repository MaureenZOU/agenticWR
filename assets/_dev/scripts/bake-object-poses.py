"""Bake legal rigid poses with the simulator's unchanged 256-resolution SDF.

Run in the remote inference environment, with only the assigned GPU visible.
Every displayed pose has its own inferred topology. No vertex transport,
part-label interpolation, proxy geometry, or neural-model changes are used.
"""
import argparse
import gzip
import itertools
import json
from pathlib import Path
import struct
import sys
import time

import numpy as np


def bake(args):
    sys.path.insert(0, str(args.service))
    import torch
    import fast_simplification
    from rigid import build_objects
    from surface import smooth_display_surface

    torch.set_num_threads(2)
    counts = {'pliers': [31], 'faucet': [9, 9], 'toilet': [3, 17], 'cabinet': [9, 9]}
    args.output.mkdir(parents=True, exist_ok=True)
    for obj in build_objects(args.root, device='cuda:0'):
        spec = obj.spec()
        key = spec['id']
        if args.objects and key not in args.objects:
            continue
        default = spec['default_state']
        names = list(default)
        axes = []
        for name, count in zip(names, counts[key]):
            values = np.linspace(*spec['joint_limits'][name], count)
            # Include the exact resting pose without changing either endpoint.
            i = int(np.argmin(abs(values[1:-1] - default[name]))) + 1
            values[i] = default[name]
            axes.append(values.tolist())
        states = [dict(zip(names, q)) for q in itertools.product(*axes)]
        cache = args.output / key
        cache.mkdir(exist_ok=True)
        frames, records = [], []
        for i, state in enumerate(states):
            path = cache / f'{i:03}.npz'
            metadata = cache / f'{i:03}.json'
            if not path.exists():
                started = time.monotonic()
                result = obj.mesh(state, resolution=256)
                v, processing = smooth_display_surface(result['vertices'], result['faces'], 256)
                f = np.asarray(result['faces'])
                original_faces = len(f)
                # The browser's previous surface already used 32k triangles.
                # Reduce each complete prediction independently, never deform it.
                if len(f) > 24000:
                    v, f = fast_simplification.simplify(v, f, target_count=24000, agg=5)
                np.savez_compressed(path, vertices=np.asarray(v, dtype='<f4'), faces=np.asarray(f, dtype='<u4'))
                metadata.write_text(json.dumps({'state': result['state'], 'source_faces': original_faces,
                    'display_faces': len(f), 'checkpoint': result['checkpoint'],
                    'surface_processing': processing, 'seconds': time.monotonic()-started}))
            a = np.load(path)
            v, f = a['vertices'], a['faces']
            record = json.loads(metadata.read_text())
            if key == 'cabinet':
                # Exact display-only floor patch used by the local simulator's
                # representation-display-repairs.js. The unpatched inferred
                # display surface stays in the per-frame cache above.
                import trimesh
                low = np.array([-.0356, -.1523, .2290])
                high = np.array([.3493, .1523, .2370])
                patch = trimesh.creation.box(high-low)
                patch.apply_translation((low+high)/2 + np.array([-state['joint_1']/2.209540300000001, 0, 0]))
                f = np.concatenate([f, patch.faces+len(v)]).astype('<u4')
                v = np.concatenate([v, patch.vertices]).astype('<f4')
                record['display_completion'] = 'Same 12-triangle upper-drawer floor patch as local simulator; display only, not learned SDF'
                record['display_faces'] = len(f)
            assert np.isfinite(v).all() and f.max() < len(v)
            frames.append(struct.pack('<II', len(v), len(f)) + v.tobytes() + f.tobytes())
            records.append(record)
            if i % 10 == 0 or i == len(states)-1:
                print(key, i+1, '/', len(states), flush=True)
        offsets = np.r_[0, np.cumsum([len(f) for f in frames])].astype('<u4')
        payload = struct.pack('<4sIII', b'AWPS', 1, len(frames), 0) + offsets.tobytes() + b''.join(frames)
        with gzip.open(args.output / (key+'.bin.gz'), 'wb', compresslevel=6) as out:
            out.write(payload)
        manifest = {'schema': 'worldstring-inferred-pose-atlas-v1', 'id': key,
                    'geometry': key+'.bin.gz', 'joints': names, 'axes': axes,
                    'default_state': default, 'states': states, 'resolution': 256,
                    'checkpoint': records[0]['checkpoint'], 'model_object_id': spec['provenance']['model_object_id'],
                    'source': 'Local simulator rigid.py / partnet.py, native SDF, 257^3 corner queries per pose',
                    'display_processing': 'Same bounded Taubin smoothing as local demo; independent 24k-face display decimation per complete surface'+('; same local-demo upper-drawer floor completion (12 triangles)' if key=='cabinet' else ''),
                    'interaction': 'Joint-limit projection followed by nearest pre-inferred legal pose; surface and keypoints use that exact same state; no mesh warping',
                    'records': records}
        (args.output / (key+'.json')).write_text(json.dumps(manifest, separators=(',', ':')))
        print('COMPLETE', key, len(states), 'poses', (args.output/(key+'.bin.gz')).stat().st_size, 'bytes', flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--root', type=Path, default=Path('/workspace/worldstring-general'))
    p.add_argument('--service', type=Path, default=Path('/workspace/worldstring-demos/interactive-workbench'))
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--objects', nargs='*')
    bake(p.parse_args())
