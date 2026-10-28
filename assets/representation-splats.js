import * as THREE from './vendor/three.module.js';
import {sortGaussians} from './representation-splat-sort.js';

// Real anisotropic 3D Gaussian splats: project each covariance through
// the perspective Jacobian, draw its elliptical Gaussian, and alpha-composite
// back-to-front. Geometry is never converted into Points or a replacement mesh.
const VERTEX=`
precision highp float;
precision highp int;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform sampler2D meansTexture;
uniform sampler2D rotationTexture;
uniform sampler2D scaleTexture;
uniform sampler2D colorTexture;
uniform vec2 viewport;
uniform float textureWidth;
uniform float textureHeight;
uniform vec3 lightDirection;
uniform vec2 shading;
uniform float faceGate;
attribute vec3 position;
attribute float splatIndex;
varying vec2 gaussianPosition;
varying vec4 gaussianColor;
vec2 uvFor(float i) {return (vec2(mod(i,textureWidth),floor(i/textureWidth))+.5)/vec2(textureWidth,textureHeight );}
vec2 projectAxis(vec3 axis,vec3 center,vec2 focal,float inverseDepth) {
  return focal*(axis.xy*inverseDepth+center.xy*axis.z*inverseDepth*inverseDepth);
}
void main() {
  vec2 uv=uvFor(splatIndex);
  vec3 mean=texture2D(meansTexture,uv).xyz;
  vec4 q=normalize(texture2D(rotationTexture,uv));
  vec3 scale=texture2D(scaleTexture,uv).xyz;
  vec3 x=vec3(1.-2.*(q.y*q.y+q.z*q.z),2.*(q.x*q.y+q.z*q.w),2.*(q.x*q.z-q.y*q.w));
  vec3 y=vec3(2.*(q.x*q.y-q.z*q.w),1.-2.*(q.x*q.x+q.z*q.z),2.*(q.y*q.z+q.x*q.w));
  vec3 z=vec3(2.*(q.x*q.z+q.y*q.w),2.*(q.y*q.z-q.x*q.w),1.-2.*(q.x*q.x+q.y*q.y));
  vec4 center=modelViewMatrix*vec4(mean,1.);
  vec4 clip=projectionMatrix*center;
  gaussianColor=texture2D(colorTexture,uv);
  gaussianColor.rgb*=shading.x+shading.y*abs(dot(z,lightDirection));
  gaussianPosition=position.xy*3.;
  if(center.z>=-.005 || clip.z < -clip.w || clip.z>clip.w) {
    gl_Position=vec4(0.,0.,2.,1.);return;
  }
  float inverseDepth=1./(-center.z);
  vec2 focal=vec2(projectionMatrix[0][0],projectionMatrix[1][1])*viewport*.5;
  // Clamp only the Jacobian's off-axis perspective term, as in EWA splatting;
  // this prevents huge off-screen ellipses without moving the actual center.
  vec3 bounded=center.xyz;
  vec2 limit=1.3*viewport/(2.*focal);
  bounded.xy=clamp(bounded.xy*inverseDepth,-limit,limit)/inverseDepth;
  mat3 rotation=mat3(modelViewMatrix);
  // Preserve the optional appearance rule. Thin surfaces may have
  // distinct front/back Gaussians; the original fitted bank gates opacity by
  // its normal facing the viewer before ordinary alpha compositing.
  if(faceGate>.5)gaussianColor.a*=1./(1.+exp(-40.*dot(normalize(rotation*z),normalize(-center.xyz))));
  vec2 a=projectAxis(rotation*(x*scale.x),bounded,focal,inverseDepth);
  vec2 b=projectAxis(rotation*(y*scale.y),bounded,focal,inverseDepth);
  vec2 c=projectAxis(rotation*(z*scale.z),bounded,focal,inverseDepth);
  float xx=dot(vec3(a.x,b.x,c.x),vec3(a.x,b.x,c.x))+.3;
  float yy=dot(vec3(a.y,b.y,c.y),vec3(a.y,b.y,c.y))+.3;
  float xy=dot(vec3(a.x,b.x,c.x),vec3(a.y,b.y,c.y));
  float mid=.5*(xx+yy),radius=length(vec2(.5*(xx-yy),xy));
  float major=max(mid+radius,.01),minor=max(mid-radius,.01);
  vec2 axis=abs(xy)>1e-8 ? normalize(vec2(xy,major-xx)) : (xx>=yy ? vec2(1.,0.) : vec2(0.,1.));
  vec2 axis2=vec2(-axis.y,axis.x);
  vec2 pixelOffset=3.*(position.x*sqrt(major)*axis+position.y*sqrt(minor)*axis2);
  gl_Position=clip+vec4(pixelOffset*2./viewport*clip.w,0.,0.);
}
`;
const FRAGMENT=`
precision highp float;
uniform float opacity;
varying vec2 gaussianPosition;
varying vec4 gaussianColor;
void main() {
  float power=-.5*dot(gaussianPosition,gaussianPosition);
  if(power < -4.5)discard;
  float alpha=min(.99,gaussianColor.a*exp(power))*opacity;
  if(alpha<1./255.)discard;
  gl_FragColor=vec4(gaussianColor.rgb,alpha);
}
`;
function texture(values,width,height,type=THREE.FloatType) {
  const data=new (type===THREE.UnsignedByteType ? Uint8Array : Float32Array)(width*height*4);data.set(values);
  const result=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,type);
  result.magFilter=result.minFilter=THREE.NearestFilter;result.generateMipmaps=false;result.needsUpdate=true;
  return result;
}
function pack3(values,count) {
  const packed=new Float32Array(count*4);
  for(let i=0,j=0;i<count*3;i+=3,j+=4) {packed[j]=values[i];packed[j+1]=values[i+1];packed[j+2]=values[i+2];}
  return packed;
}
export function createGaussianSplats(staticData,dynamicData,{renderer,invalidate,shading={},facingGate=false}={}) {
  if(staticData.count!==dynamicData.count)throw new Error('高斯静态与动态资源数量不一致');
  const count=staticData.count,width=Math.min(2048,renderer.capabilities.maxTextureSize),height=Math.ceil(count/width);
  if(height>renderer.capabilities.maxTextureSize)throw new Error('设备不支持此高斯数量');
  const uniforms={
    meansTexture:{value:texture(pack3(dynamicData.means,count),width,height)},
    rotationTexture:{value:texture(dynamicData.quaternions,width,height)},
    scaleTexture:{value:texture(pack3(staticData.scales,count),width,height)},
    colorTexture:{value:texture(staticData.colors,width,height,THREE.UnsignedByteType)},
    textureWidth:{value:width},textureHeight:{value:height},viewport:{value:new THREE.Vector2()},opacity:{value:1},
    lightDirection:{value:new THREE.Vector3(...(shading.light || [-.4,.8,.5])).normalize()},
    shading:{value:new THREE.Vector2(shading.ambient ?? .68,shading.diffuse ?? .32)},
    faceGate:{value:facingGate ? 1 : 0},
  };
  const geometry=new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
  geometry.setIndex([0,1,2,0,2,3]);
  const order=Float32Array.from({length:count},(_,i)=>i);
  const indices=new THREE.InstancedBufferAttribute(order,1);indices.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('splatIndex',indices);geometry.instanceCount=count;
  geometry.boundingBox=new THREE.Box3();
  const boundPoint=new THREE.Vector3();
  for(let i=0;i<count;i++)geometry.boundingBox.expandByPoint(boundPoint.fromArray(dynamicData.means,i*3));
  geometry.boundingSphere=geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  const material=new THREE.RawShaderMaterial({uniforms,vertexShader:VERTEX,fragmentShader:FRAGMENT,
    transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,
    blending:THREE.NormalBlending,toneMapped:false});
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='Illustrative 3D Gaussian splats';mesh.frustumCulled=false;
  // Learned SDF BVH is the common selection proxy in every display mode.
  mesh.raycast=()=>{};
  // Offline adaptation: same production shader/covariance and stable depth sort,
  // but synchronously settle each exact pose/view before JPEG capture.
  const modelView=new THREE.Matrix4();
  let disposed=false,dirty=true,lastView=null,sortRevision=0;
  function settle(camera) {
    if(disposed)throw new Error('Disposed Gaussian surface');
    mesh.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    modelView.multiplyMatrices(camera.matrixWorldInverse,mesh.matrixWorld);
    const view=modelView.elements;
    if(dirty || !lastView || [2,6,10].some(i=>Math.abs(view[i]-lastView[i])>1e-9)) {
      indices.array=sortGaussians(dynamicData.means,view);indices.needsUpdate=true;
      lastView=Array.from(view);dirty=false;sortRevision++;
    }
    renderer.getDrawingBufferSize(uniforms.viewport.value);
    return sortRevision;
  }
  mesh.onBeforeRender=(_r,_scene,camera)=>settle(camera);
  mesh.userData.gaussians={count,source:'cached-surface-derived-illustration',anisotropic:true,sorted:true};
  return {mesh,settle,get sortRevision(){return sortRevision;},
    setDynamic(next) {
      if(next.count!==count)throw new Error('Gaussian bank size changed');
      dynamicData=next;
      uniforms.meansTexture.value.image.data.set(pack3(next.means,count));
      uniforms.rotationTexture.value.image.data.set(next.quaternions);
      uniforms.meansTexture.value.needsUpdate=true;
      uniforms.rotationTexture.value.needsUpdate=true;
      dirty=true;
    },
    setGhost(value){uniforms.opacity.value=value ? .3 : 1;},dispose(){
    if(disposed)return;disposed=true;
    geometry.dispose();material.dispose();for(const key of ['meansTexture','rotationTexture','scaleTexture','colorTexture'])uniforms[key].value.dispose();
  }};
}
