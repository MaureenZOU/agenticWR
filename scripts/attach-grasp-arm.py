"""Native xArm7 FK/IK for rendering the validated wrist contact replays."""
from pathlib import Path
import json,numpy as np,mujoco
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation as R
ROOT=Path(__file__).resolve().parents[2];SITE=ROOT/'agenticWR';OUT=SITE/'assets/lab/grasp';QA=SITE/'.preview/workspace-grasp-20261029'
m=mujoco.MjModel.from_xml_path(str(ROOT/'simulator/runtime/scene.xml'));d=mujoco.MjData(m)
metadata=json.loads((ROOT/'simulator/runtime/metadata.json').read_text())
for r in metadata['robots']:
 for name,q in zip(r['arm_joints']+r['hand_joints'],r['home']+r['hand_home']):d.qpos[m.jnt_qposadr[m.joint(name).id]]=q
mujoco.mj_forward(m,d)
robot=next(r for r in metadata['robots'] if r['id']=='right') if any(r.get('id')=='right' for r in metadata['robots']) else metadata['robots'][1]
base=m.body('right_link_base').id;tip=m.body('right_right_hand_link').id;rig=json.loads((SITE/'assets/lab/rigs.json').read_text())['right'];nodes=[];joints=[]
for i,bid in enumerate(range(base,tip)):
 node={'name':m.body(bid).name,'parent':i-1,'pos':m.body_pos[bid].tolist(),'quat':m.body_quat[bid].tolist(),'geoms':[]}
 if i==0:node['pos']=[0,0,0];node['quat']=[1,0,0,0]
 for j in range(m.body_jntadr[bid],m.body_jntadr[bid]+m.body_jntnum[bid]):
  node['joint']=len(joints);joints.append({'name':m.joint(j).name,'body':i,'axis':m.jnt_axis[j].tolist(),'pivot':m.jnt_pos[j].tolist(),'range':m.jnt_range[j].tolist(),'home':float(d.qpos[m.jnt_qposadr[j]])})
 gs=[g for g in range(m.body_geomadr[bid],m.body_geomadr[bid]+m.body_geomnum[bid]) if m.geom_group[g]==2]
 for g in gs:
  part=rig['arm'][i].copy();part.pop('matrix',None);part.update(pos=m.geom_pos[g].tolist(),quat=m.geom_quat[g].tolist());node['geoms'].append(part)
 nodes.append(node)
arm={'bodies':nodes,'joints':joints,'mount':{'pos':m.body_pos[base].tolist(),'quat':m.body_quat[base].tolist()},'tip':{'body':len(nodes)-1,'pos':m.body_pos[tip].tolist(),'quat':m.body_quat[tip].tolist()}}
clearance_meshes=[]
for i,node in enumerate(arm['bodies']):
 if i<2:continue
 for g in node['geoms']:
  v=R.from_quat(g['quat'],scalar_first=True).apply(np.array(g['vertices']).reshape(-1,3))+g['pos'];clearance_meshes.append((base+i,v))
def arm_gaps():
 return np.array([np.min(v@d.xmat[bid].reshape(3,3)[2]+d.xpos[bid,2])-.75 for bid,v in clearance_meshes])
adr=np.array([m.jnt_qposadr[m.joint(j['name']).id] for j in joints]);bounds=np.array([j['range'] for j in joints]).T

def attach(data):
 offset=np.array([.10,0,.75]);scene_rotation=R.identity();n=len(data['jointNames']);q=np.array([.2,.98,.4,1.94,.1,1.77,.55]);errors=[];rot=scene_rotation*R.from_quat(data['wristQuaternion'],scalar_first=True)
 # Shadow has a ninety-degree palm adapter; arm flange orientation is common.
 if data['hand']=='shadow':rot=rot*R.from_euler('z',-np.pi/2)
 for f in data['frames']:
  target=scene_rotation.apply(f[n+1:n+4])+offset
  rot=scene_rotation*R.from_quat(f[n+12:n+16],scalar_first=True)
  if data['hand']=='shadow':rot=rot*R.from_euler('z',-np.pi/2)
  if data['hand']=='allegro':target+=rot.apply([0,0,-.095])
  def fun(x):
   d.qpos[adr]=x;mujoco.mj_kinematics(m,d)
   return np.r_[(d.xpos[tip]-target)*10,(rot.inv()*R.from_matrix(d.xmat[tip].reshape(3,3))).as_rotvec(),np.minimum(arm_gaps()-.006,0)*40]
  fit=least_squares(fun,q,bounds=bounds,max_nfev=150 if not errors else 50,ftol=1e-8,xtol=1e-8,gtol=1e-8);q=fit.x;err=np.linalg.norm(fun(q)[:3])/10;errors.append(float(err));f.extend(np.round(q,6).tolist())
 clearance=float('inf');forward=1.
 for f in data['frames'][::10]:
  d.qpos[adr]=f[n+17:n+24];mujoco.mj_kinematics(m,d)
  clearance=min(clearance,float(arm_gaps().min()))
  reach=d.xpos[tip]-np.array(arm['mount']['pos']);direction=scene_rotation.apply(R.from_quat(f[n+12:n+16],scalar_first=True).apply([0,0,1]))
  forward=min(forward,float(reach@direction/np.linalg.norm(reach)))
 data['sceneOffset']=offset.tolist();data['sceneQuaternion']=scene_rotation.as_quat(scalar_first=True).tolist();data['armJoints']=7
 data['physics'].update(arm_ik_max_error_m=max(errors),arm_surface_clearance_m=clearance,forward_reach_alignment=forward)
 return data
if __name__=='__main__':
 (SITE/'assets/lab/arm.json').write_text(json.dumps(arm,separators=(',',':')))
 for path in sorted(OUT.glob('*.json')):
  data=json.loads(path.read_text())
  if not isinstance(data,dict) or data.get('armJoints'):continue
  data=attach(data);path.write_text(json.dumps(data,separators=(',',':')));print(path.name,data['physics']['arm_ik_max_error_m'],flush=True)
