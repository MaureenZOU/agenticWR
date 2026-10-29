"""Frozen checkpoint reconstructions for 21 additional rigid and three soft assets."""
import os,sys,json,importlib.util,time
from pathlib import Path
import numpy as np,torch,trimesh
from skimage.measure import marching_cubes
BASE=Path('/workspace/worldstring-general');OUT=Path('/workspace/worldstring-demos/library50-sharpa-20261029')
sys.path[:0]=[str(BASE/'awr'),str(BASE/'WorldString_data_gen'),str(BASE/'scripts/ws_deform30_single_episode')]
from modeling.rigid_simple import RigidSimpleModel
from runtime import SingleEpisodeModel
spec=importlib.util.spec_from_file_location('renderlib',Path(__file__).with_name('render-library50-media.py'));lib=importlib.util.module_from_spec(spec);spec.loader.exec_module(lib);lib.OUT=OUT
spec=importlib.util.spec_from_file_location('fk',BASE/'viz/general_gallery20/code/rigid_gallery.py');fk=importlib.util.module_from_spec(spec);spec.loader.exec_module(fk)
RIGID=['book','cardboardbox','globe','laptop','rubikscube','treasurebox','partnet_door_8997','partnet_lamp_16208','partnet_oven_7187','partnet_switch_100935','partnet_toilet_102676','partnet_dishwasher_11622','unitree_go2','unitree_h1','allegro_hand_v3','shadow_dexee','anymal_c','spot_with_arm','aloha','franka_panda','kinova_gen3']
SOFT=['049-ball','097-pillow','188-foam-roll-small']
TITLES={'unitree_go2': 'Go2', 'unitree_h1': 'H1', 'spot_with_arm': 'Spot', 'anymal_c': 'ANYmal', 'aloha': 'ALOHA', 'franka_panda': 'Panda', 'kinova_gen3': 'Kinova', 'shadow_dexee': 'Dexee', 'allegro_hand_v3': 'Allegro', 'book': 'Book', 'cardboardbox': 'Box', 'globe': 'Globe', 'laptop': 'Laptop', 'rubikscube': 'Rubik’s cube', 'treasurebox': 'Treasure box', 'partnet_dishwasher_11622': 'Dishwasher', 'partnet_door_8997': 'Door', 'partnet_lamp_16208': 'Lamp', 'partnet_oven_7187': 'Oven', 'partnet_switch_100935': 'Switch', 'partnet_toilet_102676': 'Toilet', '049-ball': 'Soft ball', '097-pillow': 'Pillow', '188-foam-roll-small': 'Foam roll'}
worker=int(sys.argv[1]);torch.set_num_threads(2)
ckpath=BASE/('runs/rigid100_revised780k_fast_20260913_165838/train_to_780000/step_780000.pth' if worker==0 else 'runs/ws_deform30_single_episode40k_20260919/train/step_040000.pth')
ck=torch.load(ckpath,map_location='cpu',weights_only=False)
if worker==0:
 net=RigidSimpleModel(ck['model_config']);net.load_state_dict(ck['model_state_dict']);stats=ck['static_stats'];registry=json.load(open(BASE/'data/rigid100_replacements_20260913_151416/revised100/registry.json'))['objects']
else:
 net=SingleEpisodeModel(ck['recipe']['model_config']);net.load_state_dict({k.removeprefix('net.'):v for k,v in ck['model_state_dict'].items()});stats=ck
net.cuda().eval().requires_grad_(False)
N=128;axis=torch.arange(N,device='cuda').float()*2;queries=torch.stack(torch.meshgrid(axis,axis,axis,indexing='ij'),-1).reshape(-1,3)
for name in RIGID if worker==0 else SOFT:
 dest=OUT/name;dest.mkdir(exist_ok=True,parents=True)
 if (dest/'complete.json').exists():continue
 if worker==0:
  row=next(r for r in registry if r['object_name']==name);root=Path(row['root']);test=sorted((root/'test').glob('*.da'));trainfiles=sorted((root/'train').glob('*.da'))
  train=np.stack([torch.load(f,map_location='cpu',weights_only=False)['keypoints'].numpy() for f in trainfiles[::max(1,len(trainfiles)//60)][:60]])
  if name in RIGID[:12]:
   rr,jn,lo,hi,fn,category=fk.partnet_motion(name) if name.startswith('partnet') else fk.rbo_motion(name)
   poses=[]
   for active in range(min(2,len(jn))):
    for t in np.linspace(0,2*np.pi,16,endpoint=False):
     q=lo+.48*(hi-lo);q[active]+=.43*(hi[active]-lo[active])*np.sin(t);poses.append(fn(q))
   kp=np.asarray(poses);timeline='Exact native FK, one joint at a time, within original limits'
  else:
   samples=[torch.load(f,map_location='cpu',weights_only=False)['keypoints'].numpy() for f in test[::max(1,len(test)//24)][:24]];kp=np.stack(samples);flat=kp.reshape(len(kp),-1);_,_,v=np.linalg.svd(flat-flat.mean(0),full_matrices=False);order=np.argsort((flat-flat.mean(0))@v[0]);kp=kp[order];timeline='Held-out valid joint states ordered by keypoint PC1; sampled poses, no interpolated geometry'
  oid=stats['objects'].index(name);rows=stats['static_rows'][oid:oid+1].cuda();mask=stats['token_mask'][oid:oid+1].cuda();k=int(mask.sum());kp=kp[:,:k];train=train[:,:k];keys=(kp+.5)*256
  orientation=np.eye(3) if name.startswith('partnet') else np.array([[1,0,0],[0,0,-1],[0,1,0]])
 else:
  root=BASE/'data/ws_deform30_single_episode_20260919'/name;records=json.load(open(root/'split.json'))['records'];ids=[i for i,r in enumerate(records) if r['split']=='test'];times=np.array([records[i]['source_frame'] for i in ids]);chosen=np.unique(np.argmin(abs(times[:,None]-np.linspace(times.min(),times.max(),32)[None]),axis=0));ids=[ids[i] for i in chosen];coords=dict(np.load(root/'rigid_coordinates.npz'))
  keys=[]
  for i in ids:
   z=np.load(root/'frames'/f'{i:06d}.npz');k=int(z['keypoint_count']);keys.append(z['keypoints'][:k])
  keys=np.array(keys);kp=np.array([coords['keypoints_canonical'][i,:k] for i in ids]);train=coords['keypoints_canonical'][[i for i,r in enumerate(records) if r['split']=='train']][:100,:k]
  oid=ck['recipe']['objects'].index(name);rows=ck['static_rows'][oid:oid+1,:k].cuda();mask=ck['token_mask'][oid:oid+1,:k].cuda();timeline='Time-ordered uniformly sampled held-out source frames'
  points=kp.reshape(-1,3);_,_,orientation=np.linalg.svd(points-points.mean(0),full_matrices=False);orientation=orientation.T
  if np.linalg.det(orientation)<0:orientation[:,2]*=-1
 flat=train.reshape(len(train),-1);mean=flat.mean(0);_,_,basis=np.linalg.svd(flat-mean,full_matrices=False);tr=(flat-mean)@basis[:2].T;xy=(kp.reshape(len(kp),-1)-mean)@basis[:2].T;scale=max(np.linalg.norm(tr,axis=1).max(),np.linalg.norm(xy,axis=1).max())*1.05;tr/=scale;xy/=scale
 meta={'display_trajectory_xy':xy.tolist(),'display_train_xy':tr.tolist()};statsout=[]
 for i,key in enumerate(keys):
  target=dest/f'surface_{i:03d}.npz';start=time.monotonic()
  if not target.exists():
   key=torch.tensor(key,dtype=torch.float32,device='cuda')[None];length=torch.tensor([k],device='cuda')
   with torch.inference_mode(),torch.autocast('cuda',dtype=torch.bfloat16):
    context=net.encode_nodes(key,length,rows,mask);vals=[]
    for q in queries.split(65536):
     logits=net.decode_queries(q[None],context,key,length)[0].float();vals.append((logits[:,1]-logits[:,0]).cpu().numpy())
   volume=np.concatenate(vals).reshape((N,)*3);v,f,_,_=marching_cubes(volume,0,gradient_direction='ascent',allow_degenerate=False);v=(v*2+(.5 if worker else 0))/256-.5
   if worker:v=v@coords['rotation'][ids[i]]+coords['translation_normalized'][ids[i]]
   v=v@orientation;mesh=trimesh.Trimesh(v,f,process=False);np.savez_compressed(target,vertices=v.astype('f4'),faces=f,normals=np.asarray(mesh.vertex_normals,'f4'))
  statsout.append({'index':i});print(name,i+1,len(keys),round(time.monotonic()-start,1),flush=True)
 lib.OBJECTS[name]=(TITLES[name],'#B3BED8' if worker==0 else '#E3AEDB');lib.render_object(name,meta,np.arange(len(keys)),statsout)
 (dest/'provenance.json').write_text(json.dumps({'object':name,'checkpoint':str(ckpath),'grid':[N]*3,'sampling':timeline,'frames':len(keys),'coordinates':'native checkpoint voxel256 query coordinates; stride 2','surface':'unmodified frozen occupancy logits, marching cubes zero level'},indent=2))
print('WORKER_COMPLETE',worker,flush=True)
