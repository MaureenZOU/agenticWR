import * as THREE from './vendor/three.module.js';
import {sceneBase,buildObject,createDeployHand} from './interactive-scenes.js';
import {optimizationTrace,sampleOptimization,posePolicyTask,OPEN_ANGLES,TARGET_ANGLES} from './policy-motion.js';

const purple=0x7846b8,orange=0xff6841;
const names=['Index','Middle','Ring','Little','Thumb'];
const phases=['AWR frozen geometry','Loss → joint updates','AWR demonstrations','Demonstrations → policy'];
const smooth=t=>{const v=THREE.MathUtils.clamp(t,0,1);return v*v*(3-2*v);};
const mat=(color,opacity=1)=>new THREE.MeshStandardMaterial({color,roughness:.6,transparent:opacity<1,opacity});
const add=(parent,geometry,color,position=[0,0,0])=>{const mesh=new THREE.Mesh(geometry,mat(color));mesh.position.set(...position);parent.add(mesh);return mesh;};
const jointPanel=()=>`<div class="joint-readout"><div class="workbench-label">14 JOINT ANGLES <span>q₁ … q₁₄</span></div>${names.map((name,i)=>`<div class="joint-row"><span>${name}</span><div class="joint-bars">${Array.from({length:i===4?2:3},(_,j)=>`<span><i data-joint-bar="${i===4?12+j:i*3+j}"></i></span>`).join('')}</div><output data-joint-value="${i}"></output></div>`).join('')}</div>`;
const lossPanel=()=>`<div class="loss-readout"><div class="workbench-label">RELATIVE LOSS <output data-loss>1.000</output></div><svg class="loss-chart" viewBox="0 0 240 90" role="img" aria-label="Loss decreases as the hand joint angles are optimized"><path d="M12 9V72H229 M12 40H229" fill="none" stroke="#e4d7ed" stroke-width="1"/><path data-loss-trail fill="none" stroke="#ff6841" stroke-width="2.5"/><circle data-loss-dot r="3.5" fill="#7846b8"/><text x="12" y="87">0</text><text x="229" y="87" text-anchor="end">iterations</text></svg><div class="loss-terms"><span>Contact <b data-contact></b></span><span>Penetration <b data-penetration>0</b></span><span>Pose <b data-pose></b></span></div><div class="update-rule">q ← q − η ∇q L</div></div>`;
const demoPanel=()=>`<div class="demo-readout"><div class="workbench-label">STATE-ACTION PAIRS <output data-pair-count>0 / 72</output></div><div class="episode-tabs">${[0,1,2].map(i=>`<span data-episode="${i}">Placement 0${i+1}</span>`).join('')}</div><div class="record-rows">${['Approach','Contact','Lift'].map((name,i)=>`<div data-record="${i}"><i></i><span>${name}</span><code>sₜ → a*ₜ</code><b>○</b></div>`).join('')}</div><p>Keypoints + optimized joint actions → demonstrations</p></div>`;
const networkPanel=()=>`<div class="network-readout"><div class="workbench-label"><span data-network-state>LEARN FROM DEMONSTRATIONS</span><span>πφ</span></div><svg viewBox="0 0 430 108" role="img" aria-label="Demonstrations train a policy that maps observed object keypoints to hand joint actions"><g fill="none" stroke="#d8c5e7">${[0,1].map(col=>[0,1,2].map(row=>[0,1,2].map(next=>`<path d="M${177+col*38} ${27+row*22}L${215+col*38} ${27+next*22}"/>`).join('')).join('')).join('')}<path d="M112 49H164 M268 49H306"/></g><g data-network-nodes>${[0,1,2].map(col=>[0,1,2].map(row=>`<circle cx="${177+col*38}" cy="${27+row*22}" r="4" fill="#a787c9"/>`).join('')).join('')}</g><g fill="#faf7fd" stroke="#dac8e7"><rect x="8" y="17" width="104" height="65" rx="10"/><rect x="306" y="17" width="116" height="65" rx="10"/></g><g fill="#7846b8" font-size="12" text-anchor="middle"><text x="60" y="44" data-network-input>(sₜ, a*ₜ)</text><text x="60" y="64" font-size="9" data-network-input-label>demonstrations</text><text x="364" y="44">14 joint angles</text><text x="364" y="64" font-size="9">aₜ = πφ(sₜ)</text><text x="215" y="101" font-size="10">LBC = ‖πφ(sₜ) − a*ₜ‖²</text></g><circle data-flow-packet r="3" fill="#ff6841"/></svg><div class="policy-task-steps"><span data-task-step="0">Observe</span><i>→</i><span data-task-step="1">Act</span><i>→</i><span data-task-step="2">Grasp & lift</span></div></div>`;

export function mountPolicyScene(container,{phase=1,compact=false}={}){
  const trace=optimizationTrace(),duration=phase===2?34.5:phase===3?15.5:phase===0?10:12;
  const telemetry=phase===1?lossPanel()+jointPanel():phase===2?demoPanel()+jointPanel():phase===3?networkPanel()+jointPanel():`<div class="field-readout"><div class="workbench-label">AWR · FROZEN GEOMETRY</div><div class="field-query-row"><span>Occupancy</span><i>→</i><span>Contact surface</span></div><div class="field-query-row"><span>Signed distance</span><i>→</i><span>Separation</span></div><div class="field-query-row"><span>Surface normal</span><i>→</i><span>Contact direction</span></div><p>Optimize the hand configuration q; keep the neural geometry fixed.</p></div>`;
  container.innerHTML=`<div class="policy-workbench ${compact?'compact-workbench':''}" data-animation-phase="${phase}"><div class="workbench-top"><span>${phases[phase]}</span><output data-workbench-status></output></div><div class="workbench-stage"><div class="policy-canvas"></div><div class="workbench-badge" data-scene-badge></div><div class="workbench-annotation" data-scene-annotation></div></div><div class="policy-telemetry ${phase===0?'single':''}">${telemetry}</div><div class="workbench-playback"><span>AWR method illustration</span><button class="text-button" data-workbench-restart aria-label="Restart this animation">↶ Restart</button><button class="text-button" data-workbench-pause aria-pressed="false">Pause</button></div><input class="workbench-timeline" type="range" min="0" max="1000" value="0" aria-label="AWR method animation progress"></div>`;
  const $=selector=>container.querySelector(selector),$$=selector=>[...container.querySelectorAll(selector)];
  const taskScene=phase>=2;
  const view=sceneBase($('.policy-canvas'),{compact:true,fitAspect:taskScene?1.45:1.25});view.grid.visible=false;
  view.camera.position.set(...(taskScene?[2.0,1.6,-2.6]:[1.35,1.05,-1.8]));view.camera.lookAt(0,taskScene?.65:.46,0);
  view.renderer.domElement.setAttribute('aria-label',phase===1?'Hand joints follow loss gradients toward a grasp, with live joint angles and a descending loss curve':phase===2?'The same robotic hand grasps, lifts and places a duck at three placements to illustrate AWR state-action demonstrations':phase===3?'AWR policy learning illustration: demonstrations train a policy, then observations drive approach, grasp, lift and placement':'Frozen neural object geometry supplies contact, distance and normal queries around the hand');
  const rig=createDeployHand(),duck=buildObject('duck');duck.scale.setScalar(.32);view.scene.add(rig.hand,duck);
  add(rig.hand,new THREE.BoxGeometry(.29,.16,.018),0x8c64b5,[0,.025,-.176]);
  const floor=add(view.scene,new THREE.CylinderGeometry(taskScene?1.18:.70,taskScene?1.18:.70,.035,64),0xeee6f5,[0,-.025,0]);floor.scale.z=taskScene?.75:.8;
  const rings=[];
  for(const x of taskScene?[-.341,.341]:[0]){const ring=add(view.scene,new THREE.TorusGeometry(.285,.006,6,64),x>0?orange:0xc9b2e0,[x,-.003,0]);ring.rotation.x=Math.PI/2;rings.push(ring);}
  // Forearm and wrist remain attached throughout the entire motion.
  const forearm=add(view.scene,new THREE.CylinderGeometry(.07,.09,1,20),0xb79dce),elbow=add(view.scene,new THREE.SphereGeometry(.092,20,12),0x645174);
  const upper=taskScene?add(view.scene,new THREE.CylinderGeometry(.075,.085,1,20),0xb79dce):null;
  if(taskScene)add(view.scene,new THREE.CylinderGeometry(.14,.18,.10,24),0x9b7cbd,[-.90,.035,-.35]);
  function between(mesh,a,b){const d=b.clone().sub(a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.y=d.length();mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());}
  const targetDots=trace.targets.map(p=>{const mesh=add(view.scene,new THREE.SphereGeometry(.016,14,10),orange,p);return mesh;});
  const gradientLines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:orange,transparent:true,opacity:.65}));gradientLines.geometry.setAttribute('position',new THREE.Float32BufferAttribute(Array(30).fill(0),3));view.scene.add(gradientLines);
  const jointHalos=rig.joints.map(()=>{
    const group=new THREE.Group(),angle=Math.PI*1.35;view.scene.add(group);
    add(group,new THREE.TorusGeometry(.048,.0035,6,24,angle),orange);
    const tip=add(group,new THREE.ConeGeometry(.010,.025,9),orange,[Math.cos(angle)*.048,Math.sin(angle)*.048,0]);
    tip.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(-Math.sin(angle),Math.cos(angle),0));
    group.rotation.y=Math.PI/2;return group;
  });
  const keypoints=[[0,.48,0],[.38,1.03,0],[-.63,.58,0],[.72,.96,0]].map(p=>{const dot=add(view.scene,new THREE.SphereGeometry(.015,12,8),purple);dot.userData.local=new THREE.Vector3(...p).multiplyScalar(.32);return dot;});
  const trajectoryPoints=[];
  for(let i=0;i<=60;i++){
    posePolicyTask(rig,duck,2.9+(8.1-2.9)*i/60,2);
    trajectoryPoints.push(duck.position.clone().add(new THREE.Vector3(0,.12,0)));
  }
  const trajectory=new THREE.Line(new THREE.BufferGeometry().setFromPoints(trajectoryPoints),new THREE.LineDashedMaterial({color:purple,dashSize:.035,gapSize:.025,transparent:true,opacity:.32}));trajectory.computeLineDistances();view.scene.add(trajectory);trajectory.visible=taskScene;
  const fieldShell=new THREE.Mesh(new THREE.SphereGeometry(1,18,12),new THREE.MeshBasicMaterial({color:purple,wireframe:true,transparent:true,opacity:.10}));fieldShell.position.set(0,.154,0);fieldShell.scale.set(.225,.15,.155);view.scene.add(fieldShell);fieldShell.visible=phase===0;
  const point=new THREE.Vector3(),end=new THREE.Vector3();
  let paused=matchMedia('(prefers-reduced-motion: reduce)').matches,elapsed=paused?(phase===1?5:phase===2?4.8:phase===3?8.8:4):0,lastPaint=-Infinity;
  function write(selector,value){const node=$(selector);if(node&&node.textContent!==String(value))node.textContent=value;}
  function paintTelemetry(state,progress,episode,task,training){
    if(state){
      write('[data-loss]',state.relativeLoss<.001?'<0.001':state.relativeLoss.toFixed(3));
      write('[data-contact]',state.contact.toFixed(3));write('[data-pose]',state.pose.toFixed(3));
      const frames=trace.frames.slice(0,state.iteration+1),max=trace.frames.length-1;
      const points=frames.map(f=>`${12+f.iteration/max*217},${72-63*f.relativeLoss}`);
      $('[data-loss-trail]')?.setAttribute('d',points.map((p,i)=>(i?'L':'M')+p).join(' '));
      const last=frames.at(-1);$('[data-loss-dot]')?.setAttribute('cx',String(12+last.iteration/max*217));$('[data-loss-dot]')?.setAttribute('cy',String(72-63*last.relativeLoss));
    }
    const angles=state?.q||task?.q||OPEN_ANGLES;
    angles.forEach((value,i)=>{const node=$(`[data-joint-bar="${i}"]`);if(node)node.style.width=`${THREE.MathUtils.clamp((value-OPEN_ANGLES[i])/(TARGET_ANGLES[i]-OPEN_ANGLES[i]),0,1)*100}%`;});
    names.forEach((_,i)=>{const values=angles.slice(i===4?12:i*3,i===4?14:i*3+3);write(`[data-joint-value="${i}"]`,values.map(v=>Math.round(v*180/Math.PI)+'°').join(' / '));});
    if(phase===2){
      const count=episode*24+Math.min(24,Math.floor(task.t/9.4*24));write('[data-pair-count]',`${count} / 72`);
      $$('[data-episode]').forEach((el,i)=>el.classList.toggle('active',i===episode));
      $$('[data-record]').forEach((el,i)=>{const done=task.t>[1.6,2.9,4.3][i];el.classList.toggle('recorded',done);el.querySelector('b').textContent=done?'✓':'○';});
    }
    if(phase===3){
      write('[data-network-state]',training?'LEARN FROM DEMONSTRATIONS':'OBSERVATION → POLICY → ACTION');
      write('[data-network-input]',training?'(sₜ, a*ₜ)':'Keypoints sₜ');write('[data-network-input-label]',training?'demonstrations':'current observation');
      $$('[data-task-step]').forEach((el,i)=>el.classList.toggle('active',!training&&i===(task.t<1.6?0:task.t<2.9?1:2)));
    }
    write('[data-workbench-status]',phase===1?`Iteration ${state.iteration} / ${trace.frames.length-1}`:phase===2?`Episode ${episode+1} / 3`:phase===3?(training?'Fit the policy':task.stage):'Geometry fixed');
    write('[data-scene-badge]',phase===1?'L = Lcontact + Lpenetration + Lpose':phase===2?'RECORD  sₜ → a*ₜ':phase===3?(training?'DEMONSTRATIONS → πφ':'πφ(sₜ) → aₜ'):'Occupancy · SDF · normals');
    write('[data-scene-annotation]',phase===1?'Orange targets · Joint-space gradients':phase===2?task.stage:phase===3?(training?'Fit actions from demonstrations':task.stage):'Frozen geometry → contact queries');
    container.dataset.animationState=phase===1?`iteration-${state.iteration}`:phase===3&&training?'training':task?.stage.toLowerCase().replaceAll(' ','-')||'frozen';
    $('.workbench-timeline').value=Math.round(progress*1000);
  }
  function update(force=false){
    const t=elapsed%duration,progress=t/duration;let state,task,episode=0,training=false,opacity=1;
    if(phase<2){
      const p=phase===0?.52:Math.min(t/9.2,1);state=sampleOptimization(p);
      rig.hand.position.set(-.02,.62,0);rig.setJointAngles(state.q);duck.position.set(0,0,0);
      if(phase===1&&t>10.6)opacity=1-smooth((t-10.6)/1.4);
      if(phase===1&&t<.45)opacity=smooth(t/.45);
    }else{
      episode=phase===2?Math.min(2,Math.floor(t/11.5)):0;training=phase===3&&t<4;
      task=posePolicyTask(rig,duck,phase===2?t%11.5:training?.6:Math.min(t-4,11.49),episode);opacity=task.opacity;
      if(training){const p=smooth(t/3.5);task.q=sampleOptimization(p).q;rig.hand.position.set(-.02,.62,0);duck.position.set(0,0,0);rig.setJointAngles(task.q);opacity=t>3.4?1-smooth((t-3.4)/.6):1;}
      rings.forEach(r=>r.position.z=[-.12,.10,0][episode]);trajectory.position.z=[-.12,.10,0][episode];
    }
    rig.hand.updateMatrixWorld(true);duck.updateMatrixWorld(true);
    const wrist=rig.hand.position.clone().add(new THREE.Vector3(0,.29,0));
    end.set(taskScene?-.6:-.35,taskScene?1.42:1.04,taskScene?-.38:-.18);elbow.position.copy(end);between(forearm,end,wrist);if(upper)between(upper,new THREE.Vector3(-.90,.1,-.35),end);
    for(const root of [rig.hand,duck])root.traverse(mesh=>{if(mesh.isMesh){mesh.material.transparent=true;mesh.material.opacity=opacity;}});
    const activeJoint=Math.floor(t*2.5)%14;
    jointHalos.forEach((halo,i)=>{halo.visible=phase<2&&(i===activeJoint||i%3===1||i===12);rig.joints[i].getWorldPosition(halo.position);halo.scale.setScalar(1+.12*Math.sin(t*7));});
    targetDots.forEach(dot=>dot.visible=phase<2);
    gradientLines.visible=phase<2;const positions=gradientLines.geometry.attributes.position;
    rig.tips.forEach((tip,i)=>{tip.getWorldPosition(point);positions.setXYZ(i*2,point.x,point.y,point.z);positions.setXYZ(i*2+1,...trace.targets[i]);});positions.needsUpdate=true;
    keypoints.forEach((dot,i)=>{dot.visible=phase===0||phase===2||phase===3;dot.position.copy(dot.userData.local).add(duck.position);dot.scale.setScalar(1+.15*Math.sin(t*3+i));});
    if(phase===3){
      $$('[data-network-nodes] circle').forEach((node,i)=>node.setAttribute('fill',(Math.floor(t*5)+i)%4===0?'#ff6841':'#a787c9'));
      const packet=$('[data-flow-packet]');packet.setAttribute('cx',String(112+(t*.7%1)*194));packet.setAttribute('cy','49');
    }
    if(force||elapsed-lastPaint>.08){paintTelemetry(state,progress,episode,task,training);lastPaint=elapsed;}
  }
  function pauseLabel(){write('[data-workbench-pause]',paused?'Play':'Pause');$('[data-workbench-pause]').setAttribute('aria-pressed',String(paused));}
  $('[data-workbench-pause]').addEventListener('click',()=>{paused=!paused;pauseLabel();});
  $('[data-workbench-restart]').addEventListener('click',()=>{elapsed=0;lastPaint=-Infinity;update(true);});
  $('.workbench-timeline').addEventListener('input',event=>{elapsed=Number(event.target.value)/1000*(duration-.001);paused=true;pauseLabel();update(true);});
  pauseLabel();update(true);view.animate(dt=>{if(!paused){elapsed+=dt;update();}});
  return ()=>{delete container.dataset.animationState;view.dispose();};
}
