import {THREE,resource,geometry,material,createStage,NativeHand,quaternion} from './lab-scene.js';
const objects=[['mug','Cup'],['duck','Duck'],['dumbbell','Dumbbell'],['bottle','Bottle'],['apple','Apple']];
const names={xhand:'XHand',allegro:'Allegro',shadow:'Shadow Hand'};
function propMesh(parts){
 const group=new THREE.Group();
 for(const part of parts){const s=part.size;let g;
  if(part.type==='box')g=new THREE.BoxGeometry(s[0]*2,s[1]*2,s[2]*2);
  else if(part.type==='cylinder')g=new THREE.CylinderGeometry(s[0],s[0],s[1]*2,40).rotateX(Math.PI/2);
  else if(part.type==='capsule')g=new THREE.CapsuleGeometry(s[0],s[1]*2,6,12).rotateX(Math.PI/2);
  else{g=new THREE.SphereGeometry(1,32,24);g.scale(s[0],s[1]||s[0],s[2]||s[0]);}
  const mesh=new THREE.Mesh(g,material(part.color));mesh.position.fromArray(part.pos);mesh.quaternion.copy(quaternion(part.quat));mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
 }
 return group;
}
function dispose(group){group?.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});group?.removeFromParent();}
export async function mountGraspLab(){
 const root=document.querySelector('#grasp-lab'),$=s=>root.querySelector(s),stage=createStage($('#grasp-canvas'),{compact:true});
 const [rigs,armData]=await Promise.all([resource('./lab/rigs.json'),resource('./lab/arm.json')]);
 const arm=new NativeHand(armData);arm.root.position.fromArray(armData.mount.pos);arm.root.quaternion.copy(quaternion(armData.mount.quat));stage.native.add(arm.root);
 const experiment=new THREE.Group();stage.native.add(experiment);
 const points=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:0x58aab5,size:.008,sizeAttenuation:true,depthTest:false,depthWrite:false,transparent:true,opacity:.9}));points.frustumCulled=false;points.renderOrder=20;stage.scene.add(points);
 let kind='xhand',object='mug',hand=null,prop=null,data=null,selection=0,time=0,last=0,visible=false,playing=true;
 const flow=document.querySelector('#gradient-flow'),phaseNames=['Approach','Close & optimize','Lift','Hold & shake'];
 function sync(){$('#grasp-play').textContent=playing?'Pause':'Play';flow.classList.toggle('is-paused',!visible||!playing);}
 const jointColors=['#8b6bb1','#438f91','#c88c42','#5e80b5','#b76b7c'];
 let chartJoints=[];
 function setupCharts(){
  const targets=kind==='xhand'?['thumb_bend_joint','index_joint1','mid_joint1','ring_joint1','pinky_joint1']:kind==='allegro'?['thj1','ffj1','mfj1','rfj1']:['rh_THJ4','rh_FFJ3','rh_MFJ3','rh_RFJ3','rh_LFJ3'];
  const labels=kind==='shadow'?['Thumb J4','Index J3','Middle J3','Ring J3','Little J3']:kind==='allegro'?['Thumb J1','Index J1','Middle J1','Ring J1']:['Thumb bend','Index base','Middle base','Ring base','Little base'];
  chartJoints=targets.map((suffix,i)=>({index:hand.joints.findIndex(j=>j.name.endsWith(suffix)),label:labels[i],color:jointColors[i]})).filter(j=>j.index>=0);
  $('#grasp-joint-legend').innerHTML=chartJoints.map(j=>`<li title="${hand.joints[j.index].name}"><i style="background:${j.color}"></i><span>${j.label}</span></li>`).join('');
 }
 function plotAxes(width,yMin,yMax,ticks,yTitle){
  const left=40,right=width-12,top=17,bottom=112,x=t=>left+(right-left)*t/8,y=v=>bottom-(bottom-top)*(v-yMin)/(yMax-yMin);
  const number=v=>Math.abs(v)<.00001?'0':yMax<1?v.toFixed(2):yMax<10?v.toFixed(1):String(Math.round(v));
  let markup=ticks.map(v=>`<line class="chart-grid" x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}"/><text class="chart-tick" x="${left-7}" y="${y(v)+3}" text-anchor="end">${number(v)}</text>`).join('');
  markup+=`<path class="chart-axis" d="M${left} ${top}V${bottom}H${right}"/>`;
  markup+=[0,2,4,6,8].map(t=>`<line class="chart-axis" x1="${x(t)}" x2="${x(t)}" y1="${bottom}" y2="${bottom+4}"/><text class="chart-tick" x="${x(t)}" y="${bottom+16}" text-anchor="middle">${t}</text>`).join('');
  markup+=`<text class="chart-label" x="${(left+right)/2}" y="144" text-anchor="middle">Time (s)</text><text class="chart-label" x="${left}" y="10">${yTitle}</text>`;
  return {markup,x,y};
 }
 function drawCharts(index){
  const n=data.jointNames.length,frames=data.frames.slice(0,index+1),stride=Math.max(1,Math.floor(frames.length/100)),sample=frames.filter((_,i)=>i%stride===0);if(sample.at(-1)!==frames.at(-1))sample.push(frames.at(-1));
  const peak=Math.max(...data.frames.map(f=>f[n+16]),.01),unit=10**Math.floor(Math.log10(peak)),maximum=Math.ceil(peak/unit)*unit;
  const lossAxes=plotAxes(350,0,maximum,[0,maximum/2,maximum],'Loss');
  $('#grasp-loss').innerHTML=lossAxes.markup+`<polyline points="${sample.map(f=>`${lossAxes.x(f[0])},${lossAxes.y(f[n+16])}`).join(' ')}" fill="none" stroke="#9970b9" stroke-width="2"/>`;
  const axes=plotAxes(260,-20,120,[0,60,120],'Angle (°)');
  $('#grasp-joints').innerHTML=axes.markup+chartJoints.map(j=>`<polyline points="${sample.map(f=>`${axes.x(f[0])},${axes.y(f[1+j.index]*180/Math.PI)}`).join(' ')}" fill="none" stroke="${j.color}" stroke-width="1.7"/>`).join('');
  $('#grasp-loss-value').textContent=data.frames[index][n+16].toFixed(3);
 }
 function showFrame(){if(!data||!hand)return;const n=data.jointNames.length,index=Math.min(data.frames.length-1,Math.floor(time*50)),a=data.frames[index],b=data.frames[Math.min(index+1,data.frames.length-1)],alpha=THREE.MathUtils.clamp(time*50-index,0,1);const values=(start,count)=>a.slice(start,start+count).map((v,i)=>THREE.MathUtils.lerp(v,b[start+i],alpha));
  hand.set(values(1,n));hand.root.position.fromArray(values(n+1,3));hand.root.quaternion.copy(quaternion(a.slice(n+12,n+16))).slerp(quaternion(b.slice(n+12,n+16)),alpha);
  prop.position.fromArray(values(n+4,3));prop.quaternion.copy(quaternion(a.slice(n+7,n+11))).slerp(quaternion(b.slice(n+7,n+11)),alpha);arm.set(values(n+17,7));
  const keypoints=hand.points().flatMap(p=>p.toArray());points.geometry.setAttribute('position',new THREE.Float32BufferAttribute(keypoints,3));
  $('#grasp-iteration').textContent=phaseNames[a[n+11]];$('#grasp-timeline').value=String(Math.min(time,8));root.dataset.phase=phaseNames[a[n+11]];root.dataset.time=time.toFixed(2);root.dataset.objectHeight=String(a[n+6]);
  if(root._chartIndex!==index){drawCharts(index);root._chartIndex=index;}
 }
 async function choose(){const token=++selection;playing=false;data=null;$('#grasp-loading').hidden=false;$('#grasp-loading').textContent='Loading grasp…';sync();
  try{const replay=await resource(`./lab/grasp/${kind}-${object}.json`);if(token!==selection)return;
   dispose(hand?.root);dispose(prop);hand=new NativeHand(kind==='xhand'?rigs.right.hand:rigs[kind]);hand.root.traverse(o=>{if(o.isMesh)o.material.color.set(kind==='xhand'?0x343b44:kind==='allegro'?0x42484c:0x78838c);});experiment.add(hand.root);prop=propMesh(replay.parts);experiment.add(prop);
   // A continuous cup rim and handle cover the same compound collision surface.
   if(object==='mug'){
    dispose(prop);prop=new THREE.Group();const color=0x629cc2,base=replay.parts[0],wall=replay.parts[1],radius=base.size[0],bottom=base.pos[2]-base.size[1],top=wall.size[2],inner=radius-2*wall.size[0];
    const profile=[[0,bottom],[radius,bottom],[radius,top],[inner,top],[inner,bottom+2*base.size[1]],[0,bottom+2*base.size[1]]].map(p=>new THREE.Vector2(...p));
    const body=new THREE.Mesh(new THREE.LatheGeometry(profile,64).rotateX(Math.PI/2),material(color));body.castShadow=true;body.receiveShadow=true;prop.add(body);
    const handleParts=replay.parts.slice(25),curve=new THREE.CatmullRomCurve3(handleParts.map(p=>new THREE.Vector3(...p.pos)));const handle=new THREE.Mesh(new THREE.TubeGeometry(curve,64,handleParts[0].size[0],12,false),material(color));handle.castShadow=true;prop.add(handle);experiment.add(prop);
   }
   if(object==='duck'){const scale=replay.physics.scale||1;for(const y of [-.018,.018]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.0026*scale,12,10),material(0x262d30));eye.position.set(.034*scale,y*scale,.039*scale);prop.add(eye);}}
   data=replay;setupCharts();experiment.position.fromArray(data.sceneOffset);experiment.quaternion.copy(quaternion(data.sceneQuaternion));time=0;playing=true;root._chartIndex=-1;root.dataset.hand=kind;root.dataset.object=object;root.dataset.physicsValidated=String(data.physics.success);root.dataset.minimumLift=String(data.physics.lift_min);
   $('#grasp-scene-title').textContent=`${names[kind]} · ${objects.find(o=>o[0]===object)[1]}`;
   const center=new THREE.Vector3(data.sceneOffset[0],.93,-data.sceneOffset[1]);
   const view=object==='dumbbell'?[-.70,.34,.32]:[-.48,.32,.62];
   stage.controls.target.copy(center);stage.camera.position.copy(center).add(new THREE.Vector3(...view));stage.controls.update();$('#grasp-loading').hidden=true;showFrame();sync();
  }catch(error){$('#grasp-loading').textContent='This replay could not be loaded. Select another object or retry.';console.error(error);}
 }
 for(const [id,name] of objects){const b=document.createElement('button');b.type='button';b.dataset.object=id;b.textContent=name;b.setAttribute('aria-pressed',String(id===object));b.addEventListener('click',()=>{object=id;$('#grasp-objects').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));choose();});$('#grasp-objects').append(b);}
 for(const [id,name] of Object.entries(names)){const b=document.createElement('button');b.type='button';b.dataset.hand=id;b.textContent=name;b.setAttribute('aria-pressed',String(id===kind));b.addEventListener('click',()=>{kind=id;$('#grasp-hands').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));choose();});$('#grasp-hands').append(b);}
 $('#grasp-play').addEventListener('click',()=>{playing=!playing;sync();});$('#grasp-restart').addEventListener('click',()=>{time=0;playing=true;sync();showFrame();});$('#grasp-timeline').addEventListener('input',e=>{time=Number(e.target.value);playing=false;sync();showFrame();});
 await choose();root.dataset.ready='true';new IntersectionObserver(([e])=>{visible=e.isIntersecting;sync();}).observe(root);
 function tick(now){requestAnimationFrame(tick);const dt=Math.min((now-last)/1000,.05);last=now;if(!visible||document.hidden)return;if(playing){time+=dt;if(time>8.8)time=0;}showFrame();stage.render();}requestAnimationFrame(tick);
}
