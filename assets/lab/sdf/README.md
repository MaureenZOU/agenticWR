# Learned SDF display surfaces

These eight meshes come from the local WorldString representation cache, with `field: learned_sdf_zero`, evaluated at resolution 256. `catalog.json` records the original checkpoint, pose, cache file, and processing for each object.

For the static website, the exporter removes tiny detached components, repairs small holes, and reduces each mesh to 32,000 triangles. All exported meshes have zero open boundary edges. Existing cache smoothing is recorded separately in the manifest. Real object cavities and articulation are retained.

The initial surfaces are cached model outputs. Browser dragging applies native articulation or skinning to those surfaces; it does not run the WorldString model again at every pose. The browser uses the same deformed geometry for surface and occupancy views. The displayed normals are mesh normals.

Rebuild from the parent WorldString checkout with `simulator/.venv/bin/python agenticWR/scripts/export-learned-sdf.py`. The static website needs none of the Python dependencies or source checkpoints.
