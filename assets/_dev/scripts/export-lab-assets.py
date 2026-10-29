"""Export original MuJoCo rigs and existing source meshes for the static website.
No connection to, or mutation of, the running simulator. Arms stay at their saved
pose. Contact replays are built separately by rebuild-grasp-set.py; this exporter
only provides reusable geometry and kinematics.
Run with ../simulator/.venv/bin/python assets/_dev/scripts/export-lab-assets.py.
"""
from pathlib import Path
import json,sys,shutil
import numpy as np
import mujoco,trimesh
ROOT=Path(__file__).resolve().parents[4];SITE=ROOT/'agenticWR';OUT=SITE/'assets/lab';OUT.mkdir(exist_ok=True)
sys.path.insert(0,str(ROOT/'reports/representation_page_20261028/python-deps'))
import fast_simplification

def arr(v):return np.round(np.asarray(v),7).tolist()
def simp(v,f,n=1800):
 m=trimesh.Trimesh(v,f,process=True);m.update_faces(m.unique_faces());m.remove_unreferenced_vertices()
 if len(m.faces)>n:
  v,f=fast_simplification.simplify(m.vertices,m.faces,target_count=n,agg=5);m=trimesh.Trimesh(v,f,process=False)
 return {'vertices':arr(m.vertices.reshape(-1)),'faces':m.faces.reshape(-1).tolist()}
def mesh(m,g):
 mid=int(m.geom_dataid[g]);v=int(m.mesh_vertadr[mid]);f=int(m.mesh_faceadr[mid])
 return simp(m.mesh_vert[v:v+m.mesh_vertnum[mid]],m.mesh_face[f:f+m.mesh_facenum[mid]],1500)
def rgba(m,g):
 mat=int(m.geom_matid[g]);return arr(m.mat_rgba[mat] if mat>=0 else m.geom_rgba[g])
def hand(m,base,home):
 bodies=[];lookup={};joints=[]
 for b in range(base,m.nbody):
  parent=int(m.body_parentid[b]);ancestor=b
  while ancestor>base:ancestor=int(m.body_parentid[ancestor])
  if ancestor!=base:continue
  index=len(bodies);lookup[b]=index
  item={'name':m.body(b).name,'parent':lookup.get(parent,-1),'pos':arr(m.body_pos[b]),'quat':arr(m.body_quat[b]),'geoms':[]}
  if b==base:item.update(pos=[0,0,0],quat=[1,0,0,0])
  for j in range(int(m.body_jntadr[b]),int(m.body_jntadr[b]+m.body_jntnum[b])):
   if m.jnt_type[j]!=mujoco.mjtJoint.mjJNT_HINGE:continue
   item['joint']=len(joints);joints.append({'name':m.joint(j).name,'body':index,'axis':arr(m.jnt_axis[j]),'pivot':arr(m.jnt_pos[j]),'range':arr(m.jnt_range[j]),'home':float(home[int(m.jnt_qposadr[j])])})
  for g in range(int(m.body_geomadr[b]),int(m.body_geomadr[b]+m.body_geomnum[b])):
   if int(m.geom_type[g])!=int(mujoco.mjtGeom.mjGEOM_MESH) or m.geom_group[g]!=2:continue
   shape=mesh(m,g);shape.update(pos=arr(m.geom_pos[g]),quat=arr(m.geom_quat[g]),color=rgba(m,g));item['geoms'].append(shape)
  bodies.append(item)
 return dict(bodies=bodies,joints=joints)

m=mujoco.MjModel.from_xml_path(str(ROOT/'simulator/runtime/scene.xml'));d=mujoco.MjData(m)
meta=json.loads((ROOT/'simulator/runtime/metadata.json').read_text())
for r in meta['robots']:
 for name,q in zip(r['arm_joints']+r['hand_joints'],r['home']+r['hand_home']):d.qpos[m.jnt_qposadr[m.joint(name).id]]=q
mujoco.mj_forward(m,d)
rigs={}
for side in ['left','right']:
 base=m.body(f'{side}_{side}_hand_link').id;arm=[]
 for g in range(m.ngeom):
  name=m.geom(g).name or '';b=m.geom_bodyid[g]
  if not name.startswith(side+'_') or 'hand' in name or m.geom_group[g]!=2 or m.geom_type[g]!=mujoco.mjtGeom.mjGEOM_MESH:continue
  shape=mesh(m,g);shape.update(pos=arr(d.geom_xpos[g]),matrix=arr(d.geom_xmat[g]),color=rgba(m,g));arm.append(shape)
 h=hand(m,base,d.qpos);h['mount']={'pos':arr(d.xpos[base]),'matrix':arr(d.xmat[base])}
 rigs[side]={'arm':arm,'hand':h};print(side,len(arm),len(h['bodies']),len(h['joints']),h['mount']['pos'],flush=True)
for kind,name in [('allegro','wonik_allegro'),('shadow','shadow_hand')]:
 src=SITE/'.preview/interactive-lab-20261029/upstream'/name
 model=mujoco.MjModel.from_xml_path(str(src/'right_hand.xml'));data=mujoco.MjData(model);h=hand(model,model.body('rh_palm').id if kind=='shadow' else 1,data.qpos)
 rigs[kind]=h
 shutil.copy2(src/'LICENSE',OUT/(kind+'-LICENSE.txt'))
 print(kind,len(h['bodies']),len(h['joints']),flush=True)
(OUT/'rigs.json').write_text(json.dumps(rigs,separators=(',',':')))

# Preserve the full 27-object library. Native constrained workbench versions are
# used when available; all other meshes are independent original asset renders.
colors=['#96704c','#506477','#ceb55c','#9eabb6','#abb1b7','#b89769','#b3c9d1','#536776','#424c55','#353b45','#66503d','#aa8058','#8b542d','#c3a16b','#858084','#c29376','#af7d61','#e2a4b4','#b89b78','#c4afa1','#86a7bb','#dc91a7','#b4ac85','#5d9256','#aa94c3','#c39258','#d0c6b3']
cat=[x for x in json.loads((SITE/'assets/demos/catalog.json').read_text()) if x['animated']]
mapping={'pliers':'pliers','partnet_faucet_1370':'faucet','partnet_storagefurniture_46403':'cabinet','xhand_right':'xhand','smal_bovidae':'cow','smal_equidae':'horse','smal_hippopotamidae':'hippo','smpl_female':'human','smpl_male':'human'}
objects=[]
for i,item in enumerate(cat):
 name=item['id'];entry={'id':name,'name':item['name'],'family':item['family'],'color':colors[i],'thumbnail':f'assets/zoo-thumbnails/{name}.png'}
 if name in mapping:entry['constrained']=mapping[name]
 else:
  z=np.load(ROOT/'reports/three_page_refinement_20261028/zoo-native-sources'/(name+'.npz'));v=z['vertices'].copy();v-=(v.min(0)+v.max(0))/2;v/=np.ptp(v,axis=0).max()
  shape=simp(v,z['faces'],9500);(OUT/(name+'.json')).write_text(json.dumps(shape,separators=(',',':')));entry['geometry']=name+'.json'
 objects.append(entry)
(OUT/'objects.json').write_text(json.dumps(objects,indent=2))
# Original MuJoCo tabletop mug and dumbbell, plus the existing native duck.
props={}
for name in ['mug','dumbbell','cylinder']:
 b=m.body('object_'+name).id;parts=[]
 for g in range(m.body_geomadr[b],m.body_geomadr[b]+m.body_geomnum[b]):
  parts.append({'type':int(m.geom_type[g]),'size':arr(m.geom_size[g]),'pos':arr(m.geom_pos[g]),'quat':arr(m.geom_quat[g]),'color':rgba(m,g)})
 props[name]=parts
(OUT/'props.json').write_text(json.dumps(props,separators=(',',':')))
for src,dest in [('simulator/assets/xhand_left/LICENSE','xhand-left-LICENSE.txt'),('simulator/assets/xarm7/LICENSE','xarm-LICENSE.txt')]:shutil.copy2(ROOT/src,OUT/dest)
(OUT/'sources.json').write_text(json.dumps({'rigs':'Original local MuJoCo xArm7 and independently exported native left/right XHand models; arm configuration fixed.','additional_hands':{'allegro':'https://github.com/google-deepmind/mujoco_menagerie/tree/main/wonik_allegro','shadow':'https://github.com/google-deepmind/mujoco_menagerie/tree/main/shadow_hand'},'objects':'Original assets from reports/three_page_refinement_20261028/zoo-native-sources; constrained shapes reuse existing static website geometry.','motion':'Native constrained FK where available. Other object keypoint deformations are illustrative transport of existing mesh surfaces, not fresh neural inference.','optimization':'Offline native-hand MuJoCo contact replays from rebuild-grasp-set.py, using compound object geometry and tuned geometric/contact objectives; no learned-field inference in the webpage.','gradient_diagram_source':'worldstring-plus/grasp_opt/common/ws_direct_grasp_loss.py and solvers.py; both fields frozen while preserving input gradients.'},indent=2))
print('Exported',len(objects),'objects; rigs',round((OUT/'rigs.json').stat().st_size/1e6,2),'MB',flush=True)
