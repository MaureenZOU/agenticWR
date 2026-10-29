import {THREE,createStage,addRobot,handleOverlay,resource} from './lab-scene.js?v=20261029-constrained-poses-v1';
import {createObject} from './lab-objects.js?v=20261029-constrained-poses-v1';
export async function mountObjectLab(){
 const root=document.querySelector('#object-lab'),host=root.querySelector('.lab-canvas'),stage=createStage(host,{workspace:true});
 const [catalog,demos,{placements},left,right]=await Promise.all([resource('./lab/objects.json?v=20261029-grasp-zoo-polish-v3'),resource('./demos/catalog.json?v=20261029-grasp-zoo-polish-v3'),resource('./lab/placements.json'),addRobot(stage,'left'),addRobot(stage,'right')]);
 const entries=[['pliers','pliers','Pliers','#c18b6c'],['faucet','partnet_faucet_1370','Faucet','#7ba9b8'],['human','smpl_female','Human','#91c6d4'],['horse','smal_equidae','Horse','#b88b61'],['cow','smal_bovidae','Cow','#9caa8f'],['hippo','smal_hippopotamidae','Hippo','#9b9db9'],['toilet',null,'Toilet','#d6dfdb'],['cabinet','cabinet','Cabinet','#96704c']];
 const instances=new Map(),buttons=new Map();let selected=null,playing=false,visible=false,time=0,last=0,revision=0,mode='sdf',normal=false,family='all',zooId='cabinet',pcaPlaying=true;
 const robots={left,right};let playRequest=0;const hint=root.querySelector('.lab-interaction-hint');
 const handControls=new Set([2,5,7,9,11]);
 function syncPose(){const o=instances.get(selected);root.dataset.pose=JSON.stringify(o?.state||null);root.dataset.poseFrame=String(o?.frameIndex??-1);}
 for(const [side,robot] of Object.entries(robots)){robot.hand.root.userData.focusId=side;robot.hand.root.traverse(o=>{if(o.isMesh)o.material.color.set(0x363c44);});}
 function focus(id,zoom=true){
  playing=false;++playRequest;syncPlay();selected=id;const object=instances.get(id),robot=robots[id];root.dataset.selected=id||'workspace';buttons.forEach((b,key)=>b.setAttribute('aria-pressed',String(key===id)));
  root.querySelector('#lab-focus-name').textContent=object?.meta.name||(robot?`${id==='left'?'Left':'Right'} XHand`:'Workspace');
  root.querySelector('.lab-format').hidden=!!robot;root.querySelector('.lab-normal').hidden=!!robot||mode!=='sdf';
  instances.forEach((o,key)=>o.setMode(key===id?mode:'sdf',key===id&&normal));
  syncPose();hint.hidden=!id;hint.textContent='Drag the larger points · Small dots show reference keypoints';
  if(object&&!object.ready){hint.textContent='Loading object poses…';object.prepare().then(()=>{if(selected===id){hint.textContent='Drag the larger points · Motion stays within joint limits';syncPose();}}).catch(()=>{if(selected===id)hint.textContent='Could not load object poses. Select the object to retry.';});}
  if(zoom&&(object||robot)){const box=new THREE.Box3().setFromObject(object?.root||robot.hand.root),center=box.getCenter(new THREE.Vector3()),extent=box.getSize(new THREE.Vector3());const distance=Math.max(.42,extent.length()*1.8);const direction=stage.camera.position.clone().sub(stage.controls.target).normalize();stage.controls.target.copy(center);stage.camera.position.copy(center).addScaledVector(direction,distance);stage.controls.update();}
 }
 function addFocus(id,name){const b=document.createElement('button');b.type='button';b.textContent=name;b.dataset.focus=id;b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>focus(id));buttons.set(id,b);root.querySelector('#lab-focus-list').append(b);}
 await Promise.all(entries.map(async([id,catalogId,name,color])=>{const meta={...(catalog.find(o=>o.id===catalogId)||{}),id,name,color,constrained:id,learnedSdf:true};const object=await createObject(meta,{placement:placements[id],points:6500});object.root.userData.focusId=id;stage.native.add(object.root);instances.set(id,object);}));
 entries.forEach(([id,,name])=>addFocus(id,name));addFocus('left','Left XHand');addFocus('right','Right XHand');
 const objectOverlay=handleOverlay(stage,root.querySelector('.lab-object-handles'),{points:()=>instances.get(selected)?.handles()||[],label:'Object keypoint',draggable:i=>!!instances.get(selected)?.canDrag(i),labels:()=>instances.get(selected)?.handleLabels||[],onStart:()=>{playing=false;++playRequest;syncPlay();},drag:(i,p)=>{instances.get(selected)?.drag(i,p);root.dataset.poseRevision=String(++revision);syncPose();}});
 const handOverlay=handleOverlay(stage,root.querySelector('.lab-hand-handles'),{points:()=>robots[selected]?.hand.points()||[],label:'XHand keypoint',onStart:()=>{playing=false;++playRequest;syncPlay();},draggable:i=>handControls.has(i),drag:(i,p)=>{robots[selected]?.hand.solve(i,p,6);root.dataset.handRevision=String(++revision);}});
 function syncPlay(){root.querySelector('[data-lab-play]').textContent=playing?'Pause':'Play';}
 root.querySelector('[data-lab-play]').addEventListener('click',async()=>{if(playing){playing=false;++playRequest;syncPlay();return;}const token=++playRequest,button=root.querySelector('[data-lab-play]');button.disabled=true;button.textContent='Loading…';try{await Promise.all([...instances.values()].map(o=>o.prepare()));if(token===playRequest)playing=true;}catch{hint.hidden=false;hint.textContent='Could not load object poses. Press Play to retry.';}finally{button.disabled=false;syncPlay();}});syncPlay();
 root.querySelector('[data-lab-reset]').addEventListener('click',()=>{++playRequest;instances.forEach(o=>o.reset());Object.values(robots).forEach(r=>r.hand.set(r.hand.joints.map(j=>j.home)));playing=false;syncPlay();syncPose();});
 root.querySelector('#lab-overview').addEventListener('click',()=>{focus(null,false);stage.reset();});
 root.querySelectorAll('[data-lab-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.labMode;root.querySelectorAll('[data-lab-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));if(!selected)focus('pliers',false);else focus(selected,false);}));
 root.querySelector('.lab-normal input').addEventListener('change',e=>{normal=e.target.checked;if(!selected)focus('pliers',false);else focus(selected,false);});
 // Raycast only triangle surfaces. Hidden point clouds use a 1 m default
 // pick radius in Three.js and previously intercepted clicks on other objects.
 const pickMeshes=[];stage.native.traverse(node=>{if(node.isMesh)pickMeshes.push(node);});
 function pickAt(x,y){stage.native.updateMatrixWorld(true);stage.camera.updateMatrixWorld();const hit=stage.ray({clientX:x,clientY:y}).intersectObjects(pickMeshes,false)[0];let node=hit?.object;while(node&&!node.userData.focusId)node=node.parent;return node?.userData.focusId||null;}
 let down=null;
 host.addEventListener('pointerdown',e=>{if(e.button!==0||!e.isPrimary)return;down={id:e.pointerId,x:e.clientX,y:e.clientY,object:pickAt(e.clientX,e.clientY)};},true);
 host.addEventListener('pointerup',e=>{const start=down;down=null;if(!start||start.id!==e.pointerId||Math.hypot(e.clientX-start.x,e.clientY-start.y)>9)return;let id=pickAt(e.clientX,e.clientY)||start.object;
  if(!id)for(const radius of [4,8,12]){for(const [dx,dy] of [[-radius,0],[radius,0],[0,-radius],[0,radius],[-radius,-radius],[radius,-radius],[-radius,radius],[radius,radius]]){id=pickAt(e.clientX+dx,e.clientY+dy);if(id)break;}if(id)break;}
  if(id){focus(id,false);root.dataset.pickRevision=String(Number(root.dataset.pickRevision||0)+1);}
 },true);
 host.addEventListener('pointercancel',()=>down=null,true);
 const tiles=root.querySelector('#lab-object-list'),image=root.querySelector('#lab-pca-image');
 function showPca(){const demo=demos.find(d=>d.id===zooId);image.src=(pcaPlaying?demo.src:demo.poster)+'?v=20261029-grasp-zoo-polish-v3';image.alt=`${demo.name}: projected PCA keypoints and reconstructed surface`;root.querySelector('#lab-pca-play').textContent=pcaPlaying?'Pause':'Play';tiles.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.object===zooId)));root.dataset.pcaObject=zooId;}
 function fill(){tiles.replaceChildren();for(const object of catalog.filter(o=>family==='all'||o.family===family)){const b=document.createElement('button');b.type='button';b.dataset.object=object.id;b.setAttribute('aria-label',`Play ${object.name} PCA animation`);b.innerHTML=`<img loading="lazy" src="${object.thumbnail}?v=20261029-grasp-zoo-polish-v3" alt=""><span>${object.name}</span>`;b.addEventListener('click',()=>{zooId=object.id;pcaPlaying=true;showPca();});tiles.append(b);}showPca();}
 root.querySelectorAll('[data-lab-family]').forEach(b=>b.addEventListener('click',()=>{family=b.dataset.labFamily;root.querySelectorAll('[data-lab-family]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));fill();}));
 root.querySelector('#lab-pca-play').addEventListener('click',()=>{pcaPlaying=!pcaPlaying;showPca();});fill();
 root.querySelector('.lab-loading').hidden=true;root.dataset.ready='true';root.dataset.objectCount=String(instances.size);
 let warmed=false;new IntersectionObserver(([e])=>{visible=e.isIntersecting;if(visible&&!warmed){warmed=true;for(const o of instances.values())o.prepare().catch(()=>{});}},{rootMargin:'100px'}).observe(root);
 function tick(now){requestAnimationFrame(tick);const dt=Math.min((now-last)/1000,.05);last=now;if(!visible||document.hidden)return;time+=dt;if(playing&&Math.floor(time*15)!==Math.floor((time-dt)*15))instances.forEach(o=>o.animate(time));objectOverlay.update(!!instances.get(selected));handOverlay.update(!!robots[selected]);stage.render();}requestAnimationFrame(tick);
}
