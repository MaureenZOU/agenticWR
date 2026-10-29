"""Offline MuJoCo review sheet from actual replay frames; no browser needed."""
import sys,json,importlib
from pathlib import Path
import numpy as np,mujoco
import xml.etree.ElementTree as ET
from PIL import Image,ImageDraw
b=importlib.import_module('build-grasp-replays');Q=b.SITE/'.preview/seven-grasps-20261029'

def render(record,path,with_arm=False,reference_view=False):
    p=record['physics'];kind,name=record['hand'],record['object']
    m,d,h,_,_,_,_,xml=b.build(kind,name,scale=p.get('scale',1),angle=p['angle'],roll=p['roll'],style=p.get('style'))
    if with_arm:
        root=ET.fromstring(xml);asset=root.find('asset');world=root.find('worldbody');arm=json.loads((b.SITE/'assets/lab/arm.json').read_text());nodes=[]
        mount=ET.SubElement(world,'body',pos=b.fmt(np.array(arm['mount']['pos'])-record['sceneOffset']),quat=b.fmt(arm['mount']['quat']))
        for i,node in enumerate(arm['bodies']):
            el=ET.SubElement(mount if node['parent']<0 else nodes[node['parent']],'body',name=f'review_arm_{i}',pos=b.fmt(node['pos']),quat=b.fmt(node['quat']));nodes.append(el)
            if 'joint' in node:
                j=arm['joints'][node['joint']];ET.SubElement(el,'joint',name=f"review_arm_j{node['joint']}",axis=b.fmt(j['axis']),pos=b.fmt(j['pivot']),range=b.fmt(j['range']))
            for gi,g in enumerate(node['geoms']):
                mesh=f'review_arm_mesh_{i}_{gi}';ET.SubElement(asset,'mesh',name=mesh,vertex=b.fmt(g['vertices']),face=' '.join(map(str,g['faces'])))
                ET.SubElement(el,'geom',type='mesh',mesh=mesh,pos=b.fmt(g['pos']),quat=b.fmt(g['quat']),contype='0',conaffinity='0',rgba='.72 .75 .78 1')
        m=mujoco.MjModel.from_xml_string(ET.tostring(root,encoding='unicode'));d=mujoco.MjData(m)
    m.vis.global_.offwidth=600;m.vis.global_.offheight=500
    m.vis.headlight.ambient=[.45,.45,.45];m.vis.headlight.diffuse=[.75,.75,.75]
    for g in range(m.ngeom):
        if m.geom_contype[g]==2:m.geom_rgba[g]=[.24,.29,.33,1]
    m.geom_rgba[0]=[.88,.89,.91,1]
    renderer=mujoco.Renderer(m,500,600);cam=mujoco.MjvCamera();cam.distance=1.15 if with_arm else .39;cam.elevation=-18
    adr=[m.jnt_qposadr[m.joint(n).id] for n in record['jointNames']]
    oa=int(m.jnt_qposadr[m.joint('object_free').id]);wa=int(m.jnt_qposadr[m.joint('wrist_free').id]);n=len(adr);imgs=[]
    views=[(0,315),(2.9,315),(6,315),(6,235)] if reference_view else [(0,135),(2.9,135),(6,135),(6,235)]
    for t,az in views:
        f=record['frames'][int(t*50)];d.qpos[adr]=f[1:1+n]
        d.qpos[wa:wa+7]=np.r_[f[n+1:n+4],f[n+12:n+16]]
        d.mocap_pos[0]=f[n+1:n+4];d.mocap_quat[0]=f[n+12:n+16]
        d.qpos[oa:oa+7]=f[n+4:n+11];mujoco.mj_forward(m,d)
        if with_arm:
            for j,q in enumerate(f[n+17:n+24]):d.qpos[m.jnt_qposadr[m.joint(f'review_arm_j{j}').id]]=q
            mujoco.mj_forward(m,d)
        cam.lookat=d.xpos[m.body('object').id]+([.19,.05,.10] if with_arm else [-.015,0,.015] if reference_view else [.025,0,.04]);cam.azimuth=az
        renderer.update_scene(d,camera=cam);im=Image.fromarray(renderer.render())
        ImageDraw.Draw(im).text((15,15),f'{kind} / {name} | t={t}s | view={az}',fill='black');imgs.append(np.asarray(im))
    Image.fromarray(np.concatenate([np.concatenate(imgs[:2],axis=1),np.concatenate(imgs[2:],axis=1)],axis=0)).save(path)
    renderer.close()

if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='--final':
        fit=importlib.import_module('refine-seven-grasps');tiles=[]
        for k,n in fit.losses.OBJECTIVES:
            record=json.loads((b.OUT/f'{k}-{n}.json').read_text());render(record,Q/f'review-{k}-{n}.png');render(record,Q/f'arm-{k}-{n}.png',True)
            detail=Image.open(Q/f'review-{k}-{n}.png').crop((0,500,1200,1000)).resize((960,400))
            tile=Image.new('RGB',(960,430),'white');tile.paste(detail,(0,30));ImageDraw.Draw(tile).text((14,10),f'{k.upper()} / {n.upper()} | held grasp, two viewpoints',fill='black');tiles.append(np.asarray(tile))
        Image.fromarray(np.concatenate(tiles,axis=0)).save(Q/'seven-grasps-review.jpg',quality=92)
        sys.exit(0)
    candidates=json.loads((Q/'fits.json').read_text())
    if len(sys.argv)>1:candidates=json.loads(Path(sys.argv[1]).read_text())
    for k,n in dict.fromkeys((p['hand'],p['object']) for p in candidates):
        vals=[p for p in candidates if (p['hand'],p['object'])==(k,n)];ok=[p for p in vals if p['success']]
        p=min(ok or vals,key=lambda x:x['score'])
        r=b.trial(k,n,p['offset'],scale=p.get('scale',1),custom=p['qtarget'],custom_open=p['qopen'],angle=p['angle'],roll=p['roll'],style=p['style'],close_start=p.get('close_start',1.2),close_end=p.get('close_end',3),record=True)
        r['replay']['selection']=p
        (Q/f'candidate-{k}-{n}.json').write_text(json.dumps(r['replay'],separators=(',',':')))
        render(r['replay'],Q/f'review-{k}-{n}.png');print(k,n,flush=True)
