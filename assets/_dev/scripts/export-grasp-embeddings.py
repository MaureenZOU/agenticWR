"""Optimize native XHand against the learned duck field and record exact KP tokens.

Runs in the existing remote grasp environment. Network weights and live services
are untouched. The website replays accepted optimizer states, not synthetic
motions, interpolated embeddings, or a new physical grasp demonstration.
"""
import argparse
import gzip
import json
import os
from pathlib import Path
import sys
import time
import types

import numpy as np


def main(args):
    root = args.root.resolve()
    os.environ['GRASP_DEMO_ROOT'] = str(root)
    demo = root / 'online_grasp_comparison_demo'
    sys.path[:0] = [str(root), str(demo)]
    # Existing strict loader verifies frozen tensors directly, without digests.
    import grasp_runtime  # noqa: F401
    import torch
    from solvers import Solver
    from object_field import math_sdpa_context
    from grasping.xhand_fk import XHAND_JOINT_ORDER, XHAND_TIP_JOINTS

    args.output.mkdir(parents=True, exist_ok=True)
    scene_path = demo / 'results/6b66822839a4477b8d8908ebcfaebdfd/scene.json'
    scene = json.loads(scene_path.read_text())
    scene.pop('reach', None)
    solver = Solver('ws')
    solver.prepare(scene)
    base = solver.objective

    class BalancedObjective:
        """Keep native contact/penetration losses; add contact-centroid balance."""
        def __getattr__(self, name):
            return getattr(base, name)

        @property
        def contact_active(self):
            return base.contact_active

        @contact_active.setter
        def contact_active(self, value):
            base.contact_active = value

        def __call__(self, q, t, rotation):
            loss, terms = base(q, t, rotation)
            kp, _ = solver.fk(q)
            tips = kp[list(base.TIP_IDS)] @ rotation.T + t
            balance = ((tips.mean(0) - solver.centre) / solver.radius).square().mean()
            loss = loss + .25 * balance
            return loss, dict(terms, total=loss, contact_centroid_balance=balance)

    solver.objective = BalancedObjective()
    hand = solver.hand.awr.model
    duck = solver.objects['duck']
    before = {name: tensor.detach().clone() for name, tensor in duck.model.state_dict().items()}
    trajectory_path = args.output / 'optimizer.json'
    if trajectory_path.exists():
        run = json.loads(trajectory_path.read_text())
        metrics, trace = run['metrics'], run['trace']
    else:
        start = time.monotonic()
        def progress(row):
            if row['accepted_updates'] % 15 == 0:
                print('OPTIMIZE', row['accepted_updates'], round(time.monotonic()-start, 2), flush=True)
        metrics, trace = solver.run(progress, lambda: False)
        trajectory_path.write_text(json.dumps(dict(metrics=metrics, trace=trace, scene=scene)))
    # A final solver receipt may repeat its last accepted iterate. Keep one row
    # per actual accepted step, including the initial state.
    trace = list({row['accepted_updates']: row for row in trace}.values())
    capture = {'enabled': False, 'hand': [], 'duck': []}
    def instrument(model, name):
        original = model._joint_position_tokens
        def recorded(self, *a, **kw):
            value = original(*a, **kw)
            if capture['enabled']:
                # Static object tokens become diagnostic leaves. Their values
                # are unchanged and they are never optimizer parameters.
                if not value.requires_grad:
                    value.requires_grad_(True)
                capture[name].append(value)
            return value
        model._joint_position_tokens = types.MethodType(recorded, model)
    instrument(hand, 'hand')
    instrument(duck.model, 'duck')

    arrays = {key: [] for key in ['embedding', 'embedding_gradient', 'keypoints',
              'joint_gradient', 'q', 'wrist_position', 'wrist_rotation',
              'object_embedding', 'object_embedding_gradient']}
    rows = []
    equivalence = []
    for i, pose in enumerate(trace):
        q = solver.tensor(pose['q_optimizer']).requires_grad_(True)
        t = solver.tensor(pose['wrist_position_world'])
        rotation = solver.tensor(pose['wrist_rotation_world'])
        solver.objective.contact_active = pose.get('contact_closure_active', False)
        capture.update(enabled=False, hand=[], duck=[])
        duck._cache_ready = True
        with math_sdpa_context():
            original_loss, _ = solver.objective(q, t, rotation)
            original_gradient = torch.autograd.grad(original_loss, q)[0]
        capture['enabled'] = True
        duck._cache_ready = False
        with math_sdpa_context():
            loss, terms = solver.objective(q, t, rotation)
            assert len(capture['hand']) == 1
            assert len(capture['duck']) == 2
            eh, *eo = capture['hand'] + capture['duck']
            grads = torch.autograd.grad(loss, [q, eh, *eo])
        torch.testing.assert_close(loss, original_loss, rtol=2e-5, atol=2e-5)
        torch.testing.assert_close(grads[0], original_gradient, rtol=2e-4, atol=2e-4)
        assert eh.shape == (1, 18, 128) and eo[0].shape == (1, 1, 128)
        assert all(torch.equal(value, eo[0]) for value in eo)
        with torch.no_grad():
            kp, _ = solver.fk(q)
        values = dict(embedding=eh[0], embedding_gradient=grads[1][0], keypoints=kp,
                      joint_gradient=grads[0], q=q, wrist_position=t, wrist_rotation=rotation,
                      object_embedding=eo[0][0], object_embedding_gradient=sum(grads[2:])[0])
        for key, value in values.items():
            value = value.detach().cpu().numpy().astype('<f4')
            assert np.isfinite(value).all(), key
            arrays[key].append(value)
        rows.append(dict(step=pose['accepted_updates'], stage=pose['optimizer_stage'],
                         loss=float(loss.detach()), components={k: float(v.detach()) for k, v in terms.items()}))
        equivalence.append(dict(loss_error=float((loss-original_loss).abs().detach()),
                                q_gradient_error=float((grads[0]-original_gradient).abs().max())))
        if i % 20 == 0:
            print('RECORD', i, '/', len(trace), rows[-1]['loss'], flush=True)
    arrays = {key: np.stack(value) for key, value in arrays.items()}
    assert np.array_equal(arrays['object_embedding'], np.broadcast_to(arrays['object_embedding'][0], arrays['object_embedding'].shape))
    assert np.count_nonzero(arrays['embedding_gradient']) and np.count_nonzero(arrays['object_embedding_gradient'])
    assert rows[-1]['loss'] < rows[0]['loss']
    solver.hand.assert_frozen_unchanged()
    assert all(torch.equal(value, before[name]) for name, value in duck.model.state_dict().items())
    assert not any(p.requires_grad for model in (hand, duck.model) for p in model.parameters())
    np.savez_compressed(args.output / 'raw-telemetry.npz', **arrays)

    # Float32 tensors retain all channels and rows. The browser derives Delta E
    # from successive accepted steps; no PCA, invented cells, or per-frame scale.
    layout = {}
    blocks = []
    offset = 0
    for name, array in arrays.items():
        layout[name] = dict(offset=offset, count=array.size, shape=list(array.shape))
        blocks.append(array.tobytes())
        offset += array.size
    with gzip.open(args.output / 'trace.f32.gz', 'wb', compresslevel=6) as out:
        out.write(b''.join(blocks))
    delta = np.diff(arrays['embedding'], axis=0, prepend=arrays['embedding'][:1])
    edges = [[parent+1, index+1] for index, parent in enumerate(solver.fk.parents)]
    edges += [[joint+1, 13+i] for i, joint in enumerate(XHAND_TIP_JOINTS)]
    names = ['wrist'] + list(XHAND_JOINT_ORDER) + ['pinky_tip', 'ring_tip', 'thumb_tip', 'index_tip', 'middle_tip']
    manifest = dict(schema='awr-grasp-kp-embedding-v1', binary='trace.f32.gz', dtype='float32-le',
        frames=len(rows), rows=rows, arrays=layout, keypoint_names=names, edges=edges,
        scales=dict(embedding=float(np.max(np.abs(arrays['embedding']))),
                    delta=float(np.max(np.abs(delta))), gradient=float(np.max(np.abs(arrays['embedding_gradient'])))),
        source=dict(hand_checkpoint=solver.configs['duck']['hand_checkpoint'],
                    object_checkpoint=solver.configs['duck']['object_checkpoint'],
                    initialization=str(scene_path), optimizer='90 Adam updates then L-BFGS-B; 150 gradient-evaluation limit',
                    embedding='Exact _joint_position_tokens: positional encoding of native KP lattice coordinates @ learned pos_proj.weight, before 18-to-256 token resize',
                    dimensions=[18, 128], delta='E[t] - E[t-1] over every accepted optimizer step; first frame is zero',
                    loss='CachedFKWrapLoss plus 0.25 * normalized fingertip-centroid balance; native hand SDF and duck SDF both queried',
                    object_keypoints=1, object_embedding_static=True, weights_frozen=True,
                    replay='Fresh offline geometric optimization; no live browser inference, no dynamics or hardware success claim',
                    units='Hand FK in the original model coordinate system; only display projection/scaling is applied'),
        validation=dict(finite=True, unchanged_model_tensors=True,
                        hand_embedding_gradient_nonzero=True, object_embedding_gradient_nonzero=True,
                        object_delta_exactly_zero=True, initial_loss=rows[0]['loss'], final_loss=rows[-1]['loss'],
                        maximum_instrumented_loss_error=max(v['loss_error'] for v in equivalence),
                        maximum_instrumented_q_gradient_error=max(v['q_gradient_error'] for v in equivalence)),
        optimizer_metrics=metrics)
    (args.output / 'trace.json').write_text(json.dumps(manifest, separators=(',', ':')))
    print('COMPLETE', json.dumps(manifest['validation']), 'frames', len(rows), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path('/workspace/worldstring-demos/duck-cup-optimization'))
    parser.add_argument('--output', type=Path, required=True)
    main(parser.parse_args())
