"""Close source-matched thin panels and set their intended presentation orientation."""
from pathlib import Path
import importlib.util,json,sys
import numpy as np,trimesh
from scipy.spatial.transform import Rotation
spec=importlib.util.spec_from_file_location('polish',Path(__file__).with_name('polish-zoo-media.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
for name in sys.argv[1:]:
 dest=p.OUT/name
 if name in ('book','cardboardbox','laptop','ikea'):
  root,kp,states,models,mat=p.motion(name)
 else:models=None
 cache=dest/'presentation-source';cache.mkdir(exist_ok=True)
 for i in range(12):
  source=dest/f'surface_{i:03d}.npz';original=cache/source.name
  if not original.exists():original.write_bytes(source.read_bytes())
  z=np.load(original);mesh=trimesh.Trimesh(z['vertices'],z['faces'],process=False)
  if models is not None:
   # These are render-only source panels under the learned shell, completing holes.
   pieces=[]
   for part in models.transformed_meshes(states[i]).values():
    vv=p.fk.canonicalize(part['vertices'],mat)@p.RZ;pieces.append(trimesh.Trimesh(vv,part['faces'],process=False))
   mesh=trimesh.util.concatenate([mesh,*pieces])
  transform=Rotation.from_euler('z',180,degrees=True).as_matrix() if name=='globe' else Rotation.from_euler('x',90 if name=='book' else -90,degrees=True).as_matrix() if name in ('book','laptop','ikea') else Rotation.from_euler('z',90,degrees=True).as_matrix() if name=='partnet_lamp_16208' else np.eye(3)
  mesh.vertices=mesh.vertices@transform.T
  # Limit the render mesh while retaining all inferred and completed surfaces.
  if len(mesh.faces)>180000:mesh=mesh.simplify_quadric_decimation(face_count=180000)
  np.savez_compressed(source,vertices=mesh.vertices.astype('f4'),faces=mesh.faces,normals=np.asarray(mesh.vertex_normals,'f4'))
  print('FINISH',name,i,flush=True)
 # Build the same PCA figure from the inference keypoints.
 if (dest/'plot.json').exists():meta=json.load(open(dest/'plot.json'))
 else:
  from dataset.rigid_sampling_recipe import keypoints_for_model
  import torch
  if models is None:root,kp,_,_,_=p.motion(name)
  ck=torch.load(p.BASE/'runs/rigid100_revised780k_fast_20260913_165838/train_to_780000/step_780000.pth',map_location='cpu',weights_only=False);fs=sorted((root/'train').glob('*.da'));train=np.stack([keypoints_for_model(torch.load(f,map_location='cpu',weights_only=False),ck['config'],str(f)).numpy()/256-.5 for f in fs[::max(1,len(fs)//60)][:60]]);flat=train.reshape(len(train),-1);mean=flat.mean(0);_,_,basis=np.linalg.svd(flat-mean,full_matrices=False);tr=(flat-mean)@basis[:2].T;xy=(kp.reshape(len(kp),-1)-mean)@basis[:2].T;scale=max(np.linalg.norm(tr,axis=1).max(),np.linalg.norm(xy,axis=1).max())*1.05;meta={'display_trajectory_xy':(xy/scale).tolist(),'display_train_xy':(tr/scale).tolist(),'frame_duration_ms':160}
 titles={'book':'Book','cardboardbox':'Box','laptop':'Laptop','ikea':'Writing desk','globe':'Globe','partnet_lamp_16208':'Lamp'};p.lib.OBJECTS[name]=(titles[name],'#2867AC');stats=json.load(open(dest/'complete.json'))['frames'];p.lib.render_object(name,meta,np.arange(12),stats);prov=json.load(open(dest/'provenance.json'));prov['presentation_completion']='original articulated source panels close gaps beneath the learned shell' if models is not None else None;prov['presentation_rotation_matrix']=transform.tolist();prov['render_mesh_face_limit']=180000;(dest/'provenance.json').write_text(json.dumps(prov,indent=2))
