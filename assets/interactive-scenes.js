import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

// Procedural teaching geometry. Recorded reconstructions and experiments live in demos/.
const purple = 0x7846b8, orange = 0xff6841;
const material = color => new THREE.MeshStandardMaterial({ color, roughness: .48, metalness: .02 });

export function buildObject(type = 'duck') {
  const group = new THREE.Group();
  const ellipsoid = (position, scale, color, rotation = 0) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 24), material(color));
    m.position.set(...position); m.scale.set(...scale); m.rotation.z = rotation;
    group.add(m); return m;
  };
  if (type === 'duck') {
    ellipsoid([0,.48,0],[.66,.43,.43],0xf2ba58);
    ellipsoid([.38,1.03,0],[.34,.36,.32],0xffd780);
    ellipsoid([.72,.96,0],[.30,.10,.21],orange);
    ellipsoid([-.15,.53,.37],[.37,.21,.08],0xe8a746,-.18);
    ellipsoid([-.15,.53,-.37],[.37,.21,.08],0xe8a746,-.18);
    ellipsoid([-.63,.58,0],[.28,.15,.23],0xf2ba58,-.5);
    ellipsoid([.51,1.12,.28],[.045,.05,.025],0x2d233c);
    ellipsoid([.51,1.12,-.28],[.045,.05,.025],0x2d233c);
  } else if (type === 'bunny') {
    ellipsoid([-.12,.46,0],[.48,.46,.38],0xcab2e5);
    ellipsoid([.19,.98,0],[.31,.33,.30],0xe0cef2);
    ellipsoid([.13,1.48,-.13],[.105,.40,.105],0xcab2e5,-.16);
    ellipsoid([.31,1.48,.14],[.105,.40,.105],0xe0cef2,.12);
    ellipsoid([.32,.15,.27],[.25,.13,.16],0xcab2e5);
    ellipsoid([.32,.15,-.27],[.25,.13,.16],0xcab2e5);
    ellipsoid([-.55,.40,0],[.17,.17,.17],0xeee4f7);
    ellipsoid([.39,1.04,.22],[.035,.04,.025],0x2d233c);
    ellipsoid([.39,1.04,-.22],[.035,.04,.025],0x2d233c);
    ellipsoid([.49,.94,0],[.06,.045,.07],orange);
  } else {
    const profile = [[0,.05],[.38,.05],[.47,.12],[.48,.94],[.46,1.01],[.41,1.01],[.40,.20],[0,.20]].map(p=>new THREE.Vector2(...p));
    group.add(new THREE.Mesh(new THREE.LatheGeometry(profile,64),material(0xb69ad6)));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(.31,.065,18,48,Math.PI),material(0xb69ad6));
    handle.rotation.z=-Math.PI/2;handle.position.set(.46,.58,0); group.add(handle);
  }
  return group;
}

function pointCloud(object) {
  object.updateMatrixWorld(true);
  const p=[], c=[], v=new THREE.Vector3();
  object.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const vertices=mesh.geometry.attributes.position;
    for(let i=0;i<vertices.count;i+=2){
      v.fromBufferAttribute(vertices,i).applyMatrix4(mesh.matrixWorld);
      p.push(v.x,v.y,v.z);
      const color=mesh.material.color;
      c.push(color.r,color.g,color.b);
    }
  });
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
  return new THREE.Points(geometry,new THREE.PointsMaterial({size:.025,color:purple,sizeAttenuation:true}));
}

function addCameras(scene) {
  const cameras=new THREE.Group();
  [[2.0,1.65,1.8],[-1.9,1.3,1.7],[.3,2.2,-2.0]].forEach((p,i)=>{
    const node=new THREE.Group();node.position.set(...p);node.lookAt(0,.7,0);
    const body=new THREE.Mesh(new THREE.BoxGeometry(.26,.19,.20),material(i===0?orange:purple));
    node.add(body);
    const lens=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,.16,20),material(0x2d233c));
    lens.rotation.x=Math.PI/2;lens.position.z=.16;node.add(lens);
    const l=1.05,corners=[[-.46,-.32,l],[.46,-.32,l],[.46,.32,l],[-.46,.32,l]];
    const points=[];corners.forEach((v,j)=>{points.push(0,0,.23,...v,...v,...corners[(j+1)%4]);});
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    node.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:i===0?orange:purple,transparent:true,opacity:.32})));
    cameras.add(node);
  });
  scene.add(cameras);
}

export function sceneBase(container, {cameras=false, interactive=false, compact=false, fitAspect=0}={}) {
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  renderer.setClearColor(0xffffff,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  container.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label',interactive?'Drag to orbit the object and capture cameras. Use arrow keys to rotate.':'Object geometry visualization');
  if(interactive)renderer.domElement.tabIndex=0;
  const scene=new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff,0xbfb0d2,2.6));
  const light=new THREE.DirectionalLight(0xffffff,3.0);light.position.set(3,5,4);scene.add(light);
  const camera=new THREE.PerspectiveCamera(compact?34:39,1,.05,50);
  const home=cameras?[3.8,2.7,4.8]:[2.8,1.8,3.3];
  const target=new THREE.Vector3(0,cameras?.7:.8,0);
  camera.position.set(...home);camera.lookAt(target);
  const grid=new THREE.GridHelper(cameras?5:3.2,cameras?16:12,0xd7c9e5,0xe7ddf0);grid.position.y=-.02;scene.add(grid);
  if(cameras)addCameras(scene);
  let control;
  if(interactive){
    control=new OrbitControls(camera,renderer.domElement);control.target.copy(target);control.enableDamping=true;control.enablePan=false;
    control.minDistance=3.1;control.maxDistance=8;control.minPolarAngle=.12;control.maxPolarAngle=Math.PI/2-.03;
    // Keep touch scrolling available outside the canvas.
    renderer.domElement.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
      e.preventDefault();const s=new THREE.Spherical().setFromVector3(camera.position.clone().sub(control.target));
      s.theta+=e.key==='ArrowLeft'?.15:e.key==='ArrowRight'?-.15:0;
      s.phi=THREE.MathUtils.clamp(s.phi+(e.key==='ArrowUp'?-.12:e.key==='ArrowDown'?.12:0),.12,1.5);
      camera.position.copy(new THREE.Vector3().setFromSpherical(s).add(control.target));control.update();
    });
  }
  const resize=()=>{const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;const framing=fitAspect||(cameras?1.4:0);camera.zoom=framing?Math.min(1,(w/h)/framing):1;camera.updateProjectionMatrix();};
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  let visible=true,frame,disposed=false,onFrame,previous=performance.now();
  const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;});intersection.observe(container);
  const render=()=>{if(disposed)return;frame=requestAnimationFrame(render);const now=performance.now(),dt=Math.min((now-previous)/1000,.1);previous=now;if(!visible||document.hidden)return;onFrame?.(dt);control?.update();renderer.render(scene,camera);};render();
  return {scene,camera,renderer,grid,animate(fn){onFrame=fn;},reset(){camera.position.set(...home);control?.target.copy(target);control?.update();camera.lookAt(target);},dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();intersection.disconnect();control?.dispose();scene.traverse(n=>{n.geometry?.dispose();if(n.material){(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{m.map?.dispose();m.dispose();});}});renderer.dispose();renderer.forceContextLoss();container.replaceChildren();}};
}

export function disposeObject(root){root.traverse(n=>{n.geometry?.dispose();if(n.material)(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{m.map?.dispose();m.dispose();});});}

export function mountCapture(container){
  container.innerHTML=`<div class="scene-controls"><div class="pill-group" role="group" aria-label="Capture object"><button class="pill active" data-capture-object="duck" aria-pressed="true">Duck</button><button class="pill" data-capture-object="bunny" aria-pressed="false">Bunny</button><button class="pill" data-capture-object="mug" aria-pressed="false">Mug</button></div><div class="capture-modes" role="group" aria-label="Capture representation"><button class="pill active" data-capture-mode="surface" aria-pressed="true">Surface</button><button class="pill" data-capture-mode="points" aria-pressed="false">Point cloud</button></div></div><div class="capture-canvas"></div><div class="scene-bottom"><span>Drag to orbit · Scroll to zoom</span><button class="text-button" data-reset-view>Reset view ↗</button></div>`;
  const view=sceneBase(container.querySelector('.capture-canvas'),{cameras:true,interactive:true});
  let object,cloud,type='duck',mode='surface';
  function update(){if(object){view.scene.remove(object,cloud);disposeObject(object);disposeObject(cloud);}object=buildObject(type);cloud=pointCloud(object);view.scene.add(object,cloud);object.visible=mode==='surface';cloud.visible=mode==='points';}
  container.querySelectorAll('[data-capture-object]').forEach(button=>button.addEventListener('click',()=>{type=button.dataset.captureObject;container.querySelectorAll('[data-capture-object]').forEach(b=>{b.setAttribute('aria-pressed',String(b===button));b.classList.toggle('active',b===button);});update();}));
  container.querySelectorAll('[data-capture-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.captureMode;container.querySelectorAll('[data-capture-mode]').forEach(b=>{b.setAttribute('aria-pressed',String(b===button));b.classList.toggle('active',b===button);});object.visible=mode==='surface';cloud.visible=mode==='points';}));
  container.querySelector('[data-reset-view]').addEventListener('click',()=>view.reset());update();
  return ()=>view.dispose();
}

// Analytic fields used by the interactive surface / SDF / normal explanation.
function ellipsoidDistance(x,y,z,c,r,rotation=0){
  const dx=x-c[0],dy=y-c[1],qz=z-c[2],cs=Math.cos(rotation),sn=Math.sin(rotation),qx=cs*dx+sn*dy,qy=-sn*dx+cs*dy;
  const a=qx/r[0],b=qy/r[1],d=qz/r[2],k0=Math.sqrt(a*a+b*b+d*d),aa=a/r[0],bb=b/r[1],dd=d/r[2],k1=Math.sqrt(aa*aa+bb*bb+dd*dd);
  return k1>1e-8?k0*(k0-1)/k1:-Math.min(...r);
}
const fieldParts={
  duck:[[[0,.48,0],[.66,.43,.43]],[[.38,1.03,0],[.34,.36,.32]],[[.72,.96,0],[.30,.10,.21]],[[-.63,.58,0],[.28,.15,.23],-.5]],
  bunny:[[[-.12,.46,0],[.48,.46,.38]],[[.19,.98,0],[.31,.33,.30]],[[.13,1.48,-.13],[.105,.40,.105],-.16],[[.31,1.48,.14],[.105,.40,.105],.12],[[.32,.15,.27],[.25,.13,.16]],[[.32,.15,-.27],[.25,.13,.16]],[[-.55,.4,0],[.17,.17,.17]]]
};
export function field(type,x,y,z){
  if(type==='mug'){
    const outer=Math.max(Math.hypot(x,z)-.48,Math.abs(y-.53)-.48);
    const inner=Math.max(Math.hypot(x,z)-.40,.20-y);
    // Exterior half-ring, terminated inside the cup wall rather than in the cavity.
    const dx=x-.46,dy=y-.58;
    const centerline=dx>=0?Math.abs(Math.hypot(dx,dy)-.31):Math.min(Math.hypot(dx,dy-.31),Math.hypot(dx,dy+.31));
    const handle=Math.max(Math.hypot(centerline,z)-.065,-dx);
    return Math.min(Math.max(outer,-inner),handle);
  }
  let distance=Infinity;for(const [c,r,rotation] of fieldParts[type])distance=Math.min(distance,ellipsoidDistance(x,y,z,c,r,rotation));return distance;
}
const sdfCanvases=new Map();
function sdfPlane(type){
  const size=512,canvas=sdfCanvases.get(type)||document.createElement('canvas');
  if(!sdfCanvases.has(type)){canvas.width=size;canvas.height=size;
  const context=canvas.getContext('2d'),img=context.createImageData(size,size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=(x/(size-1)-.5)*3,v=(1-y/(size-1))*2.8-.4;
    // A vertical slice through both bunny ears; central slices for duck and mug.
    const d=type==='bunny'?field(type,.21+.555*u,v,.005+.832*u):field(type,u,v,0);
    let color=[237,228,246],alpha=Math.max(0,1-d/.26)*65;
    if(d<0){color=[255,215,201];alpha=210;}
    if(Math.abs(d)<.007){color=[120,70,184];alpha=255;}
    else if(d>0&&[.10,.22].some(level=>Math.abs(d-level)<.005)){color=[187,160,212];alpha=130;}
    const at=(y*size+x)*4;img.data.set([...color,alpha],at);
  }
  context.putImageData(img,0,0);sdfCanvases.set(type,canvas);}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(3,2.8),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide,depthWrite:false}));
  plane.position.set(0,1,0);return plane;
}

function surfaceArrows(object,camera){
  object.updateMatrixWorld(true);
  const group=new THREE.Group(),meshes=[];object.traverse(n=>{if(n.isMesh)meshes.push(n);});
  const selected=[],ray=new THREE.Raycaster(),point=new THREE.Vector3(),normal=new THREE.Vector3(),towardCamera=new THREE.Vector3();
  for(const mesh of meshes){
    const vertices=mesh.geometry.attributes.position,normals=mesh.geometry.attributes.normal,matrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    for(let i=7;i<vertices.count;i+=13){
      point.fromBufferAttribute(vertices,i).applyMatrix4(mesh.matrixWorld);
      normal.fromBufferAttribute(normals,i).applyMatrix3(matrix).normalize();
      towardCamera.copy(camera.position).sub(point).normalize();
      if(normal.dot(towardCamera)<.22||selected.some(p=>p.distanceTo(point)<.19))continue;
      ray.set(camera.position,point.clone().sub(camera.position).normalize());
      const first=ray.intersectObjects(meshes,false)[0];
      if(!first||first.point.distanceTo(point)>.025)continue;
      selected.push(point.clone());
      const length=.17,origin=point.clone().addScaledVector(normal,.006);
      const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.005,.005,length-.045,6),material(orange));
      shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),normal);
      shaft.position.copy(origin).addScaledVector(normal,(length-.045)/2);
      const tip=new THREE.Mesh(new THREE.ConeGeometry(.023,.052,9),material(orange));
      tip.quaternion.copy(shaft.quaternion);tip.position.copy(origin).addScaledVector(normal,length-.026);
      group.add(shaft,tip);
    }
  }
  group.userData.arrowCount=selected.length;return group;
}

export function mountComparison(realContainer,modelContainer){
  const left=sceneBase(realContainer,{compact:true}),right=sceneBase(modelContainer,{compact:true});
  left.grid.visible=false;right.grid.visible=false;
  let a,b,slice,arrows,type='duck',mode='occupancy';
  function update(){
    if(a){left.scene.remove(a);disposeObject(a);right.scene.remove(b);disposeObject(b);for(const extra of [slice,arrows])if(extra){right.scene.remove(extra);disposeObject(extra);}slice=null;arrows=null;}
    a=buildObject(type);b=buildObject(type);left.scene.add(a);right.scene.add(b);
    b.traverse(n=>{if(!n.isMesh)return;n.material.dispose();n.material=new THREE.MeshStandardMaterial({color:mode==='normals'?0xbba0d6:purple,roughness:.65});});
    b.visible=mode!=='sdf';modelContainer.dataset.normalArrows='0';
    if(mode==='sdf'){slice=sdfPlane(type);slice.quaternion.copy(right.camera.quaternion);right.scene.add(slice);}
    if(mode==='normals'){arrows=surfaceArrows(b,right.camera);right.scene.add(arrows);modelContainer.dataset.normalArrows=arrows.userData.arrowCount;}
  }
  update();return {setObject(value){type=value;update();},setMode(value){mode=value;update();},dispose(){left.dispose();right.dispose();}};
}

const duckPath='M-61 25 C-90 10 -79 -21 -45 -17 C-26 -13 -19 -18 -13 -40 C-9 -64 24 -70 39 -53 C48 -43 46 -33 45 -29 L70 -23 L46 -14 C31 -4 30 11 14 26 C-4 41 -41 43 -61 25Z';
const miniDuck=(x,y,fill='var(--purple)',scale=1)=>`<g transform="translate(${x} ${y}) scale(${scale})"><path d="${duckPath}" fill="${fill}"/><circle cx="30" cy="-44" r="3" fill="#2d233c"/></g>`;

export function reconstructionMarkup(){
  return `<div class="reconstruct-demo"><svg viewBox="0 0 560 345" role="img" aria-label="Animated keypoint input through a neural field to occupancy, signed distance and surface normal outputs"><defs><linearGradient id="normal-colors"><stop stop-color="#81c8e4"/><stop offset=".45" stop-color="#c6a0f0"/><stop offset="1" stop-color="#f6b294"/></linearGradient><linearGradient id="sdf-colors"><stop stop-color="#ff6841"/><stop offset=".5" stop-color="#faf8fc"/><stop offset="1" stop-color="#7846b8"/></linearGradient></defs><text x="81" y="34" class="svg-label" text-anchor="middle">INPUT</text><text x="271" y="34" class="svg-label" text-anchor="middle">NEURAL FIELD</text><text x="459" y="34" class="svg-label" text-anchor="middle">OUTPUTS</text><g transform="translate(83 176)"><path d="${duckPath}" fill="none" stroke="#ba9bd7" stroke-width="1.5" stroke-dasharray="2 5"/><path d="M-54 16 -14 0 27 -39 38 -16 M-14 0 10 24 -54 16" fill="none" stroke="#c8b0e0"/>${[[-54,16],[-14,0],[27,-39],[38,-16],[10,24]].map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="5" fill="${i%2?'#ff6841':'#7846b8'}" class="neural-node" style="animation-delay:${i*.25}s"/>`).join('')}</g><text x="83" y="260" text-anchor="middle" class="svg-copy">Keypoints + structure</text><path d="M151 175H210 M329 175H362 M362 175V88H391 M362 175H391 M362 175V264H391" fill="none" stroke="#d0bcdf" stroke-width="1.5"/><path class="flow-line" d="M151 175H210 M329 175H362 M362 175V88H391 M362 175H391 M362 175V264H391" fill="none" stroke="#ff6841" stroke-dasharray="6 22" stroke-width="3"/><rect x="213" y="94" width="116" height="162" rx="18" fill="#f4edf9" stroke="#d6c3e7"/>${[0,1,2].map(col=>[0,1,2,3].map(row=>{const x=238+col*33,y=126+row*33;return `${col<2?[0,1,2,3].map(r=>`<path d="M${x} ${y}L${x+33} ${126+r*33}" stroke="#ceb7df" stroke-width=".8"/>`).join(''):''}<circle cx="${x}" cy="${y}" r="5" fill="#7846b8" class="neural-node" style="animation-delay:${col*.3+row*.15}s"/>`;}).join('')).join('')}<text x="271" y="287" text-anchor="middle" class="svg-copy">AWR</text><rect x="395" y="55" width="132" height="66" rx="12" fill="#f5f0fa"/>${miniDuck(461,98,'#9a75c7',.42)}<text x="461" y="141" text-anchor="middle" class="svg-copy">Occupancy</text><rect x="395" y="154" width="132" height="58" rx="12" fill="url(#sdf-colors)"/>${miniDuck(461,190,'#ffbdab',.35)}<text x="461" y="233" text-anchor="middle" class="svg-copy">Signed distance</text><rect x="395" y="246" width="132" height="62" rx="12" fill="#f5f0fa"/>${miniDuck(461,285,'url(#normal-colors)',.38)}<text x="461" y="332" text-anchor="middle" class="svg-copy">Surface normal</text></svg><div class="scene-bottom"><span>Keypoints → Geometry → Derivatives</span></div></div>`;
}

const addMesh=(parent,geometry,color,position=[0,0,0])=>{const mesh=new THREE.Mesh(geometry,material(color));mesh.position.set(...position);parent.add(mesh);return mesh;};

export function createDeployHand(){
  const hand=new THREE.Group();
  addMesh(hand,new THREE.BoxGeometry(.38,.25,.29),0xd6c6e7,[0,.02,-.02]);
  addMesh(hand,new THREE.BoxGeometry(.29,.16,.025),0x8c64b5,[0,.025,.137]);
  addMesh(hand,new THREE.CylinderGeometry(.085,.105,.15,24),0x4b405b,[0,.215,0]);
  const fingers=[];
  [-.143,-.048,.048,.143].forEach((x,index)=>{
    const root=new THREE.Group();root.position.set(x,-.10,-.220);hand.add(root);
    const knuckle=addMesh(hand,new THREE.CylinderGeometry(.033,.033,.095,12),0xb59bcd,[x,-.085,-.175]);
    knuckle.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(0,-.03,-.09).normalize());
    let pad;const joints=[],lengths=[.185,.135,.105].map(l=>l*(index===3?.85:index===0?.94:1));let parent=root;
    lengths.forEach((length,j)=>{
      const pivot=new THREE.Group();parent.add(pivot);joints.push(pivot);
      addMesh(pivot,new THREE.SphereGeometry(.037,12,8),0x51435f);
      addMesh(pivot,new THREE.CapsuleGeometry(.031,length-.062,4,10),j===2?0xe9ddf3:0xb59bcd,[0,-length/2,0]);
      if(j===2)pad=addMesh(pivot,new THREE.SphereGeometry(.033,12,8),orange,[0,-length+.012,.01]);
      const end=new THREE.Group();end.position.y=-length;pivot.add(end);parent=end;
    });fingers.push({root,joints,pad});
  });
  const thumbRoot=new THREE.Group();thumbRoot.position.set(.18,-.13,.225);hand.add(thumbRoot);
  const bridge=addMesh(hand,new THREE.CapsuleGeometry(.043,.12,4,12),0xb59bcd,[.18,-.075,.155]);
  bridge.rotation.x=-.9;
  const thumb=[];let thumbParent=thumbRoot,thumbPad;
  [.17,.14].forEach((length,j)=>{
    const pivot=new THREE.Group();thumbParent.add(pivot);thumb.push(pivot);
    addMesh(pivot,new THREE.SphereGeometry(.043,12,8),0x51435f);
    addMesh(pivot,new THREE.CapsuleGeometry(.038,length-.076,4,10),j?0xe9ddf3:0xb59bcd,[0,-length/2,0]);
    if(j)thumbPad=addMesh(pivot,new THREE.SphereGeometry(.04,12,8),orange,[0,-length+.016,0]);
    const end=new THREE.Group();end.position.y=-length;pivot.add(end);thumbParent=end;
  });
  function setGrip(close){
    fingers.forEach(({root,joints},i)=>{
      root.rotation.z=(i-1.5)*.06*(1-close);
      joints[0].rotation.x=.48-.41*close;
      joints[1].rotation.x=-.15*close;
      joints[2].rotation.x=-.30*close;
    });
    thumbRoot.rotation.set(0,0,.35-.60*close);
    thumb[0].rotation.x=-.35+.50*close;
    thumb[1].rotation.x=0;
  }
  const joints=[...fingers.flatMap(f=>f.joints),...thumb];
  function setJointAngles(angles){
    joints.forEach((joint,i)=>joint.rotation.x=angles[i]);
    fingers.forEach(({root},i)=>{const p=THREE.MathUtils.clamp((.48-angles[i*3])/.41,0,1);root.rotation.z=(i-1.5)*.06*(1-p);});
    const p=THREE.MathUtils.clamp((angles[12]+.35)/.5,0,1);thumbRoot.rotation.set(0,0,.35-.60*p);
  }
  setGrip(0);return {hand,setGrip,setJointAngles,joints,tips:[...fingers.map(f=>f.pad),thumbPad]};
}

// Articulated teaching hand: joint angles drive the fingers through a grasp cycle.
// Shared pose function keeps the renderer and geometry validation on the same trajectory.
export function poseDeployObjects(hand,duck,elapsed){
  const smooth=(t,a,b)=>{const v=THREE.MathUtils.clamp((t-a)/(b-a),0,1);return v*v*(3-2*v);};
  const t=elapsed%11.5,close=smooth(t,1.6,2.9)*(1-smooth(t,8.3,9.3)),lift=smooth(t,2.9,4.3)*(1-smooth(t,6.6,8.1));
  const travel=smooth(t,4.3,6.4),returning=smooth(t,10,11.5);
  const x=THREE.MathUtils.lerp(-.62,.62,travel)*(1-returning)-.62*returning;
  const hover=.42*(1-smooth(t,0,1.6))+.42*smooth(t,9.3,10.2);
  hand.position.set(x-.02,.62+.65*lift+hover,0);
  duck.position.set(THREE.MathUtils.lerp(-.62,.62,travel),.65*lift,0);
  return {t,close,lift,x,opacity:t>10?1-smooth(t,10,10.6):smooth(t,0,.35)};
}

export function mountDeploy(container){
  const phases=['Approach','Grasp','Lift','Place','Release'];
  container.innerHTML=`<div class="deploy-demo"><div class="deploy-phases" role="group" aria-label="Inspect grasp phases">${phases.map((p,i)=>`<button type="button" data-deploy-phase="${i}" aria-label="Show ${p.toLowerCase()} pose">${p}</button>`).join('')}</div><div class="deploy-canvas"></div><div class="deploy-progress"><span></span></div><div class="scene-bottom"><span>Five fingers · Coordinated grasp</span><button class="text-button deploy-toggle" aria-pressed="false">Pause animation</button></div></div>`;
  const view=sceneBase(container.querySelector('.deploy-canvas'),{compact:true});
  view.camera.position.set(2.4,1.9,3.3);view.camera.lookAt(0,.78,0);view.grid.visible=false;
  view.renderer.domElement.setAttribute('aria-label','Five-finger robotic hand opening, closing around a duck, lifting, moving and placing it');
  const table=addMesh(view.scene,new THREE.CylinderGeometry(1.52,1.52,.045,72),0xeee6f5,[0,-.035,0]);table.scale.z=.64;
  for(const x of [-.62,.62]){
    const ring=addMesh(view.scene,new THREE.TorusGeometry(.30,.008,6,64),x>0?orange:0xc6b0dc,[x,-.006,0]);ring.rotation.x=Math.PI/2;
  }
  const duck=buildObject('duck');duck.scale.setScalar(.32);view.scene.add(duck);
  const {hand,setGrip}=createDeployHand();view.scene.add(hand);
  addMesh(view.scene,new THREE.CylinderGeometry(.21,.25,.13,32),0x8c64b5,[-1.13,.05,-.4]);
  const links=[.09,.075,.058].map(radius=>addMesh(view.scene,new THREE.CylinderGeometry(radius,radius,1,20),0xb6a0cf));
  const armJoints=[0,1,2].map(()=>addMesh(view.scene,new THREE.SphereGeometry(.105,20,12),0x5b4b70));
  const up=new THREE.Vector3(0,1,0),direction=new THREE.Vector3();
  function linkBetween(mesh,a,b){direction.copy(b).sub(a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.y=direction.length();mesh.quaternion.setFromUnitVectors(up,direction.normalize());}
  let paused=matchMedia('(prefers-reduced-motion: reduce)').matches,elapsed=paused?3.5:0,lastPhase=-1;
  const button=container.querySelector('.deploy-toggle'),progress=container.querySelector('.deploy-progress span');
  function update(){
    const {t,close,lift,x,opacity}=poseDeployObjects(hand,duck,elapsed);setGrip(close);
    duck.traverse(n=>{if(n.isMesh){n.material.transparent=true;n.material.opacity=opacity;}});
    const points=[new THREE.Vector3(-1.13,.12,-.4),new THREE.Vector3(-1.12,.53,-.4),new THREE.Vector3(-.58+x*.27,1.51+lift*.10,-.46),hand.position.clone().add(new THREE.Vector3(0,.29,0))];
    links.forEach((link,i)=>linkBetween(link,points[i],points[i+1]));armJoints.forEach((joint,i)=>joint.position.copy(points[i+1]));
    const phase=t<1.6?0:t<2.9?1:t<6.6?2:t<8.3?3:4;
    if(phase!==lastPhase){container.querySelectorAll('[data-deploy-phase]').forEach((node,i)=>{node.classList.toggle('active',i===phase);node.setAttribute('aria-pressed',String(i===phase));});container.dataset.graspPhase=phases[phase].toLowerCase();lastPhase=phase;}
    progress.style.width=`${t/11.5*100}%`;
  }
  function setPause(){button.textContent=paused?'Play animation':'Pause animation';button.setAttribute('aria-pressed',String(paused));}
  container.querySelectorAll('[data-deploy-phase]').forEach((node,i)=>node.addEventListener('click',()=>{elapsed=[.7,2.85,5.2,8.1,9.8][i];paused=true;update();setPause();}));
  button.addEventListener('click',()=>{paused=!paused;setPause();});setPause();update();
  view.animate(dt=>{if(!paused){elapsed+=dt;update();}});
  return ()=>{delete container.dataset.graspPhase;view.dispose();};
}

export function motionMarkup(kind='optimize',phase=1){
  // The animated drawing shares the same geometry-to-action vocabulary across sections.
  const isDeploy=kind==='deploy';
  return `<div class="motion-demo ${isDeploy?'deploy-motion':'optimization-motion'} phase-${phase}"><svg viewBox="0 0 560 345" role="img" aria-label="${isDeploy?'Animated robot arm grasping, lifting, moving and placing a duck':'Animated hand configuration refining toward a duck through geometric gradients'}"><defs><marker id="gradient-arrow-${kind}-${phase}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 10 5 0 10Z" fill="#ff6841"/></marker></defs><ellipse cx="281" cy="277" rx="231" ry="35" fill="#ede5f5"/><path d="M60 280H500 M100 294H465 M148 264H455" stroke="#ddcfe8" fill="none"/><ellipse cx="${isDeploy?393:335}" cy="277" rx="53" ry="18" fill="none" stroke="#ff6841" stroke-dasharray="4 5" opacity=".65"/>${isDeploy?`<g class="pick-object">${miniDuck(240,252,'#efbd65',.43)}</g><g class="robot-base"><path d="M82 261V240H125V261" fill="#a280c7"/><ellipse cx="103" cy="263" rx="32" ry="10" fill="#c9b1e1"/></g><g class="robot-links"><path class="robot-link-back" d="M104 242 L115 158 L192 116 L239 173" fill="none" stroke="#b296d2" stroke-width="19" stroke-linecap="round" stroke-linejoin="round"/><path class="robot-link-front" d="M104 242 L115 158 L192 116 L239 173" fill="none" stroke="#8860b6" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></g><g class="pick-gripper"><path d="M-20 -30V-5L-14 14 M20 -30V-5L14 14 M-20 -30H20" fill="none" stroke="#ff6841" stroke-width="5" stroke-linejoin="round"/></g><text x="393" y="317" class="svg-copy" text-anchor="middle">Place</text><text x="240" y="317" class="svg-copy" text-anchor="middle">Grasp</text>`:`${miniDuck(335,242,'#efbd65',.66)}<g class="gradient-vectors" fill="none" stroke="#ff6841" stroke-width="2" marker-end="url(#gradient-arrow-${kind}-${phase})"><path d="M212 120L266 158 M208 180L271 190 M230 252L285 237"/><path d="M400 105L374 160 M440 200L393 208"/></g><g class="ghost-hand" transform="translate(198 186) rotate(-18)"><path d="M-45 58V-9Q-45 -27 -35 -27V-60Q-35 -72 -25 -67L-18 -25V-78Q-8 -90 -2 -78L5 -25V-69Q16 -82 22 -65L29 -20V-45Q39 -54 43 -39L49 12Q53 47 28 58Z" fill="none" stroke="#c7b1dd" stroke-dasharray="5 5" stroke-width="2"/></g><g class="optimizing-hand"><path d="M-45 58V-9Q-45 -27 -35 -27V-60Q-35 -72 -25 -67L-18 -25V-78Q-8 -90 -2 -78L5 -25V-69Q16 -82 22 -65L29 -20V-45Q39 -54 43 -39L49 12Q53 47 28 58Z" fill="#bca0d8" fill-opacity=".90" stroke="#7846b8" stroke-width="2.5"/><path d="M-18 -25L-9 12 M5 -25L12 15 M29 -20L30 16" fill="none" stroke="#7846b8" stroke-width="2"/><path d="M-28 58L-31 79H21L27 58" fill="#8f66bc"/></g><circle class="contact-pulse" cx="310" cy="207" r="8" fill="none" stroke="#ff6841" stroke-width="2"/><text x="70" y="65" class="svg-label">${['FROZEN GEOMETRY','GRADIENT DESCENT','DEMONSTRATIONS','FEEDBACK POLICY'][phase]}</text><text x="70" y="87" class="svg-copy">${['Occupancy · SDF · Normals','∂L / ∂q → hand configuration','State → optimized action','Observation → action'][phase]}</text>${phase===2?'<path class="demo-trace" d="M165 240Q190 88 300 182" stroke="#7846b8" stroke-width="2" fill="none" stroke-dasharray="3 7"/><circle class="trace-point" r="5" fill="#ff6841"/>':''}`}</svg><div class="motion-progress"><span></span></div><div class="scene-bottom"><span>${isDeploy?'Approach → Grasp → Lift → Place':['Query the frozen field','Refine the hand configuration','Collect state-action pairs','Execute the learned policy'][phase]}</span><button class="text-button motion-toggle" aria-pressed="false">Pause animation</button></div></div>`;
}

export function wireMotion(container){const button=container.querySelector('.motion-toggle');if(matchMedia('(prefers-reduced-motion: reduce)').matches){container.classList.add('animation-paused');if(button){button.textContent='Play animation';button.setAttribute('aria-pressed','true');}}button?.addEventListener('click',()=>{const paused=container.classList.toggle('animation-paused');button.textContent=paused?'Play animation':'Pause animation';button.setAttribute('aria-pressed',String(paused));});}
