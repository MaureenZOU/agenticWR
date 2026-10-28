"""Stage, validate and install only the three overview-style duck replays.

No commit or publishing action is performed by this script.
"""
import argparse,concurrent.futures,importlib,json
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation as R

fit=importlib.import_module('refine-overview-ducks');b=fit.b;OUT=fit.OUT
KINDS=['xhand','allegro','shadow']
FIELDS=['hand','object','offset','scale','closure','qtarget','qopen','angle','roll','close_start','close_end','style']

def stage(p):
    kind=p['hand'];r=b.trial(kind,'duck',p['offset'],custom=p['qtarget'],custom_open=p['qopen'],
        angle=p['angle'],roll=p['roll'],style=p['style'],record=True)
    data=r.pop('replay');data['optimizationSummary']={f:p[f] for f in ['objective','initial_loss','optimized_loss','optimization_evaluations','fit_cost']}
    data=importlib.import_module('attach-grasp-arm').attach(data)
    check=importlib.import_module('validate-seven-grasps');data=check.score_replay(data)
    (OUT/f'candidate-{kind}-duck.json').write_text(json.dumps(data,separators=(',',':')))
    render=importlib.import_module('render-seven-grasps');render.render(data,OUT/f'review-{kind}-duck.png');render.render(data,OUT/f'arm-{kind}-duck.png',True)
    render.render(data,OUT/f'reference-view-{kind}.png',reference_view=True)
    try:report=check.validate(data)
    except AssertionError as e:
        print(kind,'VALIDATION FAILED',str(e),data['physics'],flush=True);raise
    n=len(data['jointNames']);held=np.array([f for f in data['frames'] if f[0]>=3])
    rot=R.from_quat(held[:,n+12:n+16],scalar_first=True)
    if kind=='shadow':rot=rot*R.from_euler('z',-np.pi/2)
    ref=R.from_matrix(b.duck_reference()['rotation'])
    error=np.rad2deg((ref.inv()*rot).magnitude())
    assert error.max()<12,'Keep the original overview wrist orientation'
    report['overview_orientation_max_error_deg']=float(error.max())
    data['physics']['overview_orientation_max_error_deg']=float(error.max())
    data['graspStyle']='overview reference: horizontal finger wrap with opposing thumb'
    data['graspReference']={'asset':'duck-grasp-reference.json',**b.duck_reference()['source']}
    data['provenance']={
        'execution':'Offline MuJoCo free-object contact replay; bounded native hand actuators and dynamic wrist target. No object attachment or object commands after reset. Arm follows by IK.',
        'grasp_selection':'All three hands retarget the same final accepted overview pose and use scripts/duck-overview-loss.py. Initial wrist orientation and pregrasp change to match that pose.',
        'loss':data['objective']['chart'],
        'geometry':'Original simulation duck at scale 1, with the existing 180-degree yaw, unchanged native hand meshes.',
        'scope':'Illustrative simulation replay. Neither live neural-field inference nor an arm-dynamics/hardware validation.'}
    (OUT/f'validated-{kind}-duck.json').write_text(json.dumps(data,separators=(',',':')))
    (OUT/f'validation-{kind}.json').write_text(json.dumps(report,indent=2)+'\n')
    print(report,flush=True)
    return report

def install():
    for path in b.OUT.glob('*.json'):
        if path.stem not in [f'{k}-duck' for k in KINDS]:
            assert path.read_bytes()==(OUT/'before'/path.name).read_bytes(),path
    presets=json.loads((b.SITE/'scripts/grasp-presets.json').read_text());reports=[]
    for kind in KINDS:
        data=json.loads((OUT/f'validated-{kind}-duck.json').read_text())
        report=json.loads((OUT/f'validation-{kind}.json').read_text());reports.append(report)
        (b.OUT/f'{kind}-duck.json').write_text(json.dumps(data,separators=(',',':')))
        p={f:data['physics'][f] for f in FIELDS};p.update(objective='overview_cached_wrap',optimizationSummary=data['optimizationSummary'])
        presets[next(i for i,p in enumerate(presets) if (p['hand'],p['object'])==(kind,'duck'))]=p
    (b.SITE/'scripts/grasp-presets.json').write_text(json.dumps(presets,indent=2)+'\n')
    (OUT/'validation.json').write_text(json.dumps(reports,indent=2)+'\n')
    from PIL import Image,ImageDraw
    tiles=[]
    for kind in KINDS:
        im=Image.open(OUT/f'reference-view-{kind}.png').crop((0,500,1200,1000)).resize((960,400))
        tile=Image.new('RGB',(960,430),'white');tile.paste(im,(0,30));ImageDraw.Draw(tile).text((15,10),f'{kind} | overview-style wrap, two viewpoints',fill='black');tiles.append(np.asarray(tile))
    Image.fromarray(np.concatenate(tiles,axis=0)).save(OUT/'three-ducks-review.jpg',quality=94)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--install',action='store_true');p.add_argument('--hand');a=p.parse_args()
    if a.install:install()
    else:
        rows=json.loads((OUT/'fits-all.json').read_text());selected=[]
        for k in ([a.hand] if a.hand else KINDS):
            good=[p for p in rows if p['hand']==k and p['success'] and p['lift_min']>.16 and p['max_penetration']<.0015 and p['table_penetration_m']<.0005 and p['tilt_max_deg']<16]
            selected.append(min(good,key=lambda p:p['score']))
        (OUT/'selection.json').write_text(json.dumps(selected,indent=2)+'\n')
        with concurrent.futures.ProcessPoolExecutor(max_workers=3) as pool:list(pool.map(stage,selected))
