// CPU-only point constraints. This is the same FK/restricted LBS used by the
// server; it neither evaluates WorldString nor substitutes a surface mesh.
// Website adaptation: constrained poses drive a cached illustrative surface.
const SCHEMA = 'worldstring-projection-v1';
const identity = () => new Float64Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const minus = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const norm = (v) => Math.sqrt(v.reduce((sum,x) => sum+x*x,0));
function vector(value, count, label) {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) throw new Error(`Invalid ${label}`);
  if (value.length !== count || !Array.from(value).every(x => typeof x === 'number' && Number.isFinite(x)))
    throw new Error(`Invalid ${label}`);
  return Float64Array.from(value);
}
function array(value, count, label) {
  return vector(Array.isArray(value) ? value.flat(Infinity) : value,count,label);
}
function matrix(value) { return array(value,16,'transform'); }
function multiply(a,b) {
  const out=new Float64Array(16);
  for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++)out[i*4+j]+=a[i*4+k]*b[k*4+j];
  return out;
}
function transform(m,p) {
  return [m[0]*p[0]+m[1]*p[1]+m[2]*p[2]+m[3],
    m[4]*p[0]+m[5]*p[1]+m[6]*p[2]+m[7],m[8]*p[0]+m[9]*p[1]+m[10]*p[2]+m[11]];
}
function rotationVector(x,y,z,out,offset=0) {
  const theta2=x*x+y*y+z*z;
  // Taylor limits avoid cancellation in tiny finite-difference rotations.
  const a=theta2<1e-12 ? 1-theta2/6+theta2*theta2/120 : Math.sin(Math.sqrt(theta2))/Math.sqrt(theta2);
  const b=theta2<1e-12 ? .5-theta2/24+theta2*theta2/720 : (1-Math.cos(Math.sqrt(theta2)))/theta2;
  out[offset]=1-b*(y*y+z*z);out[offset+1]=b*x*y-a*z;out[offset+2]=b*x*z+a*y;
  out[offset+3]=b*x*y+a*z;out[offset+4]=1-b*(x*x+z*z);out[offset+5]=b*y*z-a*x;
  out[offset+6]=b*x*z-a*y;out[offset+7]=b*y*z+a*x;out[offset+8]=1-b*(x*x+y*y);
}
function motion(joint,value,angleUnit=1) {
  const out=identity(),axis=joint.axis,length=Math.hypot(...axis);
  const x=axis[0]/length,y=axis[1]/length,z=axis[2]/length;
  value*=joint.sign ?? 1;
  if(joint.type==='prismatic') {out[3]=x*value;out[7]=y*value;out[11]=z*value;}
  else if(joint.type==='revolute') {
    const r=new Float64Array(9);rotationVector(x*value*angleUnit,y*value*angleUnit,z*value*angleUnit,r);
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)out[i*4+j]=r[i*3+j];
    if(joint.pivot)for(let i=0;i<3;i++)out[i*4+3]=joint.pivot[i]-dot(r.subarray(i*3,i*3+3),joint.pivot);
  }
  return out;
}
function validHandle(handle,count) {
  if(!Number.isInteger(handle)||handle<0||handle>=count)throw new Error('Unknown surface handle');
}
function validState(state) {
  if(!state||typeof state!=='object'||Array.isArray(state))throw new Error('State must be an object');
}

class ArticulatedProjector {
  constructor(d) {
    this.descriptor=d;this.canonical=matrix(d.canonical);
    this.defaults={...d.default_state};this.limits=d.limits;
    this.slots=d.surface_slots;this.handleJoints=d.handle_joints;
    if(d.type==='partnet') {
      this.edges=d.edges.map(edge=>({...edge,origin:matrix(edge.origin)}));
      this.localPoints=d.local_points.map(p=>vector(p,3,'local point'));
    } else {
      this.parts=d.parts.map(p=>({...p,rest:matrix(p.rest),restInverse:matrix(p.rest_inverse),
        anchors:p.anchors.map(a=>vector(a,3,'anchor'))}));
    }
  }
  state(input) {
    if(input==null)return {...this.defaults};validState(input);
    if(Object.keys(input).some(name=>!Object.hasOwn(this.defaults,name)))throw new Error('Unknown joint');
    const result={...this.defaults};
    for(const [name,value]of Object.entries(input)) {
      if(typeof value!=='number'||!Number.isFinite(value))throw new Error('Invalid joint value');
      result[name]=clamp(value,...this.limits[name]);
    }
    return result;
  }
  points(state) {
    const d=this.descriptor,transforms=new Map(),canonical=new Map();
    if(d.type==='partnet') {
      transforms.set(d.base,identity());
      for(const edge of this.edges)transforms.set(edge.child,multiply(multiply(transforms.get(edge.parent),edge.origin),motion(edge,state[edge.name]??0)));
      for(const [name,value]of transforms)canonical.set(name,multiply(this.canonical,value));
      this.partTransforms=canonical;
      return this.localPoints.map((point,i)=>transform(canonical.get(d.point_parts[i]),point));
    }
    const result=[];
    for(const part of this.parts) {
      const parent=this.parts.find(p=>p.id===part.parent);
      const value=!parent ? part.rest : multiply(multiply(multiply(transforms.get(parent.id),parent.restInverse),
        motion(part.joint,state[part.joint.name],Math.PI/180)),part.rest);
      transforms.set(part.id,value);
      const frame=multiply(this.canonical,value);canonical.set(part.id,frame);
      for(const point of part.anchors)result.push(transform(frame,point));
    }
    this.partTransforms=canonical;
    return result;
  }
  preview(input) {
    const state=this.state(input),keypoints=this.points(state);
    return {accepted:true,state,keypoints,handles:this.slots.map(i=>keypoints[i].slice())};
  }
  project(input,handle,target) {
    validHandle(handle,this.handleJoints.length);target=vector(target,3,'target');
    if(this.descriptor.handle_chains) {
      let state=this.state(input);const chain=this.descriptor.handle_chains[handle],slot=this.slots[handle];
      for(let iteration=0;iteration<10&&chain.length;iteration++) {
        const position=this.points(state)[slot],error=minus(target,position);
        if(norm(error)<.0001)break;
        const jacobian=chain.map(name=>minus(this.points({...state,[name]:state[name]+.0001})[slot],position).map(v=>v/.0001));
        const system=new Float64Array([.001,0,0,0,.001,0,0,0,.001]);
        for(const c of jacobian)for(let i=0;i<3;i++)for(let j=0;j<3;j++)system[i*3+j]+=c[i]*c[j];
        const step=solve3(system,error),candidate={...state};
        chain.forEach((name,i)=>candidate[name]=clamp(state[name]+clamp(dot(jacobian[i],step),-.16,.16),...this.limits[name]));
        if(norm(minus(target,this.points(candidate)[slot]))>=norm(error))break;
        state=candidate;
      }
      return this.preview(state);
    }
    const state=this.state(input),name=this.handleJoints[handle];
    if(name==null)return this.preview(state);
    const [low,high]=this.limits[name],previous=state[name],slot=this.slots[handle];
    const point=(value)=>this.points({...state,[name]:value})[slot];
    const candidates=[previous,low,high];
    if(this.descriptor.joint_types[name]==='prismatic') {
      const start=point(0),direction=minus(point(1),start),length=dot(direction,direction);
      if(length>1e-24)candidates.push(clamp(dot(minus(target,start),direction)/length,low,high));
    } else {
      const unit=this.descriptor.joint_angle_units[name],period=2*Math.PI/unit;
      const p0=point(0),p180=point(Math.PI/unit),center=p0.map((v,i)=>(v+p180[i])/2);
      const u=minus(p0,center),v=minus(point(Math.PI/(2*unit)),center),delta=minus(target,center);
      const a=dot(delta,u),b=dot(delta,v);
      if(Math.hypot(a,b)>1e-24) {
        const angle=Math.atan2(b,a)/unit;
        for(let k=Math.ceil((low-angle)/period);k<=Math.floor((high-angle)/period);k++)candidates.push(angle+k*period);
      }
    }
    const scored=candidates.map(value=>{const residual=minus(point(value),target);return {value,error:dot(residual,residual)};});
    const minimum=Math.min(...scored.map(x=>x.error));
    state[name]=scored.filter(x=>x.error<=minimum+1e-14).sort((a,b)=>Math.abs(a.value-previous)-Math.abs(b.value-previous))[0].value;
    for(const boundary of [low,high])if(Math.abs(state[name]-boundary)<(high-low)*1e-10)state[name]=boundary;
    return this.preview(state);
  }
}

// Solve the 3x3 SPD system J J^T + lambda I without a general-purpose matrix
// package. Cholesky remains well conditioned under the server's damping term.
function solve3(a,b) {
  const l00=Math.sqrt(a[0]),l10=a[3]/l00,l20=a[6]/l00;
  const l11=Math.sqrt(a[4]-l10*l10),l21=(a[7]-l20*l10)/l11;
  const l22=Math.sqrt(a[8]-l20*l20-l21*l21);
  const y0=b[0]/l00,y1=(b[1]-l10*y0)/l11,y2=(b[2]-l20*y0-l21*y1)/l22;
  const x2=y2/l22,x1=(y1-l21*x2)/l11,x0=(y0-l10*x1-l20*x2)/l00;
  return [x0,x1,x2];
}

class SkinningProjector {
  constructor(d) {
    this.descriptor=d;this.count=d.parents.length;this.handleCount=d.shaped_handles.length;
    this.featureCount=(this.count-1)*9;this.poseCount=(this.count-d.pose_joint_offset)*3;
    this.parents=Int32Array.from(d.parents);this.joints=array(d.joints,this.count*3,'joints');
    this.shaped=array(d.shaped_handles,this.handleCount*3,'surface handles');
    this.directions=array(d.pose_directions,this.handleCount*3*this.featureCount,'pose directions');
    this.weights=array(d.weights,this.handleCount*this.count,'weights');
    this.lower=vector(d.lower,this.poseCount,'lower bounds');this.upper=vector(d.upper,this.poseCount,'upper bounds');
    this.radius=vector(d.joint_radius,this.poseCount/3,'joint radii');this.center=vector(d.center,3,'center');
    if(!(d.side>0)||!Number.isFinite(d.side))throw new Error('Invalid normalization');
    this.rotations=new Float64Array(this.count*9);this.transforms=new Float64Array(this.count*12);
    this.positions=new Float64Array(this.count*3);this.feature=new Float64Array(this.featureCount);
    this.relative=this.joints.slice();
    for(let i=1;i<this.count;i++)for(let c=0;c<3;c++)this.relative[i*3+c]-=this.joints[this.parents[i]*3+c];
  }
  state(input) {
    validState(input);const pose=vector(input.pose??this.descriptor.default_state.pose,this.poseCount,'pose');
    for(let i=0;i<pose.length;i++)pose[i]=clamp(pose[i],this.lower[i],this.upper[i]);
    for(let j=0;j<pose.length/3;j++) {
      const n=Math.hypot(pose[j*3],pose[j*3+1],pose[j*3+2]),scale=Math.min(1,this.radius[j]/Math.max(n,1e-12));
      for(let c=0;c<3;c++)pose[j*3+c]*=scale;
    }
    const n=norm(pose);if(n>this.descriptor.pose_radius)for(let i=0;i<pose.length;i++)pose[i]*=this.descriptor.pose_radius/n;
    return pose;
  }
  forward(pose) {
    const {count,rotations:r,transforms:t,positions:p,feature:f,descriptor:d}=this;
    for(let j=0;j<count;j++) {
      const offset=(j-d.pose_joint_offset)*3;
      rotationVector(offset<0?0:pose[offset],offset<0?0:pose[offset+1],offset<0?0:pose[offset+2],r,j*9);
      if(j>0)for(let c=0;c<9;c++)f[(j-1)*9+c]=r[j*9+c]-(c%4===0?1:0);
      const base=j*12,parent=this.parents[j],parentBase=parent*12;
      if(parent<0) {
        for(let row=0;row<3;row++){for(let col=0;col<3;col++)t[base+row*4+col]=r[j*9+row*3+col];t[base+row*4+3]=this.relative[j*3+row];}
      } else {
        for(let row=0;row<3;row++) {
          for(let col=0;col<3;col++)t[base+row*4+col]=t[parentBase+row*4]*r[j*9+col]+t[parentBase+row*4+1]*r[j*9+3+col]+t[parentBase+row*4+2]*r[j*9+6+col];
          t[base+row*4+3]=t[parentBase+row*4]*this.relative[j*3]+t[parentBase+row*4+1]*this.relative[j*3+1]+t[parentBase+row*4+2]*this.relative[j*3+2]+t[parentBase+row*4+3];
        }
      }
      for(let c=0;c<3;c++)p[j*3+c]=t[base+c*4+3];
    }
    // Descendants above need uncorrected parent transforms. Subtract the bind
    // joint only once the complete parent-first traversal has finished.
    for(let j=0;j<count;j++)for(let c=0;c<3;c++)t[j*12+c*4+3]-=t[j*12+c*4]*this.joints[j*3]+t[j*12+c*4+1]*this.joints[j*3+1]+t[j*12+c*4+2]*this.joints[j*3+2];
  }
  handle(index) {
    const shaped=[...this.shaped.subarray(index*3,index*3+3)],featureCount=this.featureCount;
    for(let c=0;c<3;c++) {
      const start=(index*3+c)*featureCount;
      for(let f=0;f<featureCount;f++)shaped[c]+=this.directions[start+f]*this.feature[f];
    }
    const result=[0,0,0],t=this.transforms;
    for(let j=0;j<this.count;j++) {
      const weight=this.weights[index*this.count+j];if(weight===0)continue;
      for(let c=0;c<3;c++){const offset=j*12+c*4;result[c]+=weight*(t[offset]*shaped[0]+t[offset+1]*shaped[1]+t[offset+2]*shaped[2]+t[offset+3]);}
    }
    return result.map((v,c)=>(v-this.center[c])/this.descriptor.side);
  }
  at(pose,handle) {this.forward(pose);return this.handle(handle);}
  preview(input) {
    const pose=this.state(input);this.forward(pose);
    const handles=Array.from({length:this.handleCount},(_,i)=>this.handle(i));
    const keypoints=Array.from({length:this.count},(_,i)=>[0,1,2].map(c=>(this.positions[i*3+c]-this.center[c])/this.descriptor.side));
    keypoints.push(...handles.slice(this.count).map(p=>p.slice()));
    return {accepted:true,state:{pose:Array.from(pose)},keypoints,handles};
  }
  project(input,handle,target) {
    validHandle(handle,this.handleCount);target=Array.from(vector(target,3,'target'));
    const d=this.descriptor;let pose=this.state(input);
    if(handle<d.fixed_handle_count)return this.preview({pose});
    const original=pose.slice(),dimensions=[];let joint=handle>=d.face_handle_start?d.face_joint:handle;
    for(let length=0;joint>=d.chain_floor&&length<d.max_chain_length;length++,joint=this.parents[joint]) {
      for(let axis=0;axis<3;axis++) {
        const dim=3*(joint-d.pose_joint_offset)+axis;
        if(d.family==='smpl'||this.upper[dim]>this.lower[dim])dimensions.push(dim);
      }
    }
    const current=this.at(pose,handle),displacement=minus(target,current),distance=norm(displacement);
    if(distance>d.max_displacement)target=current.map((v,i)=>v+displacement[i]*d.max_displacement/distance);
    for(let iteration=0;iteration<d.iterations;iteration++) {
      const position=this.at(pose,handle),error=minus(target,position),errorNorm=norm(error);
      if(errorNorm<d.tolerance)break;
      const jacobian=[];
      for(const dim of dimensions) {
        const shifted=pose.slice();shifted[dim]+=d.jacobian_step;
        jacobian.push(minus(this.at(shifted,handle),position).map(v=>v/d.jacobian_step));
      }
      const system=new Float64Array([d.damping,0,0,0,d.damping,0,0,0,d.damping]);
      for(const column of jacobian)for(let i=0;i<3;i++)for(let j=0;j<3;j++)system[i*3+j]+=column[i]*column[j];
      const solved=solve3(system,error),candidate=pose.slice();
      for(let i=0;i<dimensions.length;i++)candidate[dimensions[i]]+=clamp(dot(jacobian[i],solved),-d.step_limit,d.step_limit);
      for(let i=0;i<candidate.length;i++)candidate[i]=clamp(candidate[i],original[i]-d.event_limit,original[i]+d.event_limit);
      const bounded=this.state({pose:candidate});
      if(norm(minus(target,this.at(bounded,handle)))>=errorNorm)break;
      pose=bounded;
    }
    return this.preview({pose});
  }
}

export function createLocalProjector(descriptor) {
  if(descriptor?.schema!==SCHEMA)throw new Error('Unsupported point projection descriptor');
  if(descriptor.type==='skinning')return new SkinningProjector(descriptor);
  if(['rigid','partnet'].includes(descriptor.type))return new ArticulatedProjector(descriptor);
  throw new Error('Unsupported point projection type');
}
