import * as THREE from './vendor/three.module.js';
import {buildObject,createDeployHand,poseDeployObjects,disposeObject} from './interactive-scenes.js';

export const OPEN_ANGLES=[...Array.from({length:4},()=>[.48,0,0]).flat(),-.35,-.12];
export const TARGET_ANGLES=[...Array.from({length:4},()=>[.07,-.15,-.30]).flat(),.15,0];
let cachedTrace;

// A small, deterministic teaching optimization on the displayed hand's forward kinematics.
// These values describe this illustration, not manuscript experiments or a trained policy.
export function optimizationTrace(){
  if(cachedTrace)return cachedTrace;
  const rig=createDeployHand(),duck=buildObject('duck');duck.scale.setScalar(.32);duck.updateMatrixWorld(true);rig.hand.position.set(-.02,.62,0);
  const inverseParts=duck.children.map(m=>m.matrixWorld.clone().invert()),p=new THREE.Vector3(),q=new THREE.Vector3();
  const samples=[];rig.hand.traverse(mesh=>{if(mesh.isMesh)samples.push({mesh,vertices:mesh.geometry.attributes.position});});
  function apply(angles){rig.setJointAngles(angles);rig.hand.updateMatrixWorld(true);}
  apply(TARGET_ANGLES);
  const targets=rig.tips.map(tip=>tip.getWorldPosition(new THREE.Vector3())),weights=[1.1,.85,1,.75,1.25];
  function objective(angles){
    apply(angles);
    const contact=rig.tips.reduce((sum,tip,i)=>sum+weights[i]*tip.getWorldPosition(p).distanceToSquared(targets[i]),0)*12;
    const pose=angles.reduce((sum,v,i)=>sum+(v-TARGET_ANGLES[i])**2,0)*.018;
    return {loss:contact+pose,contact,pose,penetration:0};
  }
  function clear(){
    for(const {mesh,vertices} of samples)for(let i=0;i<vertices.count;i++){
      p.fromBufferAttribute(vertices,i).applyMatrix4(mesh.matrixWorld);
      for(const inverse of inverseParts)if(q.copy(p).applyMatrix4(inverse).lengthSq()<1.00001)return false;
    }
    return true;
  }
  let angles=[...OPEN_ANGLES],state=objective(angles);const frames=[{q:[...angles],...state,gradient:Array(14).fill(0)}];
  for(let k=0;k<100;k++){
    const gradient=angles.map((v,j)=>{const a=[...angles],b=[...angles];a[j]=v+.0001;b[j]=v-.0001;return (objective(a).loss-objective(b).loss)/.0002;});
    let rate=.2,candidate,next;
    for(let line=0;line<12;line++){
      candidate=angles.map((v,j)=>THREE.MathUtils.clamp(v-THREE.MathUtils.clamp(rate*gradient[j],-(.018+.003*(j%4)),.018+.003*(j%4)),Math.min(OPEN_ANGLES[j],TARGET_ANGLES[j]),Math.max(OPEN_ANGLES[j],TARGET_ANGLES[j])));
      next=objective(candidate);
      if(next.loss<=state.loss&&clear())break;
      rate*=.5;
    }
    if(next.loss>state.loss||!clear()){candidate=[...angles];next=objective(candidate);}
    angles=candidate;state=next;frames.push({q:[...angles],...state,gradient});
    if(state.loss<frames[0].loss*1e-5)break;
  }
  const initial=frames[0].loss;
  frames.forEach((frame,i)=>{frame.iteration=i;frame.relativeLoss=frame.loss/initial;});
  disposeObject(rig.hand);disposeObject(duck);
  cachedTrace={frames,targets:targets.map(p=>p.toArray())};return cachedTrace;
}

export function sampleOptimization(progress){
  const {frames}=optimizationTrace(),f=THREE.MathUtils.clamp(progress,0,1)*(frames.length-1),a=Math.floor(f),b=Math.min(a+1,frames.length-1),t=f-a;
  return {...frames[a],q:frames[a].q.map((v,i)=>THREE.MathUtils.lerp(v,frames[b].q[i],t))};
}

export function posePolicyTask(rig,duck,time,episode=0){
  const pose=poseDeployObjects(rig.hand,duck,time),shift=-duck.position.x*.45;
  const z=[-.12,.10,0][episode%3];rig.hand.position.x+=shift;duck.position.x+=shift;rig.hand.position.z=z;duck.position.z=z;
  const target=optimizationTrace().frames.at(-1).q;
  const angles=OPEN_ANGLES.map((v,i)=>THREE.MathUtils.lerp(v,target[i],pose.close));rig.setJointAngles(angles);
  return {...pose,q:angles,stage:pose.t<1.6?'Approach':pose.t<2.9?'Close fingers':pose.t<4.3?'Lift':pose.t<6.6?'Transport':pose.t<8.3?'Place':'Release'};
}
