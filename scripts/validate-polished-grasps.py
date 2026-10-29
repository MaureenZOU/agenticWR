"""Check approach motion, native contact coverage, and unchanged accepted replays."""
from pathlib import Path
import json,sys,subprocess,importlib
import numpy as np,mujoco
b=importlib.import_module('build-grasp-replays');S=b.SITE;report={'baseline':'1c10d13','preserved_replays':[],'grasps':[]}
for hand in ['xhand','allegro','sharpa']:
 for name in ['mug','duck','bottle','apple','dumbbell']:
  if hand=='sharpa' and name in ['mug','duck']:continue
  path=f'assets/lab/grasp/{hand}-{name}.json';assert (S/path).read_bytes()==subprocess.check_output(['git','show','1c10d13:'+path],cwd=S);report['preserved_replays'].append(path)
for name in ['mug','duck']:
 data=json.loads((b.OUT/f'sharpa-{name}.json').read_text());p=data['physics'];fs=np.asarray(data['frames']);n=len(data['jointNames']);assert fs.shape==(400,46) and np.isfinite(fs).all()
 assert p['success'] and p['lift_min']>=.16 and p['max_penetration']<.001
 assert p['prelift_drift_m']<.0025 and p['self_penetration_m']<.0005 and p['table_penetration_m']<.0001
 assert p['arm_ik_max_error_m']<.001 and p['arm_surface_clearance_m']>.005
 if name=='mug':
  assert p['approach_drift_m']<.0001 and min(p['digit_contact_min'][:2])>=1 and max(p['digit_contact_max'][2:])==0
  assert min(p['first_contact_seconds'].values())>1.2 and abs(p['first_contact_seconds']['thumb']-p['first_contact_seconds']['index'])<.05
 else:assert min(p['digit_contact_min'])>=1 and p['non_tip_contacts_min']>=4 and p['tilt_max_deg']<3
 m,d,h,_,_,parts,_,_=b.build('sharpa',name,angle=p['angle'],roll=p['roll'],style=p['style']);ad=[m.jnt_qposadr[m.joint(j).id] for j in data['jointNames']];wa=m.jnt_qposadr[m.joint('wrist_free').id];oa=m.jnt_qposadr[m.joint('object_free').id];og=[m.geom('object_'+str(i)).id for i in range(len(parts))];palm=[g for g in range(m.ngeom) if m.geom_contype[g]==2 and 'palm' in m.geom(g).name];gaps=[];contacts=[]
 limits=np.array([j['range'] for j in h['joints']]);assert np.all(fs[:,1:23]>=limits[:,0]-.015) and np.all(fs[:,1:23]<=limits[:,1]+.015)
 for f in fs[250::5]:
  d.qpos[ad]=f[1:23];d.qpos[wa:wa+7]=np.r_[f[23:26],f[34:38]];d.qpos[oa:oa+7]=f[26:33];mujoco.mj_forward(m,d)
  gaps.append(min(mujoco.mj_geomDistance(m,d,a,o,.3,None) for a in palm for o in og))
  contacts.append(sum((c.geom1 in og and m.geom_contype[c.geom2]==2) or (c.geom2 in og and m.geom_contype[c.geom1]==2) for c in d.contact))
 if name=='duck':assert max(gaps)<.020,max(gaps)
 report['grasps'].append({'object':name,**{k:p[k] for k in ['approach_drift_m','prelift_drift_m','first_contact_seconds','lift_min','tilt_max_deg','digit_contact_min','non_tip_contacts_min','max_penetration','self_penetration_m','arm_surface_clearance_m']},'held_palm_gap_max_m':max(gaps),'reconstructed_contact_count_min':int(min(contacts))})
(S/'docs/grasp-zoo-polish-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
