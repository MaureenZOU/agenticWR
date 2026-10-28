import * as THREE from './vendor/three.module.js';

// RGB-D and representation illustrations use the same scene geometry and poses.
// The hand and duck meshes are exported from the existing MuJoCo demo.
const TYPES = ['duck', 'mug', 'xhand', 'bottle', 'faucet', 'pliers'];
const COLORS = [0xe6b849, 0x6a95c0, 0x3e414b, 0x68aca9, 0x8398ad, 0xb9664d];
const normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
const surfaceCache = new WeakMap();

function surfaceSamples(geometry, count) {
  let cache = surfaceCache.get(geometry);
  if (!cache) { cache = new Map(); surfaceCache.set(geometry, cache); }
  if (cache.has(count)) return cache.get(count);
  const p = geometry.attributes.position, n = geometry.attributes.normal, index = geometry.index;
  const triangles = [], areas = []; let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < (index?.count || p.count); i += 3) {
    const ids = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j);
    a.fromBufferAttribute(p, ids[0]); b.fromBufferAttribute(p, ids[1]); c.fromBufferAttribute(p, ids[2]);
    total += b.sub(a).cross(c.sub(a)).length() * .5;
    areas.push(total); triangles.push(ids);
  }
  let seed = 8121; const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const positions = [], normals = [];
  for (let i = 0; i < count; i++) {
    const area = random() * total; let lo = 0, hi = areas.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (areas[mid] < area) lo = mid + 1; else hi = mid; }
    const ids = triangles[lo], u = Math.sqrt(random()), v = random(), weights = [1 - u, u * (1 - v), u * v];
    const point = new THREE.Vector3(), normal = new THREE.Vector3();
    ids.forEach((id, j) => { point.addScaledVector(a.fromBufferAttribute(p, id), weights[j]); normal.addScaledVector(a.fromBufferAttribute(n, id), weights[j]); });
    positions.push(...point.toArray()); normals.push(...normal.normalize().toArray());
  }
  geometry.userData.surfaceArea=total;
  const samples = { positions, normals }; cache.set(count, samples); return samples;
}

function geometryFrom(data, rotate = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices, 3));
  geometry.setIndex(data.faces);
  if (rotate) {
    const r = data.rotation;
    geometry.applyMatrix4(new THREE.Matrix4().set(r[0][0],r[0][1],r[0][2],0,r[1][0],r[1][1],r[1][2],0,r[2][0],r[2][1],r[2][2],0,0,0,0,1));
  }
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); return geometry;
}

function normalArrows(geometry, count) {
  const { positions, normals } = surfaceSamples(geometry, count);
  geometry.computeBoundingBox();
  const length = geometry.boundingBox.getSize(new THREE.Vector3()).length() * .075;
  const lines = [], origin = new THREE.Vector3(), direction = new THREE.Vector3(), side = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    origin.fromArray(positions, i * 3); direction.fromArray(normals, i * 3);
    const tip = origin.clone().addScaledVector(direction, length);
    side.crossVectors(direction, new THREE.Vector3(.2, 1, .1)).normalize().multiplyScalar(length * .18);
    const base = tip.clone().addScaledVector(direction, -length * .30);
    lines.push(...origin.toArray(), ...tip.toArray(), ...tip.toArray(), ...base.clone().add(side).toArray(), ...tip.toArray(), ...base.sub(side).toArray());
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x61497e, transparent: true, opacity: .88 }));
}

function meshFor(geometry, color, mode, detail = false, pointCount = detail ? 110 : 1200) {
  const group = new THREE.Group();
  if (mode === 'points') {
    const samples = surfaceSamples(geometry, pointCount);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(samples.positions, 3));
    group.add(new THREE.Points(g, new THREE.PointsMaterial({ color, size: detail ? 1.25 : 1.5, sizeAttenuation: false })));
  } else {
    group.add(new THREE.Mesh(geometry, mode === 'normals' ? normalMaterial : new THREE.MeshStandardMaterial({ color, roughness: .45, metalness: detail ? .25 : .04 })));
    if (mode === 'normals') group.add(normalArrows(geometry, detail ? 2 : 11));
  }
  return group;
}

function makeLibrary(asset) {
  const geometries = {
    duck: geometryFrom(asset.objects.duck, true),
    mug: new THREE.LatheGeometry([[0,0],[.30,0],[.35,.035],[.37,.10],[.37,.89],[.36,.94],[.315,.94],[.305,.89],[.305,.14],[.28,.11],[0,.11]].map(p => new THREE.Vector2(...p)), 64),
    mugHandle: new THREE.TorusGeometry(.275,.055,16,40,Math.PI).rotateZ(-Math.PI/2).translate(.34,.49,0),
    bottle: new THREE.LatheGeometry([[0,0],[.23,0],[.27,.06],[.27,.62],[.19,.76],[.10,.80],[.10,1.02],[.12,1.02],[.12,1.08],[0,1.08]].map(p => new THREE.Vector2(...p)), 32)
  };
  const native = {xhand:asset.hand, ...asset.articulated};
  const nativeGeometries = Object.fromEntries(Object.entries(native).map(([type,data])=>[type,data.meshes.map(m=>geometryFrom(m))]));
  const nativePointCounts=Object.fromEntries(Object.entries(nativeGeometries).map(([type,parts])=>{
    parts.forEach(g=>surfaceSamples(g,1));
    const area=parts.reduce((sum,g)=>sum+g.userData.surfaceArea,0);
    return [type,parts.map(g=>Math.max(24,Math.round(3200*g.userData.surfaceArea/area)))];
  }));
  const matrix = new THREE.Matrix4(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  function quaternion(row, target) {
    matrix.set(row[3],row[4],row[5],0,row[6],row[7],row[8],0,row[9],row[10],row[11],0,0,0,0,1);
    return target.setFromRotationMatrix(matrix);
  }
  return function object(type, mode = 'rgb') {
    const raw = new THREE.Group(), color = COLORS[TYPES.indexOf(type)];
    let animate = () => {};
    if (native[type]) {
      const data=native[type];
      const basis = new THREE.Group(); basis.rotation.x = type==='pliers' ? 0 : -Math.PI / 2; raw.add(basis);
      const links = nativeGeometries[type].map((g, i) => {
        const c = mode === 'points' ? (type==='xhand'?0x76558f:color) : type==='faucet'?new THREE.Color(0x5d7e96):new THREE.Color().setRGB(...data.meshes[i].color);
        const node = meshFor(g, c, mode, true,nativePointCounts[type][i]); basis.add(node); return node;
      });
      animate = t => {
        const progress=type==='xhand' ? .5-.5*Math.cos(t*Math.PI*2/10) : (t%10)/10;
        const f = progress * (data.poses.length - 1);
        const a = Math.floor(f), b = Math.min(a + 1, data.poses.length - 1);
        links.forEach((node, i) => {
          const p = data.poses[a][i], q = data.poses[b][i];
          node.position.set(THREE.MathUtils.lerp(p[0],q[0],f-a),THREE.MathUtils.lerp(p[1],q[1],f-a),THREE.MathUtils.lerp(p[2],q[2],f-a));
          node.quaternion.copy(quaternion(p,qa)).slerp(quaternion(q,qb),f-a);
        });
      };
      if(type==='faucet') raw.rotation.y=Math.PI/4;
      else raw.rotation.z=Math.PI/2;
    } else {
      raw.add(meshFor(geometries[type], color, mode));
      if(type==='mug') raw.add(meshFor(geometries.mugHandle,color,mode));
    }
    // Measure in the object's own coordinates, independently of its grid placement.
    // Centering each pose prevents the native wrist trajectory from moving a cell.
    const box=new THREE.Box3(), partBox=new THREE.Box3(), size=new THREE.Vector3(), center=new THREE.Vector3();
    function measure(node, parent=new THREE.Matrix4()) {
      node.updateMatrix(); const transform=parent.clone().multiply(node.matrix);
      if(node.isMesh || node.isPoints) {
        if(!node.geometry.boundingBox) node.geometry.computeBoundingBox();
        box.union(partBox.copy(node.geometry.boundingBox).applyMatrix4(transform));
      }
      node.children.forEach(child=>measure(child,transform));
    }
    let extent=0;
    for(const t of [0,2.5,5,7.5]) { animate(t);box.makeEmpty();measure(raw);box.getSize(size);extent=Math.max(extent,size.x,size.y,size.z); }
    const displaySize={duck:1.0,mug:.92,xhand:1.16,bottle:.92,faucet:1.12,pliers:1.06};
    const root=new THREE.Group();root.add(raw);root.scale.setScalar(displaySize[type]/extent);
    const normalizedSize=new THREE.Vector3();
    const update=t=>{
      animate(t);raw.position.set(0,0,0);box.makeEmpty();measure(raw);
      raw.position.copy(box.getCenter(center)).negate();box.getSize(normalizedSize).multiplyScalar(root.scale.x);
    };
    update(0);
    return {root,update,size:normalizedSize};
  };
}

function rendererFor(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);
  renderer.setSize(container.clientWidth, container.clientHeight, false);
  renderer.setScissorTest(true);
  return renderer;
}

function fitRenderer(renderer, width, height) {
  const size = renderer.getSize(new THREE.Vector2());
  if (size.x !== width || size.y !== height) renderer.setSize(width, height, false);
}

function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff,0xa59ab5,2.8));
  const light = new THREE.DirectionalLight(0xffffff,3.1); light.position.set(2,5,4); scene.add(light);
}

function captureScene(container, object) {
  const renderer = rendererFor(container), scene = new THREE.Scene(); lights(scene);
  const group = new THREE.Group(); scene.add(group);
  const items = TYPES.map((type,i) => {
    const item = object(type); item.root.position.set((i%3-1)*1.25,.035,i<3?-.98:.98); group.add(item.root); return item;
  });
  const table = new THREE.Mesh(new THREE.BoxGeometry(4.0,.055,3.35),new THREE.MeshStandardMaterial({color:0xeeeeee,roughness:.9}));
  table.position.y = -.025; scene.add(table);
  const cameras = new THREE.Group(); scene.add(cameras);
  for (const position of [[-2.05,1.9,-.25],[2.05,1.9,-.25],[0,1.9,-1.5]]) {
    const camera = new THREE.Group(); camera.position.set(...position); camera.lookAt(0,.35,0); cameras.add(camera);
    camera.add(new THREE.Mesh(new THREE.BoxGeometry(.31,.20,.22),new THREE.MeshStandardMaterial({color:0x735d8f,roughness:.6})));
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(.07,.085,.13,16),new THREE.MeshStandardMaterial({color:0x2e3242}));
    lens.rotation.x=Math.PI/2;lens.position.z=.17;camera.add(lens);
    const lines=[];const corners=[[-.50,-.32,1.1],[.50,-.32,1.1],[.50,.32,1.1],[-.50,.32,1.1]];
    corners.forEach((p,i)=>lines.push(0,0,.2,...p,...p,...corners[(i+1)%4]));
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));
    camera.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0x9577b2,transparent:true,opacity:.35})));
  }
  const overview = new THREE.OrthographicCamera(-3,3,2.2,-2.2,.1,30); overview.position.set(0,5.8,7.5); overview.lookAt(0,.9,0);
  const depth = new THREE.ShaderMaterial({
    uniforms:{nearDepth:{value:7.3},farDepth:{value:10.7}},
    vertexShader:'varying float z; void main(){vec4 p=modelViewMatrix*vec4(position,1.0);z=-p.z;gl_Position=projectionMatrix*p;}',
    fragmentShader:'varying float z; uniform float nearDepth; uniform float farDepth; void main(){float d=clamp((z-nearDepth)/(farDepth-nearDepth),0.0,1.0);vec3 a=vec3(.99,.77,.26),b=vec3(.15,.66,.70),c=vec3(.18,.23,.53);vec3 color=d<.5?mix(a,b,d*2.0):mix(b,c,(d-.5)*2.0);gl_FragColor=vec4(color,1.0);}'
  });
  return t => {
    items.forEach((item,i) => { item.update(t); item.root.position.y=.035+item.size.y/2;item.root.rotation.y = (i===2?-.3:.18)+Math.sin(t*Math.PI*2/10)*.22; });
    const w=container.clientWidth,h=container.clientHeight,half=Math.floor(h/2),gap=7;
    fitRenderer(renderer,w,h);
    const aspect=w/(half-gap/2),horizontal=Math.max(2.75,1.90*aspect),vertical=horizontal/aspect;
    overview.left=-horizontal;overview.right=horizontal;overview.top=vertical;overview.bottom=-vertical;overview.updateProjectionMatrix();
    renderer.setViewport(0,0,w,h);renderer.setScissor(0,0,w,h);renderer.setClearColor(0xffffff);renderer.clear();
    renderer.setViewport(0,half+gap/2,w,half-gap/2);renderer.setScissor(0,half+gap/2,w,half-gap/2);
    scene.background=new THREE.Color(0xffffff);cameras.visible=true;scene.overrideMaterial=null;renderer.render(scene,overview);
    renderer.setViewport(0,0,w,half-gap/2);renderer.setScissor(0,0,w,half-gap/2);
    cameras.visible=false;scene.overrideMaterial=depth;renderer.render(scene,overview);scene.overrideMaterial=null;
  };
}

function representationScene(container, object) {
  const renderer=rendererFor(container), scenes=[], items=[];
  for(const mode of ['points','normals']) {
    const scene=new THREE.Scene();scene.background=new THREE.Color(0xffffff);lights(scene);scenes.push(scene);
    const members=TYPES.map((type,i)=>{
      const item=object(type,mode);item.root.position.set((i%3-1)*1.20,i<3?.68:-.68,0);scene.add(item.root);return item;
    });items.push(members);
  }
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,20);camera.position.set(0,0,7);camera.lookAt(0,0,0);
  return t=>{
    const w=container.clientWidth,h=container.clientHeight,half=Math.floor(h/2),gap=7;
    fitRenderer(renderer,w,h);
    const aspect=w/(half-gap/2),horizontal=Math.max(2.25,1.55*aspect),vertical=horizontal/aspect;
    camera.left=-horizontal;camera.right=horizontal;camera.top=vertical;camera.bottom=-vertical;camera.updateProjectionMatrix();
    renderer.setViewport(0,0,w,h);renderer.setScissor(0,0,w,h);renderer.setClearColor(0xffffff);renderer.clear();
    scenes.forEach((scene,row)=>{
      items[row].forEach((item,i)=>{item.update(t);item.root.rotation.y=(i===2?.6:i===4?-.2:.3)+Math.sin(t*Math.PI*2/10)*.30;});
      const y=row===0?half+gap/2:0;renderer.setViewport(0,y,w,half-gap/2);renderer.setScissor(0,y,w,half-gap/2);renderer.render(scene,camera);
    });
  };
}

export function mountHomepageScenes(asset) {
  const object=makeLibrary(asset);
  const capture=captureScene(document.querySelector('#home-capture'),object);
  const representations=representationScene(document.querySelector('#home-representations'),object);
  return t=>{capture(t);representations(t);};
}
