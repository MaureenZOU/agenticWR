import * as THREE from '../assets/vendor/three.module.js';
import {buildObject,createDeployHand,poseDeployObjects,field} from '../assets/interactive-scenes.js';
const {hand,setGrip}=createDeployHand(),duck=buildObject('duck');duck.scale.setScalar(.32);
const samples=[];hand.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const positions=mesh.geometry.attributes.position,index=mesh.geometry.index,points=[];
  for(let i=0;i<positions.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(positions,i));
  const n=index?index.count:positions.count;
  for(let i=0;i<n;i+=3){const center=new THREE.Vector3();for(let j=0;j<3;j++)center.add(new THREE.Vector3().fromBufferAttribute(positions,index?index.getX(i+j):i+j));points.push(center.multiplyScalar(1/3));}
  samples.push({mesh,points});
});
const p=new THREE.Vector3(),q=new THREE.Vector3();let minRadius=Infinity,minY=Infinity,penetrations=0,worstTime=0;
for(let step=0;step<=230;step++){
  const time=step*.05,pose=poseDeployObjects(hand,duck,time);setGrip(pose.close);hand.updateMatrixWorld(true);duck.updateMatrixWorld(true);
  const parts=duck.children.map(mesh=>mesh.matrixWorld.clone().invert());
  for(const {mesh,points} of samples)for(const point of points){
    p.copy(point).applyMatrix4(mesh.matrixWorld);minY=Math.min(minY,p.y);
    for(const inverse of parts){const radius=q.copy(p).applyMatrix4(inverse).length();if(radius<minRadius){minRadius=radius;worstTime=time;}if(radius<1-1e-6)penetrations++;}
  }
}
let occupiedCavity=0;
for(let x=-.38;x<=.38;x+=.01)for(let y=.22;y<=.99;y+=.01)if(field('mug',x,y,0)<0)occupiedCavity++;
const mug=buildObject('mug'),handle=mug.children[1],v=new THREE.Vector3();handle.updateMatrixWorld(true);let minHandleX=Infinity;
for(let i=0;i<handle.geometry.attributes.position.count;i++){v.fromBufferAttribute(handle.geometry.attributes.position,i).applyMatrix4(handle.matrixWorld);minHandleX=Math.min(minHandleX,v.x);}
const result={sampledPoses:231,surfaceSamplesPerPose:samples.reduce((n,s)=>n+s.points.length,0),penetratingSamples:penetrations,minNormalizedDuckRadius:minRadius,worstTime,minHandHeight:minY,cupCavityOccupiedSamples:occupiedCavity,minHandleX};
console.log(JSON.stringify(result,null,2));
if(penetrations||minY<0||occupiedCavity||minHandleX<.41)process.exitCode=1;
