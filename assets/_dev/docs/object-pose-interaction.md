# Constrained object interaction — 2026-10-29

The former viewer inferred one resting surface and assigned each vertex to its
nearest native part. Triangles joining vertices with different part labels were
then stretched across moving parts. The resting meshes contained 364 such faces
for pliers, 282 for the faucet, 883 for the toilet and 2,119 for the cabinet.
The joint projector was bounded, but the displayed surface was not a valid
prediction for the edited pose.

These four objects now select complete independently inferred surfaces. The
offline bake uses the same simulator object identities, checkpoint, 256-resolution
corner grid (257 cubed queries), joint limits and bounded display smoothing.
Each complete surface is independently reduced to at most 24,000 triangles for
web delivery. The cabinet also uses the local simulator’s existing twelve-triangle
upper-drawer floor patch as a separately recorded display-only completion.
No face joins two poses; no vertex transport or blending is used.
The browser projects the cursor target to the legal joint range, selects the
nearest pre-inferred joint-grid state, and updates both the surface and all
keypoints to that exact state. This is discrete offline inference playback,
not live browser inference or a continuous interpolation of neural fields.

The atlas contains 244 poses: pliers 31, faucet 81, toilet 51 and cabinet 81.
Both endpoints and the original resting state are included for every joint.
Two-joint objects include the full Cartesian product, so editing one joint
preserves the other. Compressed surface atlases load on selection or playback;
controls remain unavailable until the matching surfaces have loaded. A failed
load is shown and can be retried without substituting a stretched surface.

Only the primary control for each rigid joint is interactive: one point on the
pliers and two each on the other three objects. The human has five controls;
each animal has six. Their existing constrained SMPL/SMAL projection and cached
surface skinning remain unchanged. Native XHand controls are limited to the
five distal digits. Other keypoints are three-pixel, non-interactive reference
dots; the fourteen-pixel controls support pointer and arrow-key input.

`assets/_dev/scripts/bake-object-poses.py` produces the compressed geometry and per-pose
provenance in `assets/lab/poses/`. `npm --prefix assets run check:objects` exercises the delivered
object code, all atlas frames, both joint limits, independent joint motion,
passive points, reset and exact equality between the displayed geometry and
the selected inference frame. A browser mouse-drag check additionally verifies
real pointer interaction and the control/reference-point distinction.
