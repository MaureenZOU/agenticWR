# Object Zoo and Sharpa update — 2026-10-29

The overview gallery contains 50 animated examples: 30 rigid/articulated, seven skinned and 13 soft. Its source-image thumbnails use five columns. The secondary chapter navigation has been removed. The gradient diagram places finger joint angles at the top and grasp loss at the bottom, with arrows pointing backward through the frozen fields.

The rigid selection covers tools, household objects, appliances, furniture and different robot designs. It includes one faucet and one cabinet. Gallery thumbnails are cropped from the original photographs/material renders in `paper/figures/assets.png`, using the source convention documented in the paper appendix. Exact crop coordinates are in `assets/zoo-thumbnails/sources.json`.

The 24 added animations comprise 21 rigid and three soft examples. They use frozen checkpoint occupancy inference on a 256-cubed query grid for rigid objects and a 128-cubed grid for soft objects, without mesh interpolation. RBO/PartNet examples use native, valid FK motions; robot examples show held-out joint states ordered by keypoint PC1. Their keypoints are read through the checkpoint’s `keypoints_for_model` interface, including its revised native robot keypoint bank. Soft examples follow sampled held-out source times. They are illustrative reconstructions, not a new benchmark. Checkpoints and sampling conventions are recorded in `assets/demos/library50/sources.json`.

## Sharpa grasps

The active hand choices are XHand, Allegro and Sharpa Wave. All five Sharpa grasps are newly optimized with separate object-specific contact/pose objectives in `scripts/sharpa-grasp-losses.py`. The accepted ten XHand/Allegro replay files are byte-for-byte unchanged. Every grasp uses the requested opposite front camera view.

Sharpa uses the official [MuJoCo Menagerie model](https://github.com/google-deepmind/mujoco_menagerie/tree/main/sharpa_wave): 22 native joints, original mass/inertia, original collision shapes and anatomical exclusions, with bounded position servos and frictional soft-finger contacts. The object remains an independently simulated free body under gravity. These are offline simulation replays, not hardware results or live learned-field optimization.

- Cup: only thumb and index contact the handle throughout the held phase; middle, ring and little fingers remain clear.
- Bottle: four fingers stay in the same object half-space, with the thumb opposite.
- Apple: downward-facing palm and top approach, with fingers preshaped before reaching the table.
- Duck: the existing native simulation mesh and physical size; the overview pose supplies the digit landing regions.
- Dumbbell: fingers wrap the central shaft from above, between the weights.

Final reproducible parameters are in `assets/lab/sharpa-grasp-presets.json`. `scripts/publish-sharpa-grasps.py` regenerates the free-body trajectories and attaches the existing xArm FK/IK model. To refresh its source export, pass a checked-out `sharpa_wave` model folder to `scripts/export-sharpa.py`. The Sharpa license is included in `assets/lab/sharpa-LICENSE.txt`.

## Validation

`npm run check` verifies the website JavaScript. Run `../simulator/.venv/bin/python scripts/validate-library50-sharpa.py` from this checkout to decode all 50 GIFs, check every thumbnail/poster, verify family counts and the ten preserved replays, and evaluate the five final Sharpa replays against joint limits, lift/contact/penetration, tabletop and arm clearance, and bottle/cup digit constraints. The delivered validation record is `docs/library50-sharpa-validation.json`.

A single final browser pass checked the five-column gallery, removed tabs, all five Sharpa selections and the live charts. The local HTTP audit checked 163 resources. Published asset verification is performed after pushing.

## Media generation

The remote inference sources are `scripts/generate-library50-media.py`, `scripts/render-library50-media.py`, and `scripts/rasterize-library50.cpp`. They reuse the existing dataset/checkpoint paths and FK helper under `/workspace/worldstring-general`; the original output is isolated under `/workspace/worldstring-demos/library50-sharpa-20261029`, and the full-resolution rigid export under `/workspace/worldstring-demos/library50-full256-20261029`. Compile the rasterizer into that output directory before running workers 0 (rigid) and 1 (soft). Original media and intermediate surfaces remain in the isolated output directory. `scripts/build-library50-catalog.py` builds the curated catalog and source-image crops from the local paper assets.
