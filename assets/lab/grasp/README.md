# Grasp replays

Fifteen offline MuJoCo contact simulations: XHand, Allegro, and Shadow Hand × cup, duck, dumbbell, bottle, and apple. Every object starts directly on a flat table. Each pair has its own forward approach, wrist roll, open pregrasp, finger closure, and timing, followed by a lift and two lateral oscillations. The arm stays behind the hand's forward reach. Native hand link geometry and joint limits come from `rigs.json`; compound prop collision geometry is recorded in each file.

The cup handle faces sideways, with finger entry through the handle plane; only the handle supports the cup during the hold. The dumbbell is grasped around its central shaft, without supporting its weights. Bottles use identical geometry for all three hands. Shadow's bottle grasp has all four fingertips on one side and the thumb on the opposite side, with a palm-first approach. Apples retain their accepted downward-facing palm and vertical approach. Cup and dumbbell proportions retain their previously accepted dimensions.

All three ducks use the existing simulation mesh at its original **125 × 92.6556 × 102.5779 mm** size. `assets/lab/duck-native.json` contains the original 7,912 vertices / 15,820 triangles and all 16 collision meshes. The only transform is a 180-degree yaw to face the tail toward the arm. No shape edits, scaling, extra eyes, or marker balls are added. Visual geometry, collision geometry, mass and inertia come from `/workspace/worldstring-lightning-grasp-20261006/assets/duck/` on HAO-L40-2. The three native hand models remain unchanged.

The object is a free body under gravity. The controller commands bounded finger actuators and a dynamic wrist welded to a moving target. Cup closure uses bounded wrist compensation from measured object displacement to counter lateral drag. There is no object weld or object-pose command after reset. The xArm7 follows the wrist with offline inverse kinematics and native arm-mesh table clearance; this does not validate arm dynamics or hardware performance.

The three duck grasps share `scripts/duck-overview-loss.py`, retargeting the final accepted pose in the overview Keypoint optimization video. `assets/lab/duck-grasp-reference.json` records the source pose, native joint-name mapping, original cached XHand contact probes and weight constants. Fingers bend horizontally around the duck body, with an opposing thumb; the initial wrist pose changes accordingly. The common objective retains the original size-normalized pad (60), palm (12), loose-tip (3), probe-penetration (900) and closure (0.5) terms, with doubled thumb weights and the source R5 clearance of 0.005 times the object radius. Native collision-geometry queries replace the source neural fields; reference keypoint, whole-link, inter-finger and table-clearance terms adapt the pose to each hand and the physical tabletop. Cross-digit physical contacts are enabled for these three replays; overlapping same-digit links and palm mounts remain excluded by native anatomy. Other hands use native link-surface probes under the same formulas. The accepted apples and Shadow bottle retain their independent objectives in `scripts/seven-grasp-losses.py`. No GPT or RL training was run.

| Pair | Objective |
| --- | --- |
| XHand / duck | Shared overview wrap; original cached probes and reference joint pose |
| Allegro / duck | Same overview wrap and weights, retargeted to three fingers and thumb |
| Shadow / duck | Same overview wrap and weights, retargeted to four fingers and thumb |
| XHand / apple | Opposing thumb and four fingers around the equator, coordinated flexion |
| Allegro / apple | Thumb against a three-finger tripod below the stem |
| Shadow / apple | Thumb/index opposition, remaining fingers around the shoulder |
| Shadow / bottle | Four fingertips constrained to one half-space, thumb to the other; coordinated four-finger flexion and a palm-first approach |

For these seven pairs, the chart evaluates the named objective along the actual physical replay in the moving object's frame; the horizontal axis is simulation time, not optimizer iterations. The other eight accepted replays retain their prior contact diagnostic. These are illustrative contact demonstrations, not live AWR inference or paper benchmark results. The adjacent frozen-network diagram describes the AWR method.

All 15 trajectories are checked for retained contact through both shakes, lift, contact penetration, table clearance, and forward arm alignment. Cup and dumbbell runs additionally require handle-only and shaft-only contacts during the hold. Each replay retains its own measurements and provenance in `physics` and `provenance`.

The revised pairs also check the required palm/approach direction, duck heading and exact source scale, shared bottle geometry, cross-finger separation, object tilt, and native arm IK. Shadow's bottle fingertip half-spaces are checked throughout the lift and hold. Each duck also checks its wrist orientation against the overview reference. Allegro and Shadow duck scenes sit 10 cm closer to the fixed arm base for wrist reach and table clearance. Arm dynamics and hardware performance are not validated. Human visual acceptance is still required for naturalness.

The joint chart shows one named joint per finger in degrees, with native joint identifiers in each legend tooltip. The grasp optimization loss chart uses time in seconds and the measured loss values, without forcing a monotonic curve.

To rebuild from the parent WorldString checkout:

```sh
simulator/.venv/bin/python agenticWR/scripts/rebuild-grasp-set.py
```

To fit new candidates or validate the installed seven:

```sh
simulator/.venv/bin/python agenticWR/scripts/refine-seven-grasps.py
simulator/.venv/bin/python agenticWR/scripts/validate-seven-grasps.py
simulator/.venv/bin/python agenticWR/scripts/render-seven-grasps.py --final
```

The final duck round uses:

```sh
simulator/.venv/bin/python agenticWR/scripts/refine-overview-ducks.py --seeds 3
simulator/.venv/bin/python agenticWR/scripts/install-overview-ducks.py
simulator/.venv/bin/python agenticWR/scripts/install-overview-ducks.py --install
```

Candidate fitting and staging write to `.preview/duck-overview-final-20261029/`. Installation verifies all twelve accepted non-duck trajectories against the pre-iteration snapshots, then writes only the three duck replays and their presets. Offline multi-view images and numerical reports are retained in that review directory. These scripts never commit, push or deploy. The pre-duck checkpoint was published as `88dc736`; the final duck update is authorized for publication after its checks pass.

The website loads saved JSON locally; it needs no Python, MuJoCo, checkpoint, or inference server.
