import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {createLocalProjector} from '../../representation-constraints.js';
import {decodePoseAtlas,nearestPose} from '../../object-pose-atlas.js';
import {createObject} from '../../lab-objects.js';
import * as THREE from '../../vendor/three.module.js';

// Exercise the actual object implementation with the same delivered assets.
globalThis.fetch=async url=>new Response(await readFile(fileURLToPath(url)));
const assets=new URL('../../',import.meta.url);
const json=async path=>JSON.parse(await readFile(new URL(path,assets),'utf8'));
const catalog=await json('representation/catalog.json');
const results=[];
for(const id of process.argv.slice(2).length?process.argv.slice(2):['pliers','faucet','toilet','cabinet']){
 const source=catalog.find(o=>o.id===id),descriptor=await json('representation/'+source.constraints);
 const manifest=await json('lab/poses/'+id+'.json');
 const bytes=gunzipSync(await readFile(new URL('lab/poses/'+manifest.geometry,assets)));
 const frames=decodePoseAtlas(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 const projector=createLocalProjector(descriptor);
 assert.equal(frames.length,manifest.states.length);
 for(let i=0;i<frames.length;i++){
  const frame=frames[i],state=manifest.states[i];
  assert.equal(nearestPose(manifest,state),i);
  assert.deepEqual(projector.preview(state).state,state);
  assert(frame.positions.every(Number.isFinite));
  assert(frame.indices.every(v=>v<frame.count));
 }
 const o=await createObject({id,constrained:id,learnedSdf:true,color:'#96704c'},{points:100});
 await o.prepare();o.root.updateMatrixWorld(true);
 const controls=source.handles.map((_,i)=>i).filter(i=>o.canDrag(i));
 assert.equal(controls.length,id==='pliers'?1:2);
 const passive=source.handles.findIndex((_,i)=>!o.canDrag(i));
 const initial=JSON.stringify(o.state);o.drag(passive,new THREE.Vector3(99,99,99));assert.equal(JSON.stringify(o.state),initial);
 let endpointChecks=0;
 for(const handle of controls){
  const joint=descriptor.handle_joints[handle];
  for(const endpoint of descriptor.limits[joint]){
   o.reset();o.root.updateMatrixWorld(true);
   const wanted={...o.state,[joint]:endpoint===0?0:endpoint};
   const p=projector.preview(wanted).handles[handle];
   const world=o.surface.parent.localToWorld(new THREE.Vector3(...p));
   o.drag(handle,world);
   assert.deepEqual(o.state,wanted,`${id}: drag must reach the legal endpoint without changing another joint`);
   const frame=frames[nearestPose(manifest,wanted)];
   assert.deepEqual(o.surface.geometry.attributes.position.array,frame.positions,`${id}: display must be the complete inferred surface`);
   assert.deepEqual(o.surface.geometry.index.array,frame.indices,`${id}: use that pose's own topology`);
   endpointChecks++;
  }
  for(const far of [[20,20,20],[-20,-20,-20],[0,50,-50]]){
   o.drag(handle,new THREE.Vector3(...far));
   for(const [name,range] of Object.entries(descriptor.limits))assert(o.state[name]>=range[0]&&o.state[name]<=range[1]);
   assert.deepEqual(o.surface.geometry.attributes.position.array,frames[o.frameIndex].positions);
  }
 }
 o.reset();assert.deepEqual(o.state,source.state);
 o.setMode('occupancy');assert.equal(o.surface.visible,false);o.setMode('sdf',true);assert.equal(o.surface.visible,true);
 o.dispose();
 results.push({id,poses:frames.length,controls:controls.length,references:source.handles.length-controls.length,endpointChecks,wholeSurfaceMatches:true});
 console.log('PASS',id,frames.length,'inferred poses, limits, passive points, reset, exact surface/state pairing');
}
await mkdir(new URL('../../../.preview/pose-atlas-20261029/',import.meta.url),{recursive:true});
await writeFile(new URL('../../../.preview/pose-atlas-20261029/validation.json',import.meta.url),JSON.stringify(results,null,2));
