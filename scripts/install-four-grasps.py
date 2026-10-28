"""Validate and install only the four outstanding pairs, without a Git push."""
import importlib,json
import numpy as np
from scipy.spatial.transform import Rotation as R
fit=importlib.import_module('refine-seven-grasps');b=fit.b;arm=importlib.import_module('attach-grasp-arm')
check=importlib.import_module('validate-seven-grasps');render=importlib.import_module('render-seven-grasps')
OUT=b.SITE/'.preview/four-grasps-20261029'
PAIRS=[('shadow','bottle'),('xhand','duck'),('allegro','duck'),('shadow','duck')]
FIELDS=['hand','object','offset','scale','closure','qtarget','qopen','angle','roll','close_start','close_end','style']

def bottle_sides(data):
    p=data['physics'];c=fit.Context('shadow','bottle',p['angle'],p['roll']);n=c.n;positions=[];contact_groups=[]
    for f in data['frames']:
        if f[0]<3:continue
        c.center=np.asarray(f[n+4:n+7]);c.object_rotation=R.from_quat(f[n+7:n+11],scalar_first=True).as_matrix()
        c.d.qpos[c.wa:c.wa+7]=np.r_[f[n+1:n+4],f[n+12:n+16]];c.d.qpos[c.oa:c.oa+7]=f[n+4:n+11];c.setq(f[1:n+1])
        tips=np.array([p@c.d.xmat[bid].reshape(3,3).T+c.d.xpos[bid]-c.center for bid,p in c.tips])@c.object_rotation
        positions.append(tips[:,1]);active=set()
        for contact in c.d.contact:
            if c.m.geom('object_0').id not in [contact.geom1,contact.geom2]:continue
            for g in [contact.geom1,contact.geom2]:
                name=c.m.body(c.m.geom_bodyid[g]).name
                for digit in ['th','ff','mf','rf','lf']:
                    if f'rh_{digit}' in name:active.add(digit)
        contact_groups.append(active)
    y=np.array(positions)
    assert y[:,0].min()>.005, 'Thumb must remain on the opposite side'
    assert y[:,1:].max()<-.005, 'All four fingertips must remain on the same side'
    margins={'thumb_opposite_side_min_m':float(y[:,0].min()),'four_fingers_same_side_min_m':float(-y[:,1:].max()),
             'finger_order':['thumb','index','middle','ring','little'],
             'minimum_digit_body_contacts':min(map(len,contact_groups)),
             'digits_with_body_contact':sorted(set.union(*contact_groups)),'checked_frames':len(positions)}
    data['physics']['bottle_opposition']=margins
    return margins

if __name__=='__main__':
    presets=json.loads((b.SITE/'scripts/grasp-presets.json').read_text());staged=[];reports=[]
    for k,n in PAIRS:
        data=json.loads((fit.OUT/f'candidate-{k}-{n}.json').read_text());data=arm.attach(data);data=check.score_replay(data)
        report=check.validate(data)
        if n=='bottle':report['opposition']=bottle_sides(data)
        else:report['geometry']=data['objectGeometry']
        selection=data.pop('selection')
        data['optimizationSummary']={key:selection[key] for key in ['objective','initial_loss','optimized_loss','optimization_evaluations','fit_cost']}
        data['graspStyle']='four fingers together, opposing thumb' if n=='bottle' else 'native simulation duck, frontal palm wrap'
        data['provenance']={
            'execution':'Offline MuJoCo free-object contact replay. Native finger actuators and dynamic wrist control; no object attachment or object-pose commands after reset. Native arm IK with table clearance.',
            'grasp_selection':'Independent hand/object objective with complete cross-finger clearance; bottle additionally enforces four fingertips in one half-space and thumb in the opposite half-space.',
            'geometry':'Original simulation duck visual and all 16 collision parts, 125 x 92.6556 x 102.5779 mm, rigid 180-degree yaw only. Bottle geometry remains identical for all hands.',
            'loss':data['objective']['chart'],
            'scope':'Local simulation preview pending visual acceptance. No hardware or benchmark claim.'}
        preset={key:data['physics'][key] for key in FIELDS};preset.update(objective=data['objective']['name'],optimizationSummary=data['optimizationSummary'])
        presets[next(i for i,p in enumerate(presets) if (p['hand'],p['object'])==(k,n))]=preset
        staged.append((b.OUT/f'{k}-{n}.json',data));reports.append(report)
        (OUT/f'validated-{k}-{n}.json').write_text(json.dumps(data,separators=(',',':')))
        print(report,flush=True)
    # Preserve all eleven accepted trajectories byte for byte.
    for path in b.OUT.glob('*.json'):
        if path.stem not in [f'{k}-{n}' for k,n in PAIRS] and (OUT/'before'/path.name).exists():
            assert path.read_bytes()==(OUT/'before'/path.name).read_bytes(),path
    for path,data in staged:path.write_text(json.dumps(data,separators=(',',':')))
    (b.SITE/'scripts/grasp-presets.json').write_text(json.dumps(presets,indent=2)+'\n')
    (OUT/'validation.json').write_text(json.dumps(reports,indent=2)+'\n')
    from PIL import Image,ImageDraw
    tiles=[]
    for path,data in staged:
        key=path.stem;render.render(data,OUT/f'review-{key}.png');render.render(data,OUT/f'arm-{key}.png',True)
        detail=Image.open(OUT/f'review-{key}.png').crop((0,500,1200,1000)).resize((960,400))
        tile=Image.new('RGB',(960,430),'white');tile.paste(detail,(0,30));ImageDraw.Draw(tile).text((14,10),f'{key} | held grasp, two viewpoints',fill='black');tiles.append(np.asarray(tile))
    Image.fromarray(np.concatenate(tiles,axis=0)).save(OUT/'four-grasps-review.jpg',quality=92)
