# Grasp replays

Fifteen offline MuJoCo contact simulations: XHand, Allegro, and Shadow Hand × cup, duck, dumbbell, bottle, and apple. Every object starts directly on a flat table. Each pair has its own forward approach, wrist roll, open pregrasp, finger closure, and timing, followed by a lift and two lateral oscillations. The arm stays behind the hand's forward reach. Native hand link geometry and joint limits come from `rigs.json`; compound prop collision geometry is recorded in each file.

The cup handle faces sideways, with finger entry through the handle plane; only the handle supports the cup during the hold. The dumbbell is grasped around its central shaft, without supporting its weights. Bottles use identical geometry for all three hands. Shadow's bottle grasp has all four fingertips on one side and the thumb on the opposite side, with a palm-first approach. Apples retain their accepted downward-facing palm and vertical approach. Cup and dumbbell proportions retain their previously accepted dimensions.

All three ducks use the existing simulation mesh at its original **125 × 92.6556 × 102.5779 mm** size. `assets/lab/duck-native.json` contains the original 7,912 vertices / 15,820 triangles and all 16 collision meshes. The only transform is a 180-degree yaw to face the tail toward the arm. No shape edits, scaling, extra eyes, or marker balls are added. Visual geometry, collision geometry, mass and inertia come from `/workspace/worldstring-lightning-grasp-20261006/assets/duck/` on HAO-L40-2. The three native hand models remain unchanged.

The object is a free body under gravity. The controller commands bounded finger actuators and a dynamic wrist welded to a moving target. Cup closure uses bounded wrist compensation from measured object displacement to counter lateral drag. There is no object weld or object-pose command after reset. The xArm7 follows the wrist with offline inverse kinematics and native arm-mesh table clearance; this does not validate arm dynamics or hardware performance.

Seven separate objectives in `scripts/seven-grasp-losses.py` optimize native joint angles and wrist translation. Palm orientation is fixed by the requested approach. Each objective specifies its own digit landing regions and joint coordination; they share native mesh contact, whole-finger separation, object penetration and table/pregrasp clearance calculations. Small physical refinements retain the same grasp family. No GPT or RL training was run.

| Pair | Objective |
| --- | --- |
| XHand / duck | Opposing thumb and four fingers around the rear body; coordinated proximal and distal flexion |
| Allegro / duck | Raised thumb landing for its shorter thumb, three fingers spread around the body |
| Shadow / duck | Four-finger basket, independent thumb opposition, coupled distal flexion |
| XHand / apple | Opposing thumb and four fingers around the equator, coordinated flexion |
| Allegro / apple | Thumb against a three-finger tripod below the stem |
| Shadow / apple | Thumb/index opposition, remaining fingers around the shoulder |
| Shadow / bottle | Four fingertips constrained to one half-space, thumb to the other; coordinated four-finger flexion and a palm-first approach |

For these seven pairs, the chart evaluates the named objective along the actual physical replay in the moving object's frame; the horizontal axis is simulation time, not optimizer iterations. The other eight accepted replays retain their prior contact diagnostic. These are illustrative contact demonstrations, not live AWR inference or paper benchmark results. The adjacent frozen-network diagram describes the AWR method.

All 15 trajectories are checked for retained contact through both shakes, lift, contact penetration, table clearance, and forward arm alignment. Cup and dumbbell runs additionally require handle-only and shaft-only contacts during the hold. Each replay retains its own measurements and provenance in `physics` and `provenance`.

The revised pairs also check the required palm/approach direction, duck heading and exact source scale, shared bottle geometry, cross-finger separation, object tilt, and native arm IK. Shadow's bottle fingertip half-spaces are checked throughout the lift and hold. The Allegro duck scene sits 10 cm closer to the arm to keep its frontal wrist pose within reach. Arm dynamics and hardware performance are not validated. Human visual acceptance is still required for naturalness.

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

Candidate fitting writes only to `.preview/`. The current round uses `install-four-grasps.py`, which installs only the three native-duck pairs and Shadow bottle after validation and verifies that all eleven accepted trajectories, including the three apples, remain byte-identical. It writes its review sheet and validation to `.preview/four-grasps-20261029/`. None of these scripts commits, pushes, or deploys. The published baseline is commit `939984f`; the new iteration remains local pending approval.

The website loads saved JSON locally; it needs no Python, MuJoCo, checkpoint, or inference server.
