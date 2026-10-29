"""Offline native-hand contact demonstrations for the static project page.
The object is a gravity-driven free body. Only hand actuators and the mocap
wrist are commanded after reset; no object weld, force, or pose following.
Geometry loss uses sampled link surfaces, analytic primitives or native duck
collision-mesh half-spaces, together with native MuJoCo collision distances.
"""
from pathlib import Path
import json,sys,argparse
import xml.etree.ElementTree as ET
import numpy as np
import mujoco
from scipy.spatial.transform import Rotation as R
from scipy.optimize import minimize
from functools import lru_cache
ROOT=Path(__file__).resolve().parents[2]; SITE=ROOT/'agenticWR'; OUT=SITE/'assets/lab/grasp';OUT.mkdir(exist_ok=True)
QA=SITE/'.preview/forward-grasps-20261029'; QA.mkdir(exist_ok=True)
RIGS=json.loads((SITE/'assets/lab/rigs.json').read_text())
fmt=lambda v:' '.join(str(float(x)) for x in np.asarray(v).ravel())

@lru_cache(maxsize=1)
def native_duck():
 return json.loads((SITE/'assets/lab/duck-native.json').read_text())

@lru_cache(maxsize=1)
def duck_reference():
 return json.loads((SITE/'assets/lab/duck-grasp-reference.json').read_text())

def config(kind,name=None,angle=None,roll=0,style=None):
 h=RIGS['right']['hand'] if kind=='xhand' else RIGS[kind]
 local={'xhand':[.052,0,.135],'allegro':[.046,0,.067],'shadow':[0,-.047,.135],'sharpa':[.045,0,.14]}[kind]
 tilt=angle if angle is not None else 0
 # Fingers point forward; thumb points up at roll=0, palm up at roll=-90.
 forward=np.array([[0.,0.,-1.],[-1.,0.,0.],[0.,1.,0.]])
 rot=R.from_euler('x',roll,degrees=True).as_matrix()@R.from_euler('y',tilt,degrees=True).as_matrix()@forward
 if style in ('duck-front','bottle-front'):
  # Palm normal faces -X (away from the arm); fingers point down around the body.
  rot=R.from_euler('x',roll if kind=='sharpa' else 0,degrees=True).as_matrix()@R.from_euler('y',tilt,degrees=True).as_matrix()@np.diag([-1.,1.,-1.])
 elif style=='duck-overview':
  rot=R.from_euler('x',roll,degrees=True).as_matrix()@R.from_euler('y',tilt,degrees=True).as_matrix()@np.array(duck_reference()['rotation'])
 elif style in ('apple-top','dumbbell-top','bottle-top'):
  # Native +X is the palm normal. Keep it downward, fingers toward -X.
  rot=R.from_euler('z',tilt,degrees=True).as_matrix()@np.array([[0.,0.,-1.],[0.,-1.,0.],[-1.,0.,0.]])
 if kind=='shadow':rot=rot@R.from_euler('z',np.pi/2).as_matrix()
 return h,np.array(local),rot

def shape(name,scale=1,style=None):
 if name=='duck' and style in ('duck-front','duck-overview'):
  if scale!=1:raise ValueError('Use the original simulation duck size for every hand')
  return native_duck()['collision']
 # Coordinates relative to the free body's centre, in metres.
 parts=[]
 def add(t,size,pos=(0,0,0),quat=(1,0,0,0),color=(.5,.6,.7,1)):
  parts.append(dict(type=t,size=(np.array(size)*scale).tolist(),pos=(np.array(pos)*scale).tolist(),quat=list(quat),color=list(color)))
 if name=='apple':add('ellipsoid',[.038,.038,.034],color=(.72,.19,.14,1));add('capsule',[.0025,.008],(0,0,.038),color=(.32,.22,.12,1))
 if name=='bottle':
  add('cylinder',[.026,.048],color=(.20,.57,.50,1));add('ellipsoid',[.026,.026,.019],(0,0,.043),color=(.20,.57,.50,1));add('cylinder',[.012,.017],(0,0,.066),color=(.22,.61,.53,1));add('cylinder',[.014,.006],(0,0,.084),color=(.15,.36,.34,1))
 if name=='mug':
  add('cylinder',[.040,.004],(0,0,-.058),color=(.38,.61,.76,1))
  for i in range(24):
   a=2*np.pi*i/24;add('box',[.0035,.0055,.058],(.0365*np.cos(a),.0365*np.sin(a),0),R.from_euler('z',a).as_quat(scalar_first=True),(.38,.61,.76,1))
  for i in range(24):
   a=-np.pi/2+np.pi*i/23;add('sphere',[.007],(.038+.045*np.cos(a),0,.005+.038*np.sin(a)),color=(.38,.61,.76,1))
 if name=='dumbbell':
  quat=R.from_euler('y',np.pi/2).as_quat(scalar_first=True)
  add('cylinder',[.015,.10],quat=quat,color=(.35,.39,.43,1))
  for x in [-.095,.095]:add('cylinder',[.095,.018],(x,0,0),quat,(.72,.38,.19,1))
 if name=='duck':
  add('ellipsoid',[.043,.032,.028],(0,0,-.009),color=(.96,.75,.16,1));add('ellipsoid',[.023,.023,.025],(.022,0,.027),color=(.96,.75,.16,1));add('ellipsoid',[.019,.015,.006],(.044,0,.027),color=(.93,.38,.08,1));add('ellipsoid',[.017,.014,.012],(-.037,0,.001),color=(.96,.75,.16,1))
 if name in ['dumbbell','mug']:
  yaw=R.from_euler('z',np.pi/2)
  for p in parts:p['pos']=yaw.apply(p['pos']).tolist();p['quat']=(yaw*R.from_quat(p['quat'],scalar_first=True)).as_quat(scalar_first=True).tolist()
 if name=='duck' and style=='duck-front':
  yaw=R.from_euler('z',np.pi)
  for p in parts:p['pos']=yaw.apply(p['pos']).tolist();p['quat']=(yaw*R.from_quat(p['quat'],scalar_first=True)).as_quat(scalar_first=True).tolist()
 return parts

def build(kind,name,scale=1,angle=None,roll=0,style=None):
 h,local,rot=config(kind,name,angle,roll,style); parts=shape(name,scale,style)
 root=ET.Element('mujoco',model=f'{kind}_{name}');ET.SubElement(root,'compiler',angle='radian',autolimits='true',balanceinertia='true');ET.SubElement(root,'option',timestep='.002',gravity='0 0 -9.81',integrator='implicitfast',cone='elliptic',iterations='60',impratio='8')
 defs=ET.SubElement(root,'default');ET.SubElement(defs,'geom',friction='1.6 .02 .001',solref='.008 1',solimp='.95 .99 .001');ET.SubElement(defs,'joint',damping='.06',armature='.003',frictionloss='0')
 asset=ET.SubElement(root,'asset');world=ET.SubElement(root,'worldbody');ET.SubElement(world,'geom',name='floor',type='plane',size='2 2 .1',contype='1',conaffinity='3')
 ET.SubElement(world,'body',name='wrist_mount',mocap='true');mount=ET.SubElement(world,'body',name='dynamic_wrist');ET.SubElement(mount,'freejoint',name='wrist_free');ET.SubElement(mount,'inertial',pos='0 0 0',mass='.5',diaginertia='.005 .005 .005');eq=ET.SubElement(root,'equality');ET.SubElement(eq,'weld',body1='dynamic_wrist',body2='wrist_mount',solref='.004 1',solimp='.99 .999 .0001');nodes=[];samples=[];geomgroups=[]
 for i,b in enumerate(h['bodies']):
  node=ET.SubElement(mount if b['parent']<0 else nodes[b['parent']],'body',name=b['name'],pos=fmt(b['pos']),quat=fmt(b['quat']),gravcomp='1')
  nodes.append(node)
  if 'joint' in b:
   j=h['joints'][b['joint']];ET.SubElement(node,'joint',name=j['name'],type='hinge',axis=fmt(j['axis']),pos=fmt(j['pivot']),range=fmt(j['range']),**({'solreflimit':'.004 1','solimplimit':'.99 .999 .0001'} if kind=='sharpa' else {}))
  ET.SubElement(node,'inertial',**{k:fmt(v) if isinstance(v,list) else str(v) for k,v in b['inertial'].items()}) if kind=='sharpa' else ET.SubElement(node,'inertial',pos='0 0 0',mass='.035' if i else '.25',diaginertia='.00003 .00003 .00003')
  for gi,g in enumerate(b['geoms']):
   meshname=f'm{i}_{gi}';ET.SubElement(asset,'mesh',name=meshname,vertex=fmt(np.array(g['vertices']).reshape(-1,3)),face=' '.join(map(str,g['faces'])))
   ET.SubElement(node,'geom',name=meshname,type='mesh',mesh=meshname,pos=fmt(g['pos']),quat=fmt(g['quat']),contype='0' if kind=='sharpa' else '2',conaffinity='0' if kind=='sharpa' else '3' if style=='duck-overview' else '1',group='2',rgba=fmt(g.get('color',[.5,.5,.5,1])),mass='0')
   vertices=np.array(g['vertices']).reshape(-1,3);take=np.linspace(0,len(vertices)-1,min(90,len(vertices)),dtype=int);pts=R.from_quat(g['quat'],scalar_first=True).apply(vertices[take])+g['pos'];samples.append((b['name'],pts))
  if kind=='sharpa':
   for g in b['collision']:
    attrs=dict(name=g['name'],type=g['type'],pos=fmt(g['pos']),quat=fmt(g['quat']),contype='2',conaffinity='3',group='3',mass='0',condim='6')
    if g['type']=='mesh':
     mn='native_'+g['name'];ET.SubElement(asset,'mesh',name=mn,vertex=fmt(g['vertices']),face=' '.join(map(str,g['faces'])));attrs['mesh']=mn
    else:attrs['size']=fmt(g['size'])
    ET.SubElement(node,'geom',**attrs)
   for site in b['sites']:ET.SubElement(node,'site',name=site['name'],pos=fmt(site['pos']),quat=fmt(site['quat']),size='.002')
 if style=='duck-overview' or kind=='sharpa':
  # Enable physical contact across distinct digits. Adjacent links and palm
  # mounts overlap by construction, so exclude only those anatomical pairs.
  contact=ET.SubElement(root,'contact')
  def digit(body):
   name=body['name'].lower()
   return next((x for x in (['thumb','index','mid','ring','pinky'] if kind in ('xhand','sharpa') else ['th','ff','mf','rf','lf']) if x in name),None)
  if kind=='sharpa':
   for ex in h.get('contactExclusions',[]):
    aa=next(bb for bb in h['bodies'] if bb['name']==ex['body1']);bb=next(bb for bb in h['bodies'] if bb['name']==ex['body2'])
    if digit(aa) and digit(bb) and digit(aa)!=digit(bb):ET.SubElement(contact,'exclude',**ex)
  for i,aa in enumerate(h['bodies']):
   for bb in h['bodies'][i+1:]:
    if digit(aa) is None or digit(bb) is None or digit(aa)==digit(bb):ET.SubElement(contact,'exclude',body1=aa['name'],body2=bb['name'])
 obj=ET.SubElement(world,'body',name='object');ET.SubElement(obj,'freejoint',name='object_free')
 is_native_duck=name=='duck' and style in ('duck-front','duck-overview')
 if is_native_duck:
  duck=native_duck();ET.SubElement(obj,'inertial',**duck['inertial'])
  ET.SubElement(asset,'mesh',name='duck_visual',vertex=fmt(duck['vertices']),face=' '.join(map(str,duck['faces'])))
  ET.SubElement(obj,'geom',name='duck_visual',type='mesh',mesh='duck_visual',rgba=fmt(duck['color']),contype='0',conaffinity='0',mass='0')
 else:ET.SubElement(obj,'inertial',pos='0 0 0',mass='.07' if name!='dumbbell' else '.12',diaginertia='.00005 .00005 .00005')
 for i,p in enumerate(parts):
  attrs=dict(name=f'object_{i}',type=p['type'],pos=fmt(p['pos']),quat=fmt(p['quat']),rgba=fmt(p['color']),contype='1',conaffinity='3')
  if p['type']=='mesh':
   meshname=f'duck_collision_{i}';ET.SubElement(asset,'mesh',name=meshname,vertex=fmt(p['vertices']),face=' '.join(map(str,p['faces'])));attrs.update(mesh=meshname,group='3',mass='0')
  else:attrs['size']=fmt(p['size'])
  ET.SubElement(obj,'geom',**attrs)
 act=ET.SubElement(root,'actuator')
 for j in h['joints']:ET.SubElement(act,'position',name='a_'+j['name'],joint=j['name'],kp='12',kv='.35',ctrlrange=fmt(j['range']),forcerange='-1.5 1.5')
 xml=ET.tostring(root,encoding='unicode');m=mujoco.MjModel.from_xml_string(xml);d=mujoco.MjData(m)
 samples=[(m.body(name).id,pts) for name,pts in samples];return m,d,h,local,rot,parts,samples,xml

_mesh_query_cache={}
def sdf(points,parts,penetration_only=False):
 vals=[]
 for p in parts:
  v=R.from_quat(p['quat'],scalar_first=True).inv().apply(points-np.array(p['pos']));s=np.array(p['size']);t=p['type']
  if t=='mesh':
   if id(p) not in _mesh_query_cache:
    vv=np.asarray(p['vertices']).reshape(-1,3);_mesh_query_cache[id(p)]=(np.asarray(p['planes']),vv.min(0),vv.max(0))
   planes,lo,hi=_mesh_query_cache[id(p)]
   if penetration_only:
    dist=np.linalg.norm(np.maximum(np.maximum(lo-v,v-hi),0),axis=1)
    near=np.all((v>=lo-.002)&(v<=hi+.002),axis=1)
    if np.any(near):dist[near]=np.max(v[near]@planes[:,:3].T+planes[:,3],axis=1)
   else:dist=np.max(v@planes[:,:3].T+planes[:,3],axis=1)
  elif t=='sphere':dist=np.linalg.norm(v,axis=1)-s[0]
  elif t=='ellipsoid':
   k0=np.linalg.norm(v/s,axis=1);k1=np.linalg.norm(v/(s*s),axis=1);dist=k0*(k0-1)/np.maximum(k1,1e-8)
  elif t=='box':
   q=np.abs(v)-s;dist=np.linalg.norm(np.maximum(q,0),axis=1)+np.minimum(np.max(q,axis=1),0)
  elif t=='cylinder':
   q=np.stack([np.linalg.norm(v[:,:2],axis=1)-s[0],np.abs(v[:,2])-s[1]],axis=1);dist=np.linalg.norm(np.maximum(q,0),axis=1)+np.minimum(np.max(q,axis=1),0)
  else:
   v[:,2]-=np.clip(v[:,2],-s[1],s[1]);dist=np.linalg.norm(v,axis=1)-s[0]
  vals.append(dist)
 return np.min(vals,axis=0)

def initial(h,kind):
 q=np.zeros(len(h['joints']));closed=np.zeros_like(q)
 for i,j in enumerate(h['joints']):
  n=j['name'];lo,hi=j['range'];q[i]=np.clip(0,lo,hi)
  if kind=='xhand':
   closed[i]=.9
   if 'thumb_bend' in n:closed[i]=1.1;q[i]=.7
   elif 'thumb_rota_joint1' in n:closed[i]=.35
   elif 'thumb_rota_joint2' in n:closed[i]=1.05
   elif 'index_bend' in n:closed[i]=0
  elif kind=='allegro':
   ix=i;closed[i]=[0,1.0,.9,.8][ix%4]
   if ix==12:closed[i]=1.3;q[i]=1.1
   elif ix==13:closed[i]=.3;q[i]=.1
   elif ix==14:closed[i]=.6
   elif ix==15:closed[i]=.9
  elif kind=='sharpa':
   closed[i]=0 if '_AA' in n else .85
   if 'thumb_CMC_FE' in n:q[i]=.9;closed[i]=1.3
   if 'thumb_MCP_FE' in n:closed[i]=.3
  else:
   if 'WRJ' in n or n.endswith('J4') or n in ['rh_THJ2','rh_THJ3','rh_THJ5','rh_LFJ5']:closed[i]=0
   else:closed[i]=.9
   if n=='rh_THJ5':q[i]=closed[i]=.8
   if n=='rh_THJ2':q[i]=closed[i]=.4
   if n=='rh_THJ4':closed[i]=.7
  closed[i]=np.clip(closed[i],lo,hi)
 return q,closed

def trial(kind,name,offset=(0,0,0),scale=1,close_scale=1.,record=False,optimize=False,custom=None,custom_open=None,angle=None,roll=0,close_start=1.2,close_end=3.,style=None):
 m,d,h,local,rot,parts,samples,xml=build(kind,name,scale,angle,roll,style)
 adr=np.array([m.jnt_qposadr[m.joint(j['name']).id] for j in h['joints']]);oa=int(m.jnt_qposadr[m.joint('object_free').id]);bid=m.body('object').id
 wa=int(m.jnt_qposadr[m.joint('wrist_free').id]);wb=m.body('dynamic_wrist').id
 qopen,qclose=initial(h,kind);qclose=np.array([np.clip(x*close_scale,*j['range']) for x,j in zip(qclose,h['joints'])]);
 if custom is not None:qclose=np.array(custom)
 if custom_open is not None:qopen=np.array(custom_open)
 # Compute support height from the exact primitive union.
 def support(p):
  if p['type']=='mesh':return float(np.min(np.asarray(p['vertices']).reshape(-1,3)[:,2]))
  axis=R.from_quat(p['quat'],scalar_first=True).as_matrix()[2];s=p['size'];t=p['type']
  if t=='sphere':radius=s[0]
  elif t=='ellipsoid':radius=np.linalg.norm(axis*np.array(s))
  elif t=='box':radius=np.abs(axis)@np.array(s)
  elif t=='capsule':radius=s[0]+abs(axis[2])*s[1]
  else:radius=s[0]*np.linalg.norm(axis[:2])+abs(axis[2])*s[1]
  return p['pos'][2]-radius
 bottom=min(support(p) for p in parts)
 center=np.array([0.,0.,-bottom+.001]);local=local+offset;target_offset=np.array({'mug':[0,.076,.025],'duck':[0,0,-.008],'bottle':[0,0,-.012]}.get(name,[0,0,0]));wrist=center+target_offset-rot@local;approach=-rot[:,2]*.10+np.array([0,0,.008]);quat=R.from_matrix(rot).as_quat(scalar_first=True)
 if style in ('duck-front','bottle-front'):approach=np.array([.11,0,.025])
 elif style=='duck-overview':approach=-rot@np.array([0,-1,0] if kind=='shadow' else [1,0,0])*.11+np.array([0,0,.012])
 elif style in ('apple-top','dumbbell-top','bottle-top'):approach=np.array([0,0,.12])
 elif style=='bottle-wrap':approach=-rot@np.array([0,-1,0] if kind=='shadow' else [1,0,0])*.11+np.array([0,0,.008])
 d.qpos[oa:oa+3]=center;d.qpos[oa+3:oa+7]=[1,0,0,0];d.qpos[adr]=qopen;d.mocap_pos[0]=wrist+approach;d.mocap_quat[0]=quat;d.qpos[wa:wa+7]=np.r_[d.mocap_pos[0],quat];d.ctrl[:]=qopen;mujoco.mj_forward(m,d)
 history=[]
 # Surface/keypoint objective is evaluated at the planned palm pose.
 d.mocap_pos[0]=wrist;d.qpos[wa:wa+7]=np.r_[wrist,quat];mujoco.mj_forward(m,d)
 def loss(q,detail=False):
  d.qpos[adr]=q;mujoco.mj_forward(m,d);distances=[];groups={};floor_dist=[]
  for b,pts in samples:
   if b==3:continue
   world=pts@d.xmat[b].reshape(3,3).T+d.xpos[b]-center
   ds=sdf(world,parts);distances.append(ds);floor_dist.extend(world[:,2]+center[2])
   bn=m.body(b).name
   if kind in ('xhand','sharpa'): finger=next((x for x in ['thumb','index','mid','ring','pinky'] if x in bn),None)
   elif kind=='allegro':
    ancestors=[];bb=b
    while bb>1:
     if m.body_jntnum[bb]:ancestors.append(m.joint(m.body_jntadr[bb]).name)
     bb=m.body_parentid[bb]
    finger=ancestors[-1][:2] if ancestors else None
   else:finger=next((x for x in ['th','ff','mf','rf','lf'] if x in bn.lower()),None)
   if finger:groups.setdefault(finger,[]).append(ds)
  ds=np.concatenate(distances)
  attraction=np.mean([np.mean(np.sort((np.concatenate(v)+.002)**2)[:6]) for v in groups.values()])
  penetration=np.mean(np.minimum(ds+.0025,0)**2)
  clearance=np.mean(np.minimum(np.array(floor_dist)-.003,0)**2)
  return float(1e4*(attraction+14*penetration+35*clearance)+.002*np.mean((q-qclose)**2))
 if optimize:
  result=minimize(loss,qclose,method='L-BFGS-B',bounds=[([0,0] if 'WRJ' in j['name'] else j['range']) for j in h['joints']],options={'maxiter':45,'ftol':1e-7},callback=lambda q:history.append([*q.tolist(),loss(q)]))
  target=result.x
  # Small closure preload keeps contact while lifting; native position targets
  # remain bounded and contacts determine the realized joint angles.
  qclose=np.array([np.clip(v+.10*(b-a),*j['range']) for v,a,b,j in zip(target,qopen,qclose,h['joints'])])
  history.insert(0,[*qopen.tolist(),loss(qopen)]);history.append([*qclose.tolist(),loss(qclose)])
 # Reset before stepping; object pose is never written again.
 mujoco.mj_resetData(m,d);d.qpos[oa:oa+3]=center;d.qpos[oa+3:oa+7]=[1,0,0,0];d.qpos[adr]=qopen;d.mocap_pos[0]=wrist+approach;d.mocap_quat[0]=quat;d.qpos[wa:wa+7]=np.r_[d.mocap_pos[0],quat];d.ctrl[:]=qopen
 frames=[];lifts=[];contacts=[];pen=0.;start=None;slips=[];tilts=[];table_pen=0.;prelift_drift=0.;servo_offset=np.zeros(3);region_contacts=[];wrong_contacts=[];digit_contact_counts=[];self_pen=0.
 smooth=lambda x:(lambda y:y*y*(3-2*y))(np.clip(x,0,1))
 for step in range(4000):
  t=step*.002
  if t<1.2:pos=wrist+approach*(1-smooth(t/1.2));ctrl=qopen;phase=0
  elif t<3:pos=wrist;ctrl=qopen+(qclose-qopen)*smooth((t-1.2)/1.8);phase=1
  elif t<5:pos=wrist+np.array([0,0,.18*smooth((t-3)/2)]);ctrl=qclose;phase=2
  else:pos=wrist+np.array([.045*np.sin((t-5)*2*np.pi/1.5)*np.sin(np.pi*min(t-5,3)/3)**.5,0,.18]);ctrl=qclose;phase=3
  if name=='mug':
   if t<3:servo_offset[:2]=-np.clip(d.xpos[bid,:2]-center[:2],-.04,.04)
   pos=pos+servo_offset
  if t<3:ctrl=qopen+(qclose-qopen)*smooth((t-close_start)/(close_end-close_start))
  d.mocap_pos[0]=pos;d.ctrl[:]=ctrl;mujoco.mj_step(m,d)
  if step==100:start=d.xpos[bid,2]
  if t<3:prelift_drift=max(prelift_drift,float(np.linalg.norm(d.xpos[bid,:2]-center[:2])))
  floor_contacts=[c for c in d.contact if c.geom1==0 or c.geom2==0];table_pen=max(table_pen,max([-c.dist for c in floor_contacts if m.geom_contype[c.geom1]==2 or m.geom_contype[c.geom2]==2]+[0]))
  cs=[c for c in d.contact if (m.geom_bodyid[c.geom1]==bid or m.geom_bodyid[c.geom2]==bid)]
  handcs=[c for c in cs if m.geom_contype[c.geom1]==2 or m.geom_contype[c.geom2]==2];pen=max(pen,max([-c.dist for c in handcs]+[0]))
  if t>=3:
   objr=d.xmat[bid].reshape(3,3);axis=objr[:,1] if name=='dumbbell' else objr[:,2];alignment=abs(axis[1]) if name=='dumbbell' else axis[2];tilts.append(float(np.degrees(np.arccos(np.clip(alignment,-1,1)))))
  if t>=5:
   object_geoms=[c.geom1 if m.geom_bodyid[c.geom1]==bid else c.geom2 for c in handcs];indices=[int(m.geom(g).name.split('_')[-1]) for g in object_geoms];region_contacts.append(sum(i>=25 for i in indices) if name=='mug' else sum(i==0 for i in indices) if name in ['dumbbell','bottle'] else len(indices));wrong_contacts.append(sum(i<25 for i in indices) if name=='mug' else sum(i>0 for i in indices) if name=='dumbbell' else 0)
  if kind=='sharpa':
   self_pen=max(self_pen,max([-c.dist for c in d.contact if m.geom_contype[c.geom1]==2 and m.geom_contype[c.geom2]==2]+[0]))
   if t>=5:
    touched=[m.body(m.geom_bodyid[c.geom1 if m.geom_contype[c.geom1]==2 else c.geom2]).name for c in handcs]
    digit_contact_counts.append([sum(digit in body for body in touched) for digit in ['thumb','index','middle','ring','pinky']])
  if t>=5:lifts.append(float(d.xpos[bid,2]-(start or center[2])));contacts.append(len(handcs));slips.append(float(np.linalg.norm(d.xpos[bid]-pos-rot@local)))
  if record and step%10==0:
   xyz=np.concatenate([pts@d.xmat[body].reshape(3,3).T+d.xpos[body] for body,pts in samples if body!=3]);ds=sdf((xyz-d.xpos[bid])@d.xmat[bid].reshape(3,3),parts)
   nearest=np.sort(np.abs(ds))[:40];measured=float(1e4*(np.mean(nearest**2)+10*np.mean(np.minimum(ds,0)**2)))
   frames.append([round(t,4),*np.round(d.qpos[adr],6).tolist(),*np.round(d.xpos[wb],6).tolist(),*np.round(d.xpos[bid],6).tolist(),*np.round(d.xquat[bid],7).tolist(),phase,*np.round(d.xquat[wb],7).tolist(),round(measured,7)])
 result={'hand':kind,'object':name,'offset':list(offset),'scale':scale,'closure':close_scale,'qtarget':qclose.tolist(),'qopen':qopen.tolist(),'angle':angle or 0,'roll':roll,'style':style,'close_start':close_start,'close_end':close_end,'lift_min':round(min(lifts),5),'lift_max':round(max(lifts),5),'contacts_min':min(contacts),'max_penetration':round(pen,5),'slip_max':round(max(slips),5),'tilt_max_deg':round(max(tilts),2),'table_penetration_m':round(table_pen,6),'prelift_drift_m':round(prelift_drift,5),'region_contacts_min':min(region_contacts),'wrong_contacts_max':max(wrong_contacts),'success':(name!='mug' or (min(region_contacts)>0 and max(wrong_contacts)==0)) and (name!='dumbbell' or min(region_contacts)>0) and min(lifts)>.12 and min(contacts)>0 and pen<.004 and table_pen<.003 and (name=='apple' or max(tilts)<28) and prelift_drift<.045}
 if kind=='sharpa':
  result.update(digit_contact_min=np.min(digit_contact_counts,axis=0).tolist(),digit_contact_max=np.max(digit_contact_counts,axis=0).tolist(),self_penetration_m=self_pen)
  if name=='mug':result['success']=result['success'] and all(v>0 for v in result['digit_contact_min'][:2]) and not any(result['digit_contact_max'][2:])
 if record:
  result['replay']={'hand':kind,'object':name,'fps':50,'duration':8,'wristQuaternion':quat.tolist(),'parts':parts,'jointNames':[j['name'] for j in h['joints']],'frames':frames,'optimization':history,'frameLayout':'time, hand qpos, wrist position(3), object position(3), object quaternion wxyz(4), phase, wrist quaternion wxyz(4), grasp optimization loss, arm qpos(7)', 'physics':{k:v for k,v in result.items() if k!='replay'}}
  if name=='duck' and style in ('duck-front','duck-overview'):result['replay']['objectMesh']='duck-native.json';result['replay']['objectGeometry']=native_duck()['provenance']
 return result

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--hand',default='xhand');p.add_argument('--object',default='apple');p.add_argument('--offset',nargs=3,type=float,default=[0,0,0]);p.add_argument('--scale',type=float,default=1);p.add_argument('--closure',type=float,default=1);p.add_argument('--angle',type=float);p.add_argument('--record',action='store_true');p.add_argument('--optimize',action='store_true');a=p.parse_args()
 result=trial(a.hand,a.object,a.offset,a.scale,a.closure,a.record,a.optimize,angle=a.angle)
 if a.record:
  target=OUT if result['success'] else QA
  (target/f'{a.hand}-{a.object}.json').write_text(json.dumps(result.pop('replay'),separators=(',',':')))
 print(json.dumps(result),flush=True)
