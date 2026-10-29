// Complete, independently inferred surfaces. A pose is selected, never warped.
const pending = new Map();
const base = new URL('./lab/poses/', import.meta.url);

export function decodePoseAtlas(buffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 20 || String.fromCharCode(...new Uint8Array(buffer, 0, 4)) !== 'AWPS' || view.getUint32(4, true) !== 1) throw Error('Invalid pose atlas');
  const count = view.getUint32(8, true), start = 16 + (count + 1) * 4;
  if (!count || start > buffer.byteLength) throw Error('Invalid pose atlas index');
  const offsets = new Uint32Array(buffer, 16, count + 1);
  if (offsets[0] !== 0 || start + offsets[count] !== buffer.byteLength) throw Error('Incomplete pose atlas');
  return Array.from({length: count}, (_, i) => {
    const at = start + offsets[i], end = start + offsets[i + 1];
    if (at + 8 > end) throw Error('Invalid pose frame');
    const vertices = view.getUint32(at, true), faces = view.getUint32(at + 4, true);
    if (!vertices || !faces || at + 8 + vertices * 12 + faces * 12 !== end) throw Error('Invalid pose geometry');
    return {positions: new Float32Array(buffer, at + 8, vertices * 3), indices: new Uint32Array(buffer, at + 8 + vertices * 12, faces * 3), count: vertices};
  });
}

export function nearestPose(manifest, state) {
  let index = 0;
  manifest.joints.forEach((name, axis) => {
    const values = manifest.axes[axis];
    let nearest = 0;
    values.forEach((v, i) => {if (Math.abs(v - state[name]) < Math.abs(values[nearest] - state[name])) nearest = i;});
    index = index * values.length + nearest;
  });
  return index;
}

export function loadPoseAtlas(id) {
  if (!pending.has(id)) pending.set(id, (async () => {
    const response = await fetch(new URL(id + '.json?v=20261029-constrained-poses-v1', base));
    if (!response.ok) throw Error('Pose manifest unavailable');
    const manifest = await response.json();
    const binary = await fetch(new URL(manifest.geometry+'?v=20261029-constrained-poses-v1', base));
    if (!binary.ok) throw Error('Pose surfaces unavailable');
    const buffer = await new Response(binary.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const frames = decodePoseAtlas(buffer);
    if (frames.length !== manifest.states.length) throw Error('Pose surface/state mismatch');
    return {manifest, frames};
  })().catch(error => {pending.delete(id); throw error;}));
  return pending.get(id);
}
