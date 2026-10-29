"""Validate delivered media and actual native-hand replay frames, without a browser."""
from pathlib import Path
import json,subprocess,sys,collections
import numpy as np,mujoco
from PIL import Image,ImageSequence
import importlib
b=importlib.import_module('build-grasp-replays');S=b.SITE;QA=S/'.preview/library50-sharpa-20261029';report={}
cat=json.loads((S/'assets/demos/catalog.json').read_text());objects=json.loads((S/'assets/lab/objects.json').read_text())
assert len(cat)==len(objects)==50 and len({x['id'] for x in cat})==50
assert {x['id'] for x in cat}=={x['id'] for x in objects}
counts=dict(collections.Counter(x['family'] for x in cat));assert counts=={'articulated':30,'skinned':7,'deformable':13};report['counts']=counts
media=[]
for entry in cat:
 with Image.open(S/entry['src']) as im:
  count=0;different=False;first=None
  for frame in ImageSequence.Iterator(im):
   rgb=frame.convert('RGB');raw=rgb.tobytes();first=first or raw;different|=raw!=first;count+=1
  assert count>=2 and different,entry['id'];media.append({'id':entry['id'],'frames':count,'size':im.size})
 with Image.open(S/entry['poster']) as im:im.load()
for entry in objects:
 with Image.open(S/entry['thumbnail']) as im:im.load();assert im.size==(256,200)
report['media']=media
report['preserved_approved_replays']=[]
for kind in ['xhand','allegro']:
 for name in ['mug','duck','dumbbell','bottle','apple']:
  path=f'assets/lab/grasp/{kind}-{name}.json';assert subprocess.check_output(['git','show','42a8a01:'+path],cwd=S)==(S/path).read_bytes();report['preserved_approved_replays'].append(path)
old=json.loads(subprocess.check_output(['git','show','42a8a01:assets/lab/rigs.json'],cwd=S));now=json.loads((S/'assets/lab/rigs.json').read_text());assert all(old[k]==now[k] for k in old)
report['sharpa']=[]
for name in ['mug','duck','dumbbell','bottle','apple']:
 record=json.loads((b.OUT/f'sharpa-{name}.json').read_text());p=record['physics'];frames=np.asarray(record['frames']);assert frames.shape==(400,46) and np.isfinite(frames).all();assert len(record['jointNames'])==22
 bounds=np.array([j['range'] for j in now['sharpa']['joints']]);assert np.all(frames[:,1:23]>=bounds[:,0]-.015) and np.all(frames[:,1:23]<=bounds[:,1]+.015)
 assert p['success'] and p['lift_min']>=.16 and p['contacts_min']>=2
 assert p['max_penetration']<.0015 and p['table_penetration_m']<.0005 and p['self_penetration_m']<.0008
 assert p['tilt_max_deg']<(28 if name=='mug' else 18) and p['prelift_drift_m']<.025
 assert p['arm_ik_max_error_m']<.003 and p['arm_orientation_max_error_deg']<1 and p['arm_surface_clearance_m']>.005
 if name=='mug':assert min(p['digit_contact_min'][:2])>0 and max(p['digit_contact_max'][2:])==0 and p['wrong_contacts_max']==0
 m,d,_,_,_,_,_,_=b.build('sharpa',name,angle=p['angle'],roll=p['roll'],style=p['style']);adr=[m.jnt_qposadr[m.joint(j).id] for j in record['jointNames']];wa=m.jnt_qposadr[m.joint('wrist_free').id];oa=m.jnt_qposadr[m.joint('object_free').id];bid=m.body('object').id
 tips=[m.geom('right_'+f+'_fingertip_collision').id for f in ['thumb','index','middle','ring','pinky']];sides=[]
 for frame in frames[250::5]:
  n=22;d.qpos[adr]=frame[1:23];d.qpos[wa:wa+7]=np.r_[frame[n+1:n+4],frame[n+12:n+16]];d.qpos[oa:oa+7]=frame[n+4:n+11];mujoco.mj_forward(m,d)
  relative=(d.geom_xpos[tips]-d.xpos[bid])@d.xmat[bid].reshape(3,3);sides.append(relative[:,0])
 if name=='bottle':
  sides=np.array(sides);assert sides[:,0].min()>.01 and sides[:,1:].max()<-.005, sides
 keep=['lift_min','contacts_min','max_penetration','table_penetration_m','self_penetration_m','tilt_max_deg','digit_contact_min','digit_contact_max','arm_ik_max_error_m','arm_surface_clearance_m'];report['sharpa'].append({'object':name,**{k:p[k] for k in keep}})
(QA/'validation.json').write_text(json.dumps(report,indent=2));print(json.dumps({'counts':counts,'decoded_gifs':len(media),'preserved_replays':10,'sharpa':report['sharpa']},indent=2))
