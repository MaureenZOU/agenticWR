"""Export the existing simulation duck at its original metre scale, without edits."""
from pathlib import Path
import argparse,json,xml.etree.ElementTree as ET
import numpy as np,trimesh
from scipy.spatial import ConvexHull

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);a=p.parse_args()
    root=Path(__file__).resolve().parents[1];m=trimesh.load(a.source/'mesh.ply',process=False)
    # Same geometry and scale; turn the duck so its tail faces the arm at +X.
    yaw=np.diag([-1.,-1.,1.]);m.vertices=np.asarray(m.vertices)@yaw.T
    parts=[]
    for path in sorted((a.source/'collision').glob('part_*.obj')):
        c=trimesh.load(path,process=False);c.vertices=np.asarray(c.vertices)@yaw.T;hull=ConvexHull(c.vertices)
        planes=np.unique(np.round(hull.equations,10),axis=0)
        parts.append(dict(type='mesh',vertices=c.vertices.ravel().tolist(),faces=c.faces.ravel().tolist(),planes=planes.tolist(),size=[],pos=[0,0,0],quat=[1,0,0,0],color=[0,0,0,0],visible=False))
    obj=ET.parse(a.source/'scene_template.xml').getroot().find("worldbody/body[@name='object']")
    inertia=dict(obj.find('inertial').attrib)
    inertia['pos']=' '.join(map(str,np.fromstring(inertia['pos'],sep=' ')@yaw.T))
    xx,yy,zz,xy,xz,yz=np.fromstring(inertia['fullinertia'],sep=' ')
    inertia['fullinertia']=' '.join(map(str,[xx,yy,zz,xy,-xz,-yz]))
    data=dict(vertices=m.vertices.ravel().tolist(),faces=m.faces.ravel().tolist(),color=[.96,.70,.10,1],collision=parts,inertial=inertia,
        provenance=dict(source_host='HAO-L40-2',source='/workspace/worldstring-lightning-grasp-20261006/assets/duck',
        visual='mesh.ply',collision='collision/part_000.obj ... part_015.obj',units='metres',scale=1,
        bounds_m=m.bounds.tolist(),dimensions_m=m.extents.tolist(),vertices=len(m.vertices),triangles=len(m.faces),
        orientation='180-degree yaw from the source mesh: beak toward -X, tail toward +X (arm).',yaw_degrees=180,
        processing='Rigid yaw only. No shape change, rescaling, simplification, facial additions, or marker geometry. Original simulation visual and collision meshes.'))
    (root/'assets/lab/duck-native.json').write_text(json.dumps(data,separators=(',',':')))
    print(json.dumps(data['provenance'],indent=2))
