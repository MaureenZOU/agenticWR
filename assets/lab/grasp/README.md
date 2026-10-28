# Grasp replays

Fifteen offline MuJoCo contact simulations: XHand, Allegro, and Shadow Hand × cup, duck, dumbbell, bottle, and apple. Every object starts directly on a flat table. Each pair has its own forward approach, wrist roll, open pregrasp, finger closure, and timing, followed by a lift and two lateral oscillations. The arm stays behind the hand's forward reach. Native hand link geometry and joint limits come from `rigs.json`; compound prop collision geometry is recorded in each file.

The cup handle faces sideways, with finger entry through the handle plane; only the handle supports the cup during the hold. The dumbbell is grasped around its central shaft, without supporting its weights. Bottles use a side wrap, and ducks and apples use a forward body grasp. Cup and dumbbell proportions were adjusted for native hand clearance, the Allegro duck uses scale 1.2, and Shadow uses a shorter, wider bottle. These are demo props rather than matched experimental objects.

The object is a free body under gravity. The controller commands bounded finger actuators and a dynamic wrist welded to a moving target. Cup closure uses bounded wrist compensation from measured object displacement to counter lateral drag. There is no object weld or object-pose command after reset. The xArm7 follows the wrist with offline inverse kinematics and native arm-mesh table clearance; this does not validate arm dynamics or hardware performance.

Presets were refined against contact acquisition, table clearance, hand/object penetration, object tilt, drift, and retention during lift and shake. This follows the earlier local campaign's failure-conditioned refinement approach; no new GPT or RL training was run. The chart reports a sampled surface-distance and penetration loss along physical execution. These are illustrative contact demonstrations, not live AWR inference or paper benchmark results. The adjacent frozen-network diagram describes the AWR method.

All 15 trajectories are checked for retained contact through both shakes, lift, contact penetration, table clearance, and forward arm alignment. Cup and dumbbell runs additionally require handle-only and shaft-only contacts during the hold. Each replay retains its own measurements and provenance in `physics` and `provenance`.

The joint chart shows one named joint per finger in degrees, with native joint identifiers in each legend tooltip. The grasp optimization loss chart uses time in seconds and the measured loss values, without forcing a monotonic curve.

To rebuild from the parent WorldString checkout:

```sh
simulator/.venv/bin/python agenticWR/scripts/rebuild-grasp-set.py
```

The website loads saved JSON locally; it needs no Python, MuJoCo, checkpoint, or inference server.
