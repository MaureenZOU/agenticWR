"""Package verified cached WorldString SDF zero surfaces for the static demo.
Keep native source meshes only for articulation labels/weights, never as the
output surface. Browser dragging transports the cached prediction locally.
"""
from pathlib import Path
import sys,json,struct
import numpy as np
import trimesh
from scipy.spatial import cKDTree
ROOT=Path(__file__).resolve().parents[2];SITE=ROOT/'agenticWR';OUT=SITE/'assets/lab/sdf';OUT.mkdir(exist_ok=True)
sys.path.insert(0,str(ROOT/'reports/representation_page_20261028/python-deps'))
import fast_simplification
cache=ROOT/'simulator/runtime/representations';current=json.loads((cache/'current.json').read_text())['objects'];catalog=json.loads((SITE/'assets/representation/catalog.json').read_text());audit=[]
for source in catalog:
 key=source['id']
 if key not in current:continue
 path=cache/'meshes'/current[key]['mesh_file'];pred=json.loads(path.read_text());assert pred.get('field')=='learned_sdf_zero' and pred['state']==source['state']
 mesh=trimesh.Trimesh(np.array(pred['vertices']),np.array(pred['faces']),process=True);mesh.update_faces(mesh.unique_faces());mesh.update_faces(mesh.nondegenerate_faces());mesh.remove_unreferenced_vertices();before=len(mesh.faces)
 # Remove only tiny detached prediction debris; preserve separate moving parts.
 components=mesh.split(only_watertight=False);kept=[c for c in components if len(c.faces)>=max(20,before*.00008)];removed=sum(len(c.faces) for c in components if c not in kept) if False else before-sum(len(c.faces) for c in kept)
 mesh=trimesh.util.concatenate(kept);holes_before=int(np.sum(np.bincount(mesh.edges_unique_inverse)==1));trimesh.repair.fill_holes(mesh);mesh.fix_normals(multibody=True)
 if len(mesh.faces)>32000:
  v,f=fast_simplification.simplify(mesh.vertices,mesh.faces,target_count=32000,agg=5);mesh=trimesh.Trimesh(v,f,process=True);trimesh.repair.fill_holes(mesh);mesh.fix_normals(multibody=True)
 v=np.asarray(mesh.vertices);f=np.asarray(mesh.faces);raw=(SITE/'assets/representation'/source['geometry']).read_bytes();_,nv,nf,version=struct.unpack('<4sIII',raw[:16]);native=np.frombuffer(raw,dtype='<f4',count=nv*3,offset=16).reshape(-1,3);labels=np.frombuffer(raw,dtype='u1',count=nv*4,offset=16+nv*12+nf*12).reshape(-1,4);weights=np.frombuffer(raw,dtype='<f4',count=nv*4,offset=16+nv*16+nf*12).reshape(-1,4)
 # Nearest source correspondence labels joints on the learned surface.
 _,nn=cKDTree(native).query(v);ids=labels[nn];w=weights[nn]
 payload=struct.pack('<4sIII',b'AWRG',len(v),len(f),1)+v.astype('<f4').tobytes()+f.astype('<u4').tobytes()+ids.tobytes()+w.astype('<f4').tobytes();(OUT/f'{key}.bin').write_bytes(payload)
 audit.append({'id':key,'geometry':f'{key}.bin','checkpoint':pred.get('checkpoint'),'source_cache':str(path.relative_to(ROOT)),'resolution':pred.get('resolution'),'field':pred['field'],'state':pred['state'],'source_surface_processing':pred.get('surface_processing'),'source_faces':before,'display_faces':len(f),'removed_debris_faces':removed,'boundary_edges_before':holes_before,'boundary_edges_after':int(np.sum(np.bincount(mesh.edges_unique_inverse)==1)),'transport':'Native keypoint FK / skinning of this cached learned surface; no live inference.'})
 print(key,'faces',before,'->',len(f),'boundary',audit[-1]['boundary_edges_after'],flush=True)
(OUT/'catalog.json').write_text(json.dumps(audit,indent=2))
