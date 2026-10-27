import * as THREE from '../assets/vendor/three.module.js';
import {buildObject,createDeployHand} from '../assets/interactive-scenes.js';
import {optimizationTrace,sampleOptimization,posePolicyTask} from '../assets/policy-motion.js';
const rig=createDeployHand(),duck=buildObject('duck');duck.scale.setScalar(.32);
const samples=[];rig.hand.traverse(mesh=>{if(!mesh.isMesh)return;const v=mesh.geometry.attributes.position,index=mesh.geometry.index,points=[];for(let i=0;i<v.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(v,i));const n=index?index.count:v.count;for(let i=0;i<n;i+=3){const p=new THREE.Vector3();for(let j=0;j<3;j++)p.add(new THREE.Vector3().fromBufferAttribute(v,index?index.getX(i+j):i+j));points.push(p.multiplyScalar(1/3));}samples.push({mesh,points});});
const p=new THREE.Vector3(),q=new THREE.Vector3();let penetrations=0,minNormalizedRadius=Infinity,minHeight=Infinity,poses=0;
function check(){poses++;rig.hand.updateMatrixWorld(true);duck.updateMatrixWorld(true);const parts=duck.children.map(m=>m.matrixWorld.clone().invert());for(const {mesh,points} of samples)for(const point of points){p.copy(point).applyMatrix4(mesh.matrixWorld);minHeight=Math.min(minHeight,p.y);for(const inverse of parts){const radius=q.copy(p).applyMatrix4(inverse).length();minNormalizedRadius=Math.min(minNormalizedRadius,radius);if(radius<1-1e-6)penetrations++;}}}
for(let i=0;i<=200;i++){rig.hand.position.set(-.02,.62,0);duck.position.set(0,0,0);rig.setJointAngles(sampleOptimization(i/200).q);check();}
for(let episode=0;episode<3;episode++)for(let i=0;i<=230;i++){posePolicyTask(rig,duck,i*.05,episode);check();}
const trace=optimizationTrace().frames;
const result={sampledPoses:poses,surfaceSamplesPerPose:samples.reduce((n,s)=>n+s.points.length,0),penetrations,minNormalizedRadius,minHeight,optimizationIterations:trace.length-1,lossStart:trace[0].loss,lossEnd:trace.at(-1).loss,monotoneLoss:trace.every((f,i)=>!i||f.loss<=trace[i-1].loss),changedJoints:trace[0].q.filter((q,i)=>Math.abs(q-trace.at(-1).q[i])>.001).length};console.log(JSON.stringify(result,null,2));if(penetrations||minHeight<0||!result.monotoneLoss||result.changedJoints!==14)process.exitCode=1;
