"""Use object-specific upright, front-facing views for the PartNet gallery."""
from pathlib import Path
import importlib.util,json,sys
import numpy as np,trimesh,torch
from scipy.spatial.transform import Rotation
spec=importlib.util.spec_from_file_location('polish',Path(__file__).with_name('polish-zoo-media.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
from dataset.rigid_sampling_recipe import keypoints_for_model
ck=torch.load(p.BASE/'runs/rigid100_revised780k_fast_20260913_165838/train_to_780000/step_780000.pth',map_location='cpu',weights_only=False)
for name in sys.argv[1:]:
 dest=p.OUT/name;cache=dest/'presentation-source';cache.mkdir(exist_ok=True);mat=p.RZ@(np.eye(3) if name=='partnet_door_8997' else Rotation.from_euler('y',180,degrees=True).as_matrix())
 for i in range(12):
  file=dest/f'surface_{i:03d}.npz';source=cache/file.name
  if not source.exists():source.write_bytes(file.read_bytes())
  z=np.load(source);mesh=trimesh.Trimesh(z['vertices']@mat,z['faces'],process=False)
  if len(mesh.faces)>180000:mesh=mesh.simplify_quadric_decimation(face_count=180000)
  np.savez_compressed(file,vertices=mesh.vertices.astype('f4'),faces=mesh.faces,normals=np.asarray(mesh.vertex_normals,'f4'))
 if (dest/'plot.json').exists():meta=json.load(open(dest/'plot.json'))
 else:
  root,kp,_,_,_=p.motion(name);fs=sorted((root/'train').glob('*.da'));train=np.stack([keypoints_for_model(torch.load(f,map_location='cpu',weights_only=False),ck['config'],str(f)).numpy()/256-.5 for f in fs[::max(1,len(fs)//60)][:60]]);flat=train.reshape(len(train),-1);mean=flat.mean(0);_,_,basis=np.linalg.svd(flat-mean,full_matrices=False);tr=(flat-mean)@basis[:2].T;xy=(kp.reshape(len(kp),-1)-mean)@basis[:2].T;scale=max(np.linalg.norm(tr,axis=1).max(),np.linalg.norm(xy,axis=1).max())*1.05;meta={'display_trajectory_xy':(xy/scale).tolist(),'display_train_xy':(tr/scale).tolist(),'frame_duration_ms':160}
 title=name.split('_')[1].capitalize();p.lib.OBJECTS[name]=(title,'#2867AC');stats=json.load(open(dest/'complete.json'))['frames'];p.lib.render_object(name,meta,np.arange(12),stats);prov=json.load(open(dest/'provenance.json'));prov['presentation_rotation_matrix']=mat.tolist();prov['render_mesh_face_limit']=180000;(dest/'provenance.json').write_text(json.dumps(prov,indent=2))
