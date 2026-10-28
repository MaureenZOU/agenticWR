import { THREE,resource,geometry,material,copy } from './lab-scene.js';
import { createLocalProjector } from './representation-constraints.js';
import { decodeGeometry,geometryFor,orientation,sampleSurface,updateSamples,normalLines,deform } from './representation-workbench.js';
const cache=new Map();
export async function createObject(meta,{size=.34,points=4500,placement=null}={}){
 let data,descriptor,source;
 if(meta.id==='cabinet')meta={...meta,constrained:'cabinet'};
 if(meta.constrained){
  const catalog=await resource('./representation/catalog.json');source=catalog.find(o=>o.id===meta.constrained);
  const key=source.id+(meta.learnedSdf?'-learned':'');
  if(!cache.has(key))cache.set(key,Promise.all([resource('./representation/'+source.constraints),fetch(new URL(meta.learnedSdf?'./lab/sdf/'+source.id+'.bin':'./representation/'+source.geometry,import.meta.url)).then(r=>{if(!r.ok)throw Error('SDF surface unavailable');return r.arrayBuffer();}).then(decodeGeometry)]));
  [descriptor,data]=await cache.get(key);
 }
 const g=data?geometryFor(data):geometry(await resource('./lab/'+meta.geometry));
 const display=new THREE.Group(),basis=new THREE.Group();display.add(basis);
 if(source&&!placement)basis.quaternion.copy(orientation(source.id,descriptor));
 const surface=new THREE.Mesh(g,material(meta.color));surface.castShadow=true;surface.receiveShadow=true;basis.add(surface);
 const samples=sampleSurface(g,points);updateSamples(samples,g);const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(samples.positions,3));
 const cloud=new THREE.Points(pg,new THREE.PointsMaterial({color:meta.color,size:.008,sizeAttenuation:true}));cloud.frustumCulled=false;cloud.visible=false;basis.add(cloud);
 const ng=new THREE.BufferGeometry();ng.setAttribute('position',normalLines(samples));const arrows=new THREE.LineSegments(ng,new THREE.LineBasicMaterial({color:0x30434f}));arrows.visible=false;basis.add(arrows);
 basis.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(surface),extent=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());if(placement){display.position.fromArray(placement.position);display.quaternion.fromArray(placement.quaternion);display.scale.setScalar(placement.scale);}else{display.scale.setScalar(size/Math.max(...extent));basis.position.copy(center).negate();basis.position.y+=extent.y*.5;}
 let projector,restFrames,preview,state=source?copy(source.state):null;
 if(source){projector=createLocalProjector(descriptor);preview=projector.preview(state);restFrames=source.parts.map(part=>({part,inverse:new THREE.Matrix4().set(...projector.partTransforms.get(part)).invert()}));}
 const original=g.attributes.position.array.slice();const bounds=g.boundingBox.clone(),span=bounds.getSize(new THREE.Vector3());
 const anchorVertices=[];const anchors=[];
 if(!source){for(const dir of [[-1,0,0],[1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){let id=0,best=-Infinity;for(let i=0;i<original.length/3;i++){const score=dir.reduce((s,x,j)=>s+x*original[i*3+j],0);if(score>best){best=score;id=i;}}anchorVertices.push(id);anchors.push(new THREE.Vector3().fromArray(original,id*3));}}
 let offsets=anchors.map(()=>new THREE.Vector3()),mode='sdf',normals=false;
 const humanControls=new Set(['Head','Left shoulder','Right shoulder','Left elbow','Right elbow','Left wrist','Right wrist','Left knee','Right knee','Left ankle','Right ankle','Left foot','Right foot']);
 const animalControls=new Set(['Head','Neck','Left front elbow','Right front elbow','Left front foot','Right front foot','Left rear knee','Right rear knee','Left rear foot','Right rear foot','Tail tip']);
 const handleIndices=source?source.handles.map((h,i)=>h.draggable&&(source.id==='human'?humanControls.has(h.label):descriptor.type==='skinning'?animalControls.has(h.label):true)?i:-1).filter(i=>i>=0):anchors.map((_,i)=>i);
 function update(){if(source)preview=deform(data,projector,state,g,restFrames);else{const p=g.attributes.position.array;for(let i=0;i<p.length/3;i++){const v=new THREE.Vector3().fromArray(original,i*3),delta=new THREE.Vector3();anchors.forEach((a,j)=>{const strength=Math.exp(-v.distanceToSquared(a)/(.12*span.lengthSq()));delta.addScaledVector(offsets[j],strength);});v.add(delta).toArray(p,i*3);}g.attributes.position.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();}
 updateSamples(samples,g);pg.attributes.position.needsUpdate=true;if(normals)ng.setAttribute('position',normalLines(samples));}
 function handles(){basis.updateMatrixWorld(true);return source?handleIndices.map(i=>basis.localToWorld(new THREE.Vector3(...preview.handles[i]))):anchorVertices.map(i=>basis.localToWorld(new THREE.Vector3().fromArray(g.attributes.position.array,i*3)));}
 function drag(i,point){basis.updateMatrixWorld(true);const target=basis.worldToLocal(point.clone());if(source)state=projector.project(state,handleIndices[i],target.toArray()).state;else offsets[i].copy(target).sub(anchors[i]);update();}
 function animate(t){const wave=.5-.5*Math.cos(t*.8);
  if(source){state=copy(source.state);if(descriptor.type==='skinning'){const pose=state.pose;for(let j=3;j<Math.min(pose.length,66);j+=6)pose[j]+=.11*Math.sin(t*1.4+j*.7);}else{const names=Object.keys(state);names.forEach((name,i)=>{if(typeof state[name]!=='number')return;const limits=descriptor.joint_limits?.[name]||projector.limits?.[name];if(limits)state[name]=THREE.MathUtils.lerp(limits[0],limits[1],.13+.36*(.5-.5*Math.cos(t*.8+i*.6)));});}update();}
  else if(meta.family==='deformable'||meta.family==='skinned'){offsets.forEach((o,i)=>o.set(Math.sin(t*1.1+i)*.025,Math.sin(t*1.3+i*.8)*.05,Math.cos(t+i)*.02));update();}
  else display.rotation.y=.12*Math.sin(t*.7);
 }
 function setMode(next,normal=false){mode=next;normals=normal;surface.visible=mode!=='occupancy';cloud.visible=mode==='occupancy';arrows.visible=normals&&mode==='sdf';if(arrows.visible)ng.setAttribute('position',normalLines(samples));}
 return {meta,root:display,surface,handles,handleLabels:handleIndices.map(i=>source?.handles[i]?.label||`Keypoint ${i+1}`),drag,animate,setMode,reset(){if(source)state=copy(source.state);else offsets.forEach(v=>v.set(0,0,0));if(!placement)display.rotation.set(0,0,0);update();},dispose(){g.dispose();pg.dispose();ng.dispose();surface.material.dispose();cloud.material.dispose();arrows.material.dispose();},get state(){return state||offsets.map(v=>v.toArray());}};
}
