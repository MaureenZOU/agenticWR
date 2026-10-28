import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
export { THREE };
const resources=new Map();
export const copy=x=>JSON.parse(JSON.stringify(x));
export function resource(path){if(!resources.has(path))resources.set(path,fetch(new URL(path,import.meta.url)).then(r=>{if(!r.ok)throw Error(`Asset unavailable: ${path}`);return r.json();}));return resources.get(path);}
export function geometry(data){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.vertices,3));g.setIndex(data.faces);g.computeVertexNormals();g.computeBoundingBox();return g;}
export function quaternion(q){return new THREE.Quaternion(q[1],q[2],q[3],q[0]);}
export function matrixQuaternion(m){return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(m[0],m[1],m[2],0,m[3],m[4],m[5],0,m[6],m[7],m[8],0,0,0,0,1));}
export function material(color){return new THREE.MeshStandardMaterial({color:Array.isArray(color)?new THREE.Color().setRGB(...color.slice(0,3)):color,roughness:.64,metalness:.13,side:THREE.DoubleSide});}
function meshPart(part){const mesh=new THREE.Mesh(geometry(part),material(part.color));mesh.position.fromArray(part.pos);mesh.quaternion.copy(part.matrix?matrixQuaternion(part.matrix):quaternion(part.quat));mesh.castShadow=true;mesh.receiveShadow=true;return mesh;}
export function createStage(host,{side='right',compact=false,workspace=false}={}){
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.append(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color(0xeef1f4);scene.fog=new THREE.Fog(0xeef1f4,4,8);
 scene.add(new THREE.HemisphereLight(0xffffff,0x667384,2.3));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-1.2,3,2);light.castShadow=true;light.shadow.mapSize.set(1024,1024);Object.assign(light.shadow.camera,{left:-2,right:2,top:2,bottom:-2,near:.1,far:8});light.shadow.bias=-.001;light.shadow.normalBias=.002;scene.add(light);
 const fill=new THREE.DirectionalLight(0xd6e5ff,1);fill.position.set(2,1,-2);scene.add(fill);
 const native=new THREE.Group();native.rotation.x=-Math.PI/2;scene.add(native);
 const box=(size,pos,color)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material(color));m.position.set(...pos);m.receiveShadow=true;native.add(m);return m;};
 box([1.96,1.36,.07],[0,0,.715],0x89959f);for(const x of [-.85,.85])for(const y of [-.55,.55])box([.05,.05,.68],[x,y,.34],0x586473);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),material(0xdbe1e7));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
 const grid=new THREE.GridHelper(10,50,0xc5ced6,0xd1d9e0);grid.position.y=.002;grid.material.transparent=true;grid.material.opacity=.3;scene.add(grid);
 const camera=new THREE.PerspectiveCamera(35,1,.01,30);const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.enablePan=true;controls.minDistance=.18;controls.maxDistance=workspace?12:4;controls.maxPolarAngle=Math.PI*.49;
 const target=new THREE.Vector3(0,compact?1.05:.92,compact?-.1:.04);
 function reset(){camera.position.set(side==='left'?.95:-.95,compact?1.48:1.65,compact?1.05:1.72);controls.target.copy(target);if(workspace){camera.position.set(3.2,3.2,4.2);controls.target.set(0,.65,0);scene.fog.near=12;scene.fog.far=25;}controls.update();}
 reset();function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
 const observer=new ResizeObserver(resize);observer.observe(host);resize();
 const raycaster=new THREE.Raycaster();function ray(e){const b=host.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2(2*(e.clientX-b.left)/b.width-1,1-2*(e.clientY-b.top)/b.height),camera);return raycaster;}
 return {host,renderer,scene,native,camera,controls,reset,resize,ray,render:()=>renderer.render(scene,camera),dispose(){observer.disconnect();controls.dispose();renderer.dispose();}};
}
export class NativeHand {
 constructor(data){this.data=data;this.root=new THREE.Group();this.nodes=[];this.joints=data.joints;this.q=data.joints.map(j=>j.home);this.base=[];
  data.bodies.forEach((body,i)=>{const node=new THREE.Group();node.name=body.name;node.position.fromArray(body.pos);node.quaternion.copy(quaternion(body.quat));this.base.push({position:node.position.clone(),rotation:node.quaternion.clone()});this.nodes.push(node);(body.parent<0?this.root:this.nodes[body.parent]).add(node);body.geoms.forEach(g=>node.add(meshPart(g)));});
  this.handles=data.bodies.map((b,i)=>({body:i,joint:b.joint})).filter(x=>x.joint!==undefined);
  this.set(this.q);
 }
 set(q){this.q=q.map((v,i)=>THREE.MathUtils.clamp(v,...this.joints[i].range));this.joints.forEach((j,i)=>{const node=this.nodes[j.body],base=this.base[j.body],r=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...j.axis),this.q[i]);const pivot=new THREE.Vector3(...j.pivot);node.position.copy(base.position).add(pivot.clone().sub(pivot.clone().applyQuaternion(r)).applyQuaternion(base.rotation));node.quaternion.copy(base.rotation).multiply(r);});this.root.updateMatrixWorld(true);}
 // Fingertip and distal-link positions keep the loss sensitive to every bend.
 points(){this.root.updateMatrixWorld(true);return this.handles.map(({body})=>{const node=this.nodes[body];const b=new THREE.Box3();for(const child of node.children)if(child.isMesh){child.geometry.computeBoundingBox();b.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrix));}const p=b.isEmpty()?new THREE.Vector3(0,0,.012):b.getCenter(new THREE.Vector3());return node.localToWorld(p);});}
 solve(index,target,iterations=3){for(let n=0;n<iterations;n++){const before=this.q.slice(),p=this.points()[index],error=target.clone().sub(p);if(error.length()<.0005)break;const jac=[];for(let i=0;i<this.q.length;i++){const q=before.slice();q[i]+=.002;this.set(q);jac.push(this.points()[index].sub(p).multiplyScalar(500));}this.set(before);const denominator=.001+jac.reduce((s,v)=>s+v.lengthSq(),0);this.set(before.map((v,i)=>v+THREE.MathUtils.clamp(jac[i].dot(error)/denominator,-.10,.10)));}return this.q;}
}
export async function addRobot(stage,side){const rigs=await resource('./lab/rigs.json'),src=rigs[side];const arm=new THREE.Group();src.arm.forEach(p=>arm.add(meshPart(p)));stage.native.add(arm);const hand=new NativeHand(src.hand);hand.root.position.fromArray(src.hand.mount.pos);hand.root.quaternion.copy(matrixQuaternion(src.hand.mount.matrix));stage.native.add(hand.root);return {arm,hand,rigs};}
export function handleOverlay(stage,layer,{points,drag,onStart=()=>{},label='Keypoint',labels=()=>[]}){
 let active=null,nodes=[];
 function rebuild(count){layer.replaceChildren();nodes=Array.from({length:count},(_,i)=>{const button=document.createElement('button');button.type='button';button.className='lab-keypoint';button.setAttribute('aria-label',`${label} ${i+1}`);button.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();onStart();const p=points()[i];active={i,node:button,id:e.pointerId,plane:new THREE.Plane().setFromNormalAndCoplanarPoint(stage.camera.getWorldDirection(new THREE.Vector3()),p)};stage.controls.enabled=false;button.setPointerCapture(e.pointerId);button.classList.add('dragging');});button.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();onStart();const p=points()[i];p.addScaledVector(new THREE.Vector3().setFromMatrixColumn(stage.camera.matrixWorld,e.key==='ArrowLeft'||e.key==='ArrowRight'?0:1),e.key==='ArrowLeft'||e.key==='ArrowDown'?-.012:.012);drag(i,p);});layer.append(button);return button;});}
 function end(e){if(!active||e.pointerId!==active.id)return;active.node.classList.remove('dragging');if(active.node.hasPointerCapture(active.id))active.node.releasePointerCapture(active.id);active=null;stage.controls.enabled=true;}
 layer.addEventListener('pointermove',e=>{if(!active||e.pointerId!==active.id)return;const p=stage.ray(e).ray.intersectPlane(active.plane,new THREE.Vector3());if(p)drag(active.i,p);});layer.addEventListener('pointerup',end);layer.addEventListener('pointercancel',end);
 return {update(visible=true){const p=points();if(nodes.length!==p.length)rebuild(p.length);stage.camera.updateMatrixWorld();p.forEach((point,i)=>{const a=point.clone().project(stage.camera);nodes[i].setAttribute('aria-label',labels()[i]||`${label} ${i+1}`);nodes[i].title=labels()[i]||`${label} ${i+1}`;nodes[i].hidden=!visible||a.z< -1||a.z>1||Math.abs(a.x)>.96||Math.abs(a.y)>.94;nodes[i].style.transform=`translate(${(a.x*.5+.5)*stage.host.clientWidth-5}px,${(-a.y*.5+.5)*stage.host.clientHeight-5}px)`;});},get dragging(){return !!active;}};
}
