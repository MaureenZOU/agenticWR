"""Export the official Sharpa Wave model, preserving native collision geometry."""
from pathlib import Path
import ast,json,sys,shutil
import xml.etree.ElementTree as ET
import numpy as np,mujoco,trimesh
ROOT=Path(__file__).resolve().parents[2];SITE=ROOT/'agenticWR';OUT=SITE/'assets/lab'
sys.path.insert(0,str(ROOT/'reports/representation_page_20261028/python-deps'))
import fast_simplification
source=ast.parse((SITE/'scripts/export-lab-assets.py').read_text())
exec(compile(ast.Module(body=[n for n in source.body if isinstance(n,ast.FunctionDef)],type_ignores=[]),'export-functions','exec'))
src=SITE/'.preview/library50-sharpa-20261029/menagerie/sharpa_wave'
m=mujoco.MjModel.from_xml_path(str(src/'right_hand.xml'));d=mujoco.MjData(m);mujoco.mj_forward(m,d)
h=hand(m,1,d.qpos)
for i,item in enumerate(h['bodies']):
 b=m.body(item['name']).id
 item['inertial']={'pos':arr(m.body_ipos[b]),'quat':arr(m.body_iquat[b]),'mass':float(m.body_mass[b]),'diaginertia':m.body_inertia[b].tolist()}
 item['collision']=[];item['sites']=[]
 for sid in range(m.nsite):
  if m.site_bodyid[sid]==b:item['sites'].append({'name':m.site(sid).name,'pos':arr(m.site_pos[sid]),'quat':arr(m.site_quat[sid])})
 for g in range(m.body_geomadr[b],m.body_geomadr[b]+m.body_geomnum[b]):
  if not m.geom_contype[g]:continue
  shape={'name':m.geom(g).name or f'collision_{g}','type':mujoco.mjtGeom(int(m.geom_type[g])).name.removeprefix('mjGEOM_').lower(),'size':arr(m.geom_size[g]),'pos':arr(m.geom_pos[g]),'quat':arr(m.geom_quat[g])}
  if shape['type']=='mesh':
   mid=int(m.geom_dataid[g]);v=int(m.mesh_vertadr[mid]);f=int(m.mesh_faceadr[mid]);shape.update(vertices=arr(m.mesh_vert[v:v+m.mesh_vertnum[mid]].reshape(-1)),faces=m.mesh_face[f:f+m.mesh_facenum[mid]].reshape(-1).tolist())
  item['collision'].append(shape)
h['contactExclusions']=[dict(e.attrib) for e in ET.parse(src/'right_hand.xml').getroot().findall('contact/exclude')]
h['source']='https://github.com/google-deepmind/mujoco_menagerie/tree/main/sharpa_wave';h['model']='Sharpa Wave right hand, 22 native DOF'
rigs=json.loads((OUT/'rigs.json').read_text());rigs['sharpa']=h;(OUT/'rigs.json').write_text(json.dumps(rigs,separators=(',',':')))
shutil.copy2(src/'LICENSE',OUT/'sharpa-LICENSE.txt')
print('Sharpa:',len(h['bodies']),'bodies',len(h['joints']),'joints',sum(len(b['collision']) for b in h['bodies']),'collision geometries')
print([(m.site(s).name,arr(d.site_xpos[s])) for s in range(m.nsite)])
