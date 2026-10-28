import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { createLocalProjector } from './representation-constraints.js';

const ASSETS = new URL('./representation/', import.meta.url);
const PALETTE = {pliers:0x506477,faucet:0xb5bcc2,toilet:0xeeeae2,cabinet:0x96704c,human:0xc58f71,horse:0x82451f,cow:0x6a4d37,hippo:0x7b777b,xhand:0x30343a};
const clone = value => JSON.parse(JSON.stringify(value));
const vec = value => new THREE.Vector3().fromArray(value);

async function json(name) {
  const response = await fetch(new URL(name, ASSETS));
  if (!response.ok) throw new Error(`Geometry resource unavailable: ${name}`);
  return response.json();
}

export function decodeGeometry(buffer) {
  const header = new DataView(buffer), count=header.getUint32(4,true), faces=header.getUint32(8,true);
  if (String.fromCharCode(...new Uint8Array(buffer,0,4))!=='AWRG' || header.getUint32(12,true)!==1 || buffer.byteLength!==16+count*32+faces*12) throw new Error('Invalid geometry asset');
  let offset=16;
  const positions=new Float32Array(buffer,offset,count*3);offset+=count*12;
  const indices=new Uint32Array(buffer,offset,faces*3);offset+=faces*12;
  const joints=new Uint8Array(buffer,offset,count*4);offset+=count*4;
  const weights=new Float32Array(buffer,offset,count*4);
  return {positions,indices,joints,weights,count};
}

function geometryFor(data) {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(data.positions.slice(),3).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(new THREE.BufferAttribute(data.indices,1));
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

function orientation(id, descriptor) {
  const up=id==='human' ? new THREE.Quaternion() : new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
  if (id==='xhand') return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(0,1,0,0,0,0,1,0,1,0,0,0,0,0,0,1));
  if (descriptor.type==='partnet') up.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI*.75));
  return up;
}

function lightScene(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff,0xbcb3cc,2.4));
  const key=new THREE.DirectionalLight(0xffffff,2.6);key.position.set(2,4,5);scene.add(key);
  const fill=new THREE.DirectionalLight(0xe8e0ff,.8);fill.position.set(-3,1,-2);scene.add(fill);
}

function cameraFit(camera, bounds, id, aspect, padding=1.35) {
  const center=bounds.getCenter(new THREE.Vector3()), size=bounds.getSize(new THREE.Vector3());
  const radius=size.length()/2;
  const distance=Math.max(size.y,size.x/aspect)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*padding+radius*.3;
  const direction=id==='pliers' ? new THREE.Vector3(.35,2.5,2.0) : new THREE.Vector3(.8,.48,2.3);
  camera.aspect=aspect;camera.position.copy(center).addScaledVector(direction.normalize(),distance);camera.near=.01;camera.far=40;camera.lookAt(center);camera.updateProjectionMatrix();
  return center;
}

function sampleSurface(geometry,count=14000) {
  const p=geometry.attributes.position,index=geometry.index;
  const areas=new Float64Array(index.count/3);let area=0;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let i=0;i<areas.length;i++) {
    a.fromBufferAttribute(p,index.getX(i*3));b.fromBufferAttribute(p,index.getX(i*3+1));c.fromBufferAttribute(p,index.getX(i*3+2));
    area+=b.sub(a).cross(c.sub(a)).length()*.5;areas[i]=area;
  }
  let seed=7181;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const triangles=new Uint32Array(count*3),weights=new Float32Array(count*3);
  for(let i=0;i<count;i++) {
    const target=random()*area;let lo=0,hi=areas.length-1;
    while(lo<hi){const middle=(lo+hi)>>1;if(areas[middle]<target)lo=middle+1;else hi=middle;}
    const u=Math.sqrt(random()),v=random();
    for(let j=0;j<3;j++)triangles[i*3+j]=index.getX(lo*3+j);
    weights.set([1-u,u*(1-v),u*v],i*3);
  }
  return {count,triangles,weights,area,positions:new Float32Array(count*3),normals:new Float32Array(count*3),quaternions:new Float32Array(count*4)};
}

function updateSamples(samples, geometry) {
  const p=geometry.attributes.position.array,n=geometry.attributes.normal.array;
  const normal=new THREE.Vector3(),q=new THREE.Quaternion(),z=new THREE.Vector3(0,0,1);
  for(let i=0;i<samples.count;i++) {
    const offset=i*3;
    for(let axis=0;axis<3;axis++) {
      let point=0,direction=0;
      for(let j=0;j<3;j++) {const vertex=samples.triangles[offset+j]*3+axis,w=samples.weights[offset+j];point+=p[vertex]*w;direction+=n[vertex]*w;}
      samples.positions[offset+axis]=point;samples.normals[offset+axis]=direction;
    }
    normal.fromArray(samples.normals,offset).normalize();normal.toArray(samples.normals,offset);
    q.setFromUnitVectors(z,normal).toArray(samples.quaternions,i*4);
  }
}

function normalLines(samples) {
  const positions=[];const p=new THREE.Vector3(),n=new THREE.Vector3(),side=new THREE.Vector3();
  for(let i=0;i<samples.count;i+=87) {
    p.fromArray(samples.positions,i*3);n.fromArray(samples.normals,i*3);
    const tip=p.clone().addScaledVector(n,.035),base=p.clone().addScaledVector(n,.027);
    side.crossVectors(n,new THREE.Vector3(.3,1,.2)).normalize().multiplyScalar(.004);
    positions.push(...p,...tip,...tip,...base.clone().add(side),...tip,...base.sub(side));
  }
  return new THREE.Float32BufferAttribute(positions,3);
}

function deform(data, projector, state, geometry, restFrames) {
  const preview=projector.preview(state),source=data.positions,out=geometry.attributes.position.array;
  if(projector.descriptor.type==='skinning') {
    const d=projector.descriptor,t=projector.transforms;
    for(let i=0;i<data.count;i++) {
      const x=source[i*3]*d.side+d.center[0],y=source[i*3+1]*d.side+d.center[1],z=source[i*3+2]*d.side+d.center[2];
      for(let axis=0;axis<3;axis++) {
        let result=0;
        for(let j=0;j<4;j++){const offset=data.joints[i*4+j]*12+axis*4;result+=data.weights[i*4+j]*(t[offset]*x+t[offset+1]*y+t[offset+2]*z+t[offset+3]);}
        out[i*3+axis]=(result-d.center[axis])/d.side;
      }
    }
  } else {
    const transforms=restFrames.map(({part,inverse})=>new THREE.Matrix4().set(...projector.partTransforms.get(part)).multiply(inverse).elements);
    for(let i=0;i<data.count;i++) {
      const m=transforms[data.joints[i*4]],x=source[i*3],y=source[i*3+1],z=source[i*3+2];
      out[i*3]=m[0]*x+m[4]*y+m[8]*z+m[12];out[i*3+1]=m[1]*x+m[5]*y+m[9]*z+m[13];out[i*3+2]=m[2]*x+m[6]*y+m[10]*z+m[14];
    }
  }
  geometry.attributes.position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return preview;
}

export async function mountRepresentationWorkbench() {
  const $=selector=>document.querySelector(selector),root=$('#representation-workbench'),viewer=$('#representation-viewer'),canvas=$('#representation-canvas'),overlay=$('#representation-handles'),loading=$('#representation-loading');
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));renderer.setClearColor(0xffffff);renderer.outputColorSpace=THREE.SRGBColorSpace;canvas.append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xffffff);lightScene(scene);
  const camera=new THREE.PerspectiveCamera(35,1,.01,40),controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=false;controls.enablePan=false;controls.minDistance=.5;controls.maxDistance=5;
  const thumbnailRenderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});thumbnailRenderer.setSize(160,112);thumbnailRenderer.setClearColor(0xffffff);thumbnailRenderer.outputColorSpace=THREE.SRGBColorSpace;
  const assets=new Map(),poses=new Map(),buttons=new Map();let selected=null,mode='sdf',normals=false,frame=0,revision=0,selection=0,drag=null;
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();

  function invalidate(){if(!frame)frame=requestAnimationFrame(render);}
  function handlesPosition() {
    if(!selected)return;
    selected.group.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    selected.markers.forEach((node,i)=>{
      const point=vec(selected.preview.handles[i]);selected.group.localToWorld(point);point.project(camera);
      const visible=point.z>=-1&&point.z<=1&&Math.abs(point.x)<.98&&Math.abs(point.y)<.96;
      node.hidden=!visible;node.style.transform=`translate(${(point.x*.5+.5)*canvas.clientWidth-10}px,${(-point.y*.5+.5)*canvas.clientHeight-10}px)`;
    });
  }
  function render(){frame=0;handlesPosition();renderer.render(scene,camera);}
  controls.addEventListener('change',invalidate);
  function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(selected)fit();else invalidate();}
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);resize();
  function fit(){if(!selected)return;selected.group.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(selected.surface);controls.target.copy(cameraFit(camera,bounds,selected.meta.id,canvas.clientWidth/canvas.clientHeight));controls.update();invalidate();}

  function thumbnail(asset) {
    const s=new THREE.Scene();s.background=new THREE.Color(0xffffff);lightScene(s);
    const geometry=geometryFor(asset.data),material=new THREE.MeshStandardMaterial({color:PALETTE[asset.meta.id],roughness:.75,metalness:.08,side:THREE.DoubleSide});
    const group=new THREE.Group();group.quaternion.copy(orientation(asset.meta.id,asset.descriptor));group.add(new THREE.Mesh(geometry,material));s.add(group);group.updateMatrixWorld(true);
    const cam=new THREE.PerspectiveCamera(35,160/112,.01,40);cameraFit(cam,new THREE.Box3().setFromObject(group),asset.meta.id,160/112,1.20);
    thumbnailRenderer.render(s,cam);buttons.get(asset.meta.id).querySelector('img').src=thumbnailRenderer.domElement.toDataURL('image/png');geometry.dispose();material.dispose();
  }

  async function load(meta) {
    if(!assets.has(meta.id))assets.set(meta.id,(async()=>{
      const [descriptor,response]=await Promise.all([json(meta.constraints),fetch(new URL(meta.geometry,ASSETS))]);
      if(!response.ok)throw new Error(`Could not load ${meta.name}`);
      const data=decodeGeometry(await response.arrayBuffer()),asset={meta,descriptor,data};thumbnail(asset);return asset;
    })());
    return assets.get(meta.id);
  }

  function updateGeometry(state) {
    if(!selected)return;
    selected.preview=deform(selected.data,selected.projector,state,selected.geometry,selected.restFrames);
    poses.set(selected.meta.id,clone(selected.preview.state));
    updateSamples(selected.samples,selected.geometry);
    selected.points.geometry.attributes.position.needsUpdate=true;
    selected.arrows.geometry.setAttribute('position',normalLines(selected.samples));
    root.dataset.pose=JSON.stringify(selected.preview.state);root.dataset.poseRevision=String(++revision);
    let displacement=0;const current=selected.geometry.attributes.position.array;
    for(let i=0;i<current.length;i++)displacement=Math.max(displacement,Math.abs(current[i]-selected.data.positions[i]));
    root.dataset.geometryDisplacement=displacement.toFixed(6);
    invalidate();
  }

  function setMode(next) {
    mode=next;root.dataset.mode=mode;
    document.querySelectorAll('[data-representation-mode]').forEach(button=>{const active=button.dataset.representationMode===mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    $('#representation-normal-option').hidden=mode!=='sdf';
    if(selected){selected.surface.visible=mode==='sdf';selected.surface.material=normals?selected.normalMaterial:selected.material;selected.points.visible=mode==='occupancy';selected.arrows.visible=mode==='sdf'&&normals;}
    invalidate();
  }

  function ray(event) {
    const bounds=canvas.getBoundingClientRect();pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);raycaster.setFromCamera(pointer,camera);return raycaster.ray;
  }
  function projectTarget(handle,target) {
    const result=selected.projector.project(selected.preview.state,handle,target.toArray());
    updateGeometry(result.state);
  }
  function beginDrag(event,index,node) {
    if(!selected || selected.meta.handles[index].draggable===false || event.button!==0)return;
    event.preventDefault();event.stopPropagation();controls.enabled=false;
    const position=selected.group.localToWorld(vec(selected.preview.handles[index]));
    drag={index,node,pointer:event.pointerId,plane:new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),position),before:clone(selected.preview.state)};
    node.setPointerCapture(event.pointerId);node.classList.add('dragging');root.dataset.dragging='true';
  }
  function moveDrag(event) {
    if(!drag || event.pointerId!==drag.pointer)return;
    const point=ray(event).intersectPlane(drag.plane,new THREE.Vector3());
    if(point){selected.group.worldToLocal(point);projectTarget(drag.index,point);}
    event.preventDefault();
  }
  function endDrag(event,cancel=false) {
    if(!drag || (event&&event.pointerId!==drag.pointer))return;
    const current=drag;drag=null;current.node.classList.remove('dragging');
    if(current.node.hasPointerCapture(current.pointer))current.node.releasePointerCapture(current.pointer);
    controls.enabled=true;root.dataset.dragging='false';
    if(cancel)updateGeometry(current.before);
  }
  overlay.addEventListener('pointermove',moveDrag);
  overlay.addEventListener('pointerup',event=>{moveDrag(event);endDrag(event);});
  overlay.addEventListener('pointercancel',event=>endDrag(event,true));
  function keyboardHandle(event,index) {
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();const dx=event.key==='ArrowLeft'?-.018:event.key==='ArrowRight'?.018:0,dy=event.key==='ArrowDown'?-.018:event.key==='ArrowUp'?.018:0;
    const point=selected.group.localToWorld(vec(selected.preview.handles[index]));
    const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
    point.addScaledVector(right,dx).addScaledVector(up,dy);selected.group.worldToLocal(point);projectTarget(index,point);
  }

  function disposeSelected() {
    if(!selected)return;
    endDrag(null);scene.remove(selected.group);selected.geometry.dispose();selected.material.dispose();selected.normalMaterial.dispose();selected.points.geometry.dispose();selected.points.material.dispose();selected.arrows.geometry.dispose();selected.arrows.material.dispose();selected=null;overlay.replaceChildren();
  }

  async function choose(meta) {
    const token=++selection;loading.hidden=false;loading.textContent='Loading geometry…';
    try {
      const asset=await load(meta);if(token!==selection)return;disposeSelected();
      const geometry=geometryFor(asset.data),projector=createLocalProjector(asset.descriptor);projector.preview(meta.state);
      const restFrames=meta.parts.map(part=>({part,inverse:new THREE.Matrix4().set(...projector.partTransforms.get(part)).invert()}));
      const material=new THREE.MeshStandardMaterial({color:PALETTE[meta.id],roughness:.76,metalness:meta.id==='faucet'?.38:.03,side:THREE.DoubleSide}),normalMaterial=new THREE.MeshNormalMaterial({side:THREE.DoubleSide});
      const surface=new THREE.Mesh(geometry,material),group=new THREE.Group();group.quaternion.copy(orientation(meta.id,asset.descriptor));group.add(surface);scene.add(group);
      const samples=sampleSurface(geometry);updateSamples(samples,geometry);
      const pointGeometry=new THREE.BufferGeometry();pointGeometry.setAttribute('position',new THREE.BufferAttribute(samples.positions,3).setUsage(THREE.DynamicDrawUsage));
      const points=new THREE.Points(pointGeometry,new THREE.PointsMaterial({color:0x9272b4,size:.0045,sizeAttenuation:true}));points.frustumCulled=false;group.add(points);
      const normalGeometry=new THREE.BufferGeometry();normalGeometry.setAttribute('position',normalLines(samples));
      const arrows=new THREE.LineSegments(normalGeometry,new THREE.LineBasicMaterial({color:0x54426c,transparent:true,opacity:.7}));arrows.frustumCulled=false;group.add(arrows);
      selected={...asset,group,geometry,projector,restFrames,material,normalMaterial,surface,samples,points,arrows,markers:[]};
      meta.handles.forEach((handle,index)=>{
        const node=document.createElement(handle.draggable?'button':'span');node.className=`representation-handle${handle.primary?' primary':''}${handle.draggable?'':' fixed'}`;node.dataset.handle=String(index);
        if(handle.draggable){node.type='button';node.setAttribute('aria-label',`Drag ${meta.name} ${handle.label} keypoint ${index+1}`);node.title=handle.label;node.addEventListener('pointerdown',event=>beginDrag(event,index,node));node.addEventListener('keydown',event=>keyboardHandle(event,index));}
        else node.setAttribute('aria-hidden','true');
        overlay.append(node);selected.markers.push(node);
      });
      $('#representation-object-name').textContent=meta.name;root.dataset.object=meta.id;root.dataset.keypointCount=String(meta.handles.length);
      buttons.forEach((button,id)=>{button.classList.toggle('active',id===meta.id);button.setAttribute('aria-pressed',String(id===meta.id));});
      updateGeometry(poses.get(meta.id)||meta.state);setMode(mode);fit();loading.hidden=true;root.dataset.ready='true';
    } catch(error) {console.error(error);loading.textContent='Geometry could not be loaded. Refresh to retry.';root.dataset.ready='error';}
  }

  document.querySelectorAll('[data-representation-mode]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.representationMode)));
  $('#representation-normal-toggle').addEventListener('change',event=>{normals=event.target.checked;setMode(mode);});
  $('#representation-view-reset').addEventListener('click',fit);
  $('#representation-pose-reset').addEventListener('click',()=>{endDrag(null);if(selected)updateGeometry(selected.meta.state);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&drag)endDrag(null,true);});
  try {
    const catalog=await json('catalog.json');
    for(const meta of catalog) {
      const button=document.createElement('button');button.type='button';button.className='representation-object';button.dataset.object=meta.id;button.setAttribute('aria-label',`Show ${meta.name}`);button.setAttribute('aria-pressed','false');
      const image=document.createElement('img');image.alt='';image.width=160;image.height=112;const name=document.createElement('span');name.textContent=meta.name;button.append(image,name);button.addEventListener('click',()=>choose(meta));buttons.set(meta.id,button);$('#representation-picker').append(button);
    }
    await choose(catalog.find(meta=>meta.id==='horse'));
    for(const meta of catalog) await load(meta);
    root.dataset.catalogReady='true';thumbnailRenderer.dispose();
  } catch(error) {console.error(error);loading.hidden=false;loading.textContent='Geometry could not be loaded. Refresh to retry.';root.dataset.ready='error';}
  addEventListener('pagehide',event=>{if(event.persisted)return;if(frame)cancelAnimationFrame(frame);resizeObserver.disconnect();controls.dispose();disposeSelected();renderer.dispose();});
}
