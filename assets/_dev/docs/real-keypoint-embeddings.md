# Recorded XHand keypoint embeddings

The gradient panel replays a fresh optimization using the existing trained XHand
Occupancy+SDF model and trained static duck field. It displays every accepted
iterate, including the initial pose: 136 frames, 135 updates, 150 gradient
evaluations. Optimization took about 10 seconds on HAO-L40-2 GPU 0; no live demo
process or model checkpoint was changed.

Each heatmap row is the exact 128-dimensional `_joint_position_tokens` output
for one of the hand's 18 native FK keypoints, before the model resizes those
tokens to its 256-token conditioning representation. This is positional
encoding multiplied by the trained projection matrix, not a synthetic heatmap,
the separate learned offset table, PCA coordinates, or weight updates.

- **E**: the actual feature tensor, with all 18 x 128 values retained.
- **Delta E**: E at the current accepted optimizer step minus the preceding
  accepted step. The first frame is exactly zero.
- **dL/dE**: the actual loss gradient with respect to the same captured tensor.
- The skeleton is the native URDF FK at that same optimizer step. A fixed palm
  camera and one scale fit the entire recording; no hand poses or feature values
  are interpolated. Row swatches and matching KP colors show row RMS magnitude.
- Each view uses one symmetric scale for the full recording, at its 99th
  percentile of nonzero absolute values. Outliers saturate; hover reports the
  untouched float32 value. This makes normalization explicit and stable.
- The small neural-network glyphs are schematic; their nine color bins aggregate
  mean absolute feature gradients over nine consecutive channel ranges, averaged
  across KPs. They are not a literal layer or neuron count. Each network uses a
  fixed recording-wide 99th-percentile range with square-root color scaling and
  a separate lavender-to-magenta palette. The duck center uses its gradient RMS,
  scaled by the maximum RMS across the recording, in the keypoint palette.

The duck model has exactly one canonical center KP. It is held fixed during
optimization, so its embedding is bit-identical across frames and its Delta E is
zero. Its diagnostic gradient is nonzero and controls the center marker color.
Previous decorative surface KPs and CSS color cycles have been removed.

The loss retains the existing `CachedFKWrapLoss` hand/object contact and
penetration objective and adds 0.25 times the normalized fingertip-centroid
balance term. This is geometric centering, not a force-closure certificate.
Loss decreases from 53.54925156 to 4.27973080. This is offline geometric
optimization, not a new MuJoCo execution, lift-success test, or hardware trial.
The previously approved grasp playback assets are unchanged.

Both checkpoint paths, optimizer details, native names/edges, loss terms and
validation results are in `assets/lab/embedding/trace.json`. Binary tensors are
losslessly compressed float32 in `trace.f32.gz`. The exporter verifies that
recording changes neither objective values nor joint gradients (maximum error
zero over all frames), that both neural branches receive nonzero gradients,
and that frozen model tensors remain exactly unchanged. The website binary was
also compared directly against every raw exported tensor.

Reproduce in the existing remote environment with
`assets/_dev/scripts/export-grasp-embeddings.py`; outputs are isolated at
`HAO-L40-2:/workspace/worldstring-demos/kp-embedding-20261029/`. The original scene
supplies initialization only; all displayed updates are newly optimized.
Raw `optimizer.json` and `raw-telemetry.npz` remain in that folder. Re-running the
exporter reuses its own saved optimization when present; use a fresh output
folder for a new solve. Check the web data locally with
`node assets/_dev/scripts/check-grasp-embeddings.mjs`.
