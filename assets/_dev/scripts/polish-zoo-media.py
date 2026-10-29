"""Presentation cleanup of learned surfaces; source-assisted thin-panel completion is recorded."""
from pathlib import Path
import os,sys,json,importlib.util,shutil
import numpy as np,trimesh,torch
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation
from skimage.measure import marching_cubes
BASE=Path('/workspace/worldstring-general');OLD=Path('/workspace/worldstring-demos/library50-full256-20261029');OUT=Path('/workspace/worldstring-demos/zoo-polish-20261030');OUT.mkdir(exist_ok=True)
sys.path[:0]=[str(BASE/'awr'),str(BASE/'WorldString_data_gen')]
spec=importlib.util.spec_from_file_location('renderer',Path(__file__).with_name('render-library50-media.py'));lib=importlib.util.module_from_spec(spec);spec.loader.exec_module(lib);lib.OUT=OUT
spec=importlib.util.spec_from_file_location('fk',BASE/'viz/general_gallery20/code/rigid_gallery.py');fk=importlib.util.module_from_spec(spec);spec.loader.exec_module(fk)
registry=json.load(open(BASE/'data/rigid100_replacements_20260913_151416/revised100/registry.json'))['objects']
RBO={'book','cardboardbox','globe','laptop','rubikscube','treasurebox','ikea'}
RZ=np.array([[1,0,0],[0,0,-1],[0,1,0]])
def motion(name):
 row=next(r for r in registry if r['object_name']==name);root=Path(row['root']);models=None
 if name in RBO:
  rr,jn,lo,hi,fn,cat=fk.rbo_motion(name)
  if name in ('cardboardbox','book','laptop','ikea'):
   from RBO.mesh_articulation import load_mesh_articulation
   models=load_mesh_articulation(name,BASE/'WorldString_data_gen/RBO/mesh_articulation_spec_v2.json',BASE/'assets/rbo/models_extracted')
  mat=np.array(json.load(open(root/'canonical_transform.json'))['matrix'])
  if models is not None:
   for part in models.part_meshes.values():
    if len(part['faces'])>30000:
     small=trimesh.Trimesh(part['vertices'],part['faces'],process=False).simplify_quadric_decimation(face_count=30000);part['vertices']=small.vertices;part['faces']=small.faces
 else:
  from formal.partnet_mobility_adapter import build_partnet_identity
  num=name.rsplit('_',1)[1];category=name.split('_')[1];snapshot=BASE/'assets/partnet_mobility_selected' if (BASE/'assets/partnet_mobility_selected'/f'{num}.zip').exists() else BASE/'assets/partnet_mobility_rigid100_new41'
  models=build_partnet_identity(num,snapshot,registry={num:category});anchors=json.load(open(root/'keypoint_spec.json'));mat=np.array(json.load(open(root/'canonical_transform.json'))['world_to_canonical']);jn=list(models.joint_order);lo=np.array([models.joint_specs[k].lower for k in jn]);hi=np.array([models.joint_specs[k].upper for k in jn])
  def fn(q):
   transforms=models.part_transforms(dict(zip(jn,map(float,q))));world=np.empty((anchors['keypoint_count'],3))
   for slot in anchors['slots']:
    tr=transforms[slot['part_id']];world[slot['index']]=np.asarray(slot['local_point'])@tr[:3,:3].T+tr[:3,3]
   return fk.canonicalize(world,mat)
 poses=[];states=[]
 for t in np.linspace(0,2*np.pi,12,endpoint=False):
  q=lo+.48*(hi-lo);q[0]+=.43*(hi[0]-lo[0])*np.sin(t);states.append(dict(zip(jn,map(float,q))));poses.append(fn(q))
 return root,np.array(poses),states,models,mat

def cleanup(v,f):
 mesh=trimesh.Trimesh(v,f,process=True);pieces=mesh.split(only_watertight=False);largest=max(p.area for p in pieces);mesh=trimesh.util.concatenate([p for p in pieces if p.area>largest*.0008])
 # Domain-cut boundaries lie on a plane; cap those loops without bridging true openings.
 counts=np.bincount(mesh.edges_unique_inverse);edges=mesh.edges_unique[counts==1];added=0
 if len(edges):
  import networkx as nx
  graph=nx.Graph();graph.add_edges_from(edges.tolist());v=mesh.vertices.tolist();f=mesh.faces.tolist()
  for nodes in nx.connected_components(graph):
   sub=graph.subgraph(nodes)
   if any(deg!=2 for _,deg in sub.degree):continue
   loop=list(nx.dfs_preorder_nodes(sub));pts=np.asarray(v)[loop]
   if len(loop)<3:continue
   _,s,_=np.linalg.svd(pts-pts.mean(0),full_matrices=False)
   if s[-1]>max(s[0],1e-8)*.015:continue
   center=len(v);v.append(pts.mean(0).tolist())
   for a,bb in sub.edges:f.append([a,bb,center]);added+=1
  mesh=trimesh.Trimesh(v,f,process=True);trimesh.repair.fix_normals(mesh,multibody=True)
 trimesh.smoothing.filter_taubin(mesh,lamb=.45,nu=.48,iterations=3)
 return mesh,added

def complete_panels(mesh,models,state,mat,orientation):
 if models is None:return mesh,0
 native=models.transformed_meshes(state);extra=[];added=0
 # Remove unsupported protrusions before filling missing source panel regions.
 support=np.concatenate([fk.canonicalize(part['vertices'],mat)@orientation for part in native.values()]);near=cKDTree(support).query(mesh.vertices,workers=2)[0];keep=np.all(near[mesh.faces]<.025,axis=1);mesh.update_faces(keep);mesh.remove_unreferenced_vertices();tree=cKDTree(mesh.vertices)
 for part in native.values():
  v=fk.canonicalize(part['vertices'],mat)@orientation;f=np.asarray(part['faces']);mid=v[f].mean(1)
  # Fill only source sheet regions absent from the predicted surface.
  distance=tree.query(mid,workers=2)[0];missing=distance>.013
  if missing.any():extra.append(trimesh.Trimesh(v,f[missing],process=False));added+=int(missing.sum())
 return trimesh.util.concatenate([mesh,*extra]) if extra else mesh,added

if __name__=='__main__':
 mode=sys.argv[1];selected=sys.argv[2:]
 if mode=='infer':
  from modeling.rigid_simple import RigidSimpleModel
  from dataset.rigid_sampling_recipe import keypoints_for_model
  torch.set_num_threads(2);ckpath=BASE/'runs/rigid100_revised780k_fast_20260913_165838/train_to_780000/step_780000.pth';ck=torch.load(ckpath,map_location='cpu',weights_only=False);net=RigidSimpleModel(ck['model_config']);net.load_state_dict(ck['model_state_dict']);net.cuda().eval().requires_grad_(False);stats=ck['static_stats'];axis=torch.arange(256,device='cuda').float();queries=torch.stack(torch.meshgrid(axis,axis,axis,indexing='ij'),-1).reshape(-1,3)
 for name in selected:
  dest=OUT/name;dest.mkdir(exist_ok=True);cached=OLD/name;
  if (dest/'complete.json').exists():continue
  states=models=mat=None;orientation=RZ if name in RBO else np.eye(3)
  if name=='partnet_refrigerator_10036':
   from dataset.rigid_sampling_recipe import keypoints_for_model
   root=Path(next(r['root'] for r in registry if r['object_name']==name));fs=sorted((root/'test').glob('*.da'));allkp=np.stack([keypoints_for_model(torch.load(p,map_location='cpu',weights_only=False),ck['config'],str(p)).numpy()/256-.5 for p in fs]);flat=allkp.reshape(len(allkp),-1);_,_,sv=np.linalg.svd(flat-flat.mean(0),full_matrices=False);order=np.argsort((flat-flat.mean(0))@sv[0]);kp=allkp[order[np.linspace(0,len(order)-1,12,dtype=int)]]
  elif name in RBO or name.startswith('partnet'):root,kp,states,models,mat=motion(name)
  if mode=='infer':
   trainfiles=sorted((root/'train').glob('*.da'));train=np.stack([keypoints_for_model(torch.load(p,map_location='cpu',weights_only=False),ck['config'],str(p)).numpy()/256-.5 for p in trainfiles[::max(1,len(trainfiles)//80)][:80]])
   flat=train.reshape(len(train),-1);mean=flat.mean(0);_,_,basis=np.linalg.svd(flat-mean,full_matrices=False);tr=(flat-mean)@basis[:2].T;xy=(kp.reshape(len(kp),-1)-mean)@basis[:2].T;scale=max(np.linalg.norm(tr,axis=1).max(),np.linalg.norm(xy,axis=1).max())*1.05
   meta={'display_trajectory_xy':(xy/scale).tolist(),'display_train_xy':(tr/scale).tolist(),'frame_duration_ms':160};(dest/'plot.json').write_text(json.dumps(meta));oid=stats['objects'].index(name);rows=stats['static_rows'][oid:oid+1].cuda();mask=stats['token_mask'][oid:oid+1].cuda();k=int(mask.sum());seen={}
   for i,kk in enumerate(kp):
    target=dest/f'raw_{i:03d}.npz';key=(kk[:k]+.5)*256;keybytes=key.astype('f4').tobytes()
    if not target.exists() and keybytes in seen:shutil.copy2(seen[keybytes],target)
    if not target.exists():
     key=torch.tensor(key,dtype=torch.float32,device='cuda')[None];length=torch.tensor([k],device='cuda');vals=[]
     with torch.inference_mode(),torch.autocast('cuda',dtype=torch.bfloat16):
      context=net.encode_nodes(key,length,rows,mask)
      for q in queries.split(262144):
       logits=net.decode_queries(q[None],context,key,length)[0].float();vals.append((logits[:,1]-logits[:,0]).cpu().numpy())
     vol=np.pad(np.concatenate(vals).reshape(256,256,256),1,constant_values=-20);v,f,_,_=marching_cubes(vol,0,allow_degenerate=False);v=((v-1)/256-.5)@orientation;np.savez_compressed(target,vertices=v,faces=f)
    seen[keybytes]=target;print('INFER',name,i,flush=True)
  else:
   # Recover original PCA coordinates directly from their inference inputs.
   if name in RBO or name.startswith('partnet'):
    ck=torch.load(BASE/'runs/rigid100_revised780k_fast_20260913_165838/train_to_780000/step_780000.pth',map_location='cpu',weights_only=False)
    from dataset.rigid_sampling_recipe import keypoints_for_model
    fs=sorted((root/'train').glob('*.da'));train=np.stack([keypoints_for_model(torch.load(p,map_location='cpu',weights_only=False),ck['config'],str(p)).numpy()/256-.5 for p in fs[::max(1,len(fs)//60)][:60]])
   else:
    row=next(r for r in registry if r['object_name']==name);root=Path(row['root']);ck=torch.load(BASE/'runs/rigid100_revised780k_fast_20260913_165838/train_to_780000/step_780000.pth',map_location='cpu',weights_only=False)
    from dataset.rigid_sampling_recipe import keypoints_for_model
    fs=sorted((root/'train').glob('*.da'));train=np.stack([keypoints_for_model(torch.load(p,map_location='cpu',weights_only=False),ck['config'],str(p)).numpy()/256-.5 for p in fs[::max(1,len(fs)//60)][:60]])
    fs=sorted((root/'test').glob('*.da'));kp=np.stack([keypoints_for_model(torch.load(p,map_location='cpu',weights_only=False),ck['config'],str(p)).numpy()/256-.5 for p in fs[::max(1,len(fs)//12)][:12]]);flat=kp.reshape(len(kp),-1);_,_,v=np.linalg.svd(flat-flat.mean(0),full_matrices=False);kp=kp[np.argsort((flat-flat.mean(0))@v[0])]
   flat=train.reshape(len(train),-1);mean=flat.mean(0);_,_,basis=np.linalg.svd(flat-mean,full_matrices=False);tr=(flat-mean)@basis[:2].T;xy=(kp.reshape(len(kp),-1)-mean)@basis[:2].T;scale=max(np.linalg.norm(tr,axis=1).max(),np.linalg.norm(xy,axis=1).max())*1.05;meta={'display_trajectory_xy':(xy/scale).tolist(),'display_train_xy':(tr/scale).tolist(),'frame_duration_ms':160}
  logs=[]
  for i in range(12):
   z=np.load(dest/f'raw_{i:03d}.npz' if mode=='infer' else cached/f'surface_{i:03d}.npz');mesh,caps=cleanup(z['vertices'],z['faces']);added=0
   if name in ('cardboardbox','book','laptop','ikea'):mesh,added=complete_panels(mesh,models,states[i],mat,orientation)
   # Correct the source's standing axis, without changing any inference input.
   if name=='globe':mesh.vertices=mesh.vertices@Rotation.from_euler('z',90,degrees=True).as_matrix().T
   np.savez_compressed(dest/f'surface_{i:03d}.npz',vertices=mesh.vertices.astype('f4'),faces=mesh.faces,normals=np.asarray(mesh.vertex_normals,'f4'));logs.append({'index':i,'planar_cap_triangles':caps,'source_completion_triangles':added})
  titles={'ikea':'Writing desk','partnet_refrigerator_10036':'Refrigerator','cardboardbox':'Box','rubikscube':'Rubik’s cube','treasurebox':'Treasure box','allegro_hand_v3':'Allegro','shadow_dexee':'Dexee','anymal_c':'ANYmal','spot_with_arm':'Spot','aloha':'ALOHA','franka_panda':'Panda','kinova_gen3':'Kinova'}
  oldtitle=name.replace('partnet_','').rsplit('_',1)[0].replace('_',' ').title() if name.startswith('partnet_') else name.replace('_',' ').title()
  lib.OBJECTS[name]=(titles.get(name,oldtitle),'#2867AC');lib.render_object(name,meta,np.arange(12),logs)
  (dest/'provenance.json').write_text(json.dumps({'sampling':'held-out source states ordered by keypoint PC1' if name=='partnet_refrigerator_10036' else 'original cached or exact native FK states','surface':'learned occupancy surface with presentation-only cleanup','postprocessing':['tiny-component filtering','planar domain-boundary capping','three Taubin smoothing steps']+(['source-distance pruning of unsupported protrusions','source-mesh patches only where learned thin panels are missing'] if name in ('cardboardbox','book','laptop','ikea') else []),'frames':logs,'source_input':str(cached) if mode!='infer' else str(ckpath)},indent=2))
