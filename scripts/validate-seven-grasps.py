"""Numerical acceptance for the seven local review replays."""
import importlib,itertools,json
import numpy as np
from scipy.spatial.transform import Rotation as R
import mujoco
fit=importlib.import_module('refine-seven-grasps');b=fit.b

def score_replay(data):
    p=data['physics'];k,n=data['hand'],data['object']
    overview=p.get('style')=='duck-overview'
    c=importlib.import_module('duck-overview-loss').Context(k,p['angle'],p['roll']) if overview else fit.Context(k,n,p['angle'],p['roll']);nj=c.n
    # Evaluate the actual named objective in the moving object's coordinates.
    max_self_penetration=0.
    for f in data['frames']:
        c.center=np.array(f[nj+4:nj+7]);c.object_rotation=R.from_quat(f[nj+7:nj+11],scalar_first=True).as_matrix()
        c.d.qpos[c.oa:c.oa+7]=f[nj+4:nj+11];c.quat=np.array(f[nj+12:nj+16])
        residual=c.evaluate(np.r_[f[1:nj+1],f[nj+1:nj+4]])
        max_self_penetration=max(max_self_penetration,c.actual_self_penetration)
        f[nj+16]=round(float(residual@residual),7)
    data['physics']['cross_finger_penetration_m']=max_self_penetration
    data['physics']['cross_finger_checked_frames']=len(data['frames'])
    data['objective']={'name':fit.losses.OBJECTIVES[(k,n)].__name__,
        'source':'scripts/seven-grasp-losses.py',
        'definition':'Sum of squared native digit landing, body contact, mesh penetration, fingertip separation, table/pregrasp clearance and pair-specific joint coordination residuals.',
        'chart':'The same pair-specific objective evaluated along the physical replay in the moving object frame; time is simulation time, not solver iterations.',
        'orientation':'Fixed frontal palm with tail toward arm' if n=='duck' else 'Fixed downward palm and vertical approach' if n=='apple' else 'Side cylindrical wrap of the shared bottle'}
    if overview:
        data['objective'].update(name='overview_cached_wrap',source='scripts/duck-overview-loss.py',
            definition='Shared size-normalized cached finger-pad and palm contact, loose-tip attraction, doubled thumb weighting, probe penetration and contact closure, with overview keypoint retargeting and native mesh/table/finger clearance.',
            chart='The same shared overview-wrap objective evaluated along each physical replay; native collision-geometry queries replace the source neural fields. Time is simulation time, not solver iterations.',
            orientation='Overview wrist orientation: fingers bend horizontally around the body, palm faces the duck; native hand adapter only.')
    return data

def validate(data):
    p=data['physics'];k,n=data['hand'],data['object'];nj=len(data['jointNames']);frames=np.array(data['frames'])
    assert p['success'] and p['contacts_min']>=2
    assert p['lift_min']>=.16 and p['max_penetration']<.0015
    assert p['table_penetration_m']<.0005 and p['tilt_max_deg']<16
    assert p['prelift_drift_m']<.015
    assert p['arm_ik_max_error_m']<.003 and p['arm_surface_clearance_m']>.01
    assert p['arm_orientation_max_error_deg']<1
    assert frames.shape==(400,nj+24) and np.isfinite(frames).all()
    held=frames[frames[:,0]>=5];shake=float(np.ptp(held[:,nj+4]));assert shake>.045
    rotations=R.from_quat(frames[:,nj+12:nj+16],scalar_first=True)
    normal=rotations.apply(np.tile([0,-1,0] if k=='shadow' else [1,0,0],(len(frames),1)))
    direction=float(np.min(-normal[:,0])) if n=='duck' else float(np.min(-normal[:,2])) if n=='apple' else None
    if n=='duck':
        assert direction>.69
        if data.get('objectMesh'):
            native=b.native_duck();assert data['parts']==native['collision']
            assert data['objectGeometry']['yaw_degrees']==180 and data['objectGeometry']['scale']==1
            assert np.allclose(data['objectGeometry']['dimensions_m'],[.125,.09265559911727905,.10257786512374878],atol=1e-10)
        else:assert data['parts'][3]['pos'][0]>0 and data['parts'][2]['pos'][0]<0
        assert frames[0,nj+1]-frames[60,nj+1]>.10
    elif n=='apple':
        assert direction>.999 and frames[0,nj+3]-frames[60,nj+3]>.11
        assert np.linalg.norm(frames[0,nj+1:nj+3]-frames[60,nj+1:nj+3])<.002
    else:
        for other in ['xhand','allegro']:
            assert data['parts']==json.loads((b.OUT/f'{other}-bottle.json').read_text())['parts']
    # Native collision distances across separate fingers, on final/hold frames.
    m,d,h,_,_,_,samples,_=b.build(k,n,angle=p['angle'],roll=p['roll'],style=p['style'])
    adr=[m.jnt_qposadr[m.joint(j).id] for j in data['jointNames']];wa=int(m.jnt_qposadr[m.joint('wrist_free').id]);oa=int(m.jnt_qposadr[m.joint('object_free').id])
    groups={}
    for bid,_ in samples:
        name=m.body(bid).name.lower()
        group=next((x for x in (['thumb','index','mid','ring','pinky'] if k=='xhand' else ['th','ff','mf','rf','lf']) if x in name),None)
        if group:groups.setdefault(group,[]).extend(range(m.body_geomadr[bid],m.body_geomadr[bid]+m.body_geomnum[bid]))
    min_gap=0.
    for f in frames[[0,60,100,145,200,250,300,350,399]]:
        d.qpos[adr]=f[1:nj+1];d.qpos[wa:wa+7]=np.r_[f[nj+1:nj+4],f[nj+12:nj+16]];d.qpos[oa:oa+7]=f[nj+4:nj+11];mujoco.mj_forward(m,d)
        for a,bb in itertools.combinations(groups.values(),2):
            for g,gg in itertools.product(a,bb):
                min_gap=min(min_gap,mujoco.mj_geomDistance(m,d,g,gg,.002,None))
    min_gap=min(min_gap,-p.get('cross_finger_penetration_m',0))
    data['physics'].update(shake_excursion_m=shake,palm_direction_alignment=direction,cross_finger_penetration_m=-min_gap)
    assert -min_gap<.0008, f'{k}/{n}: cross-finger penetration {-min_gap*1000:.3f} mm'
    return {'pair':f'{k}-{n}','lift_min_m':p['lift_min'],'tilt_max_deg':p['tilt_max_deg'],
        'hand_object_penetration_mm':p['max_penetration']*1000,'table_penetration_mm':p['table_penetration_m']*1000,
        'cross_finger_penetration_mm':-min_gap*1000,'palm_direction_alignment':direction,
        'arm_clearance_mm':p['arm_surface_clearance_m']*1000,'shake_excursion_m':shake}

if __name__=='__main__':
    results=[]
    for k,n in fit.losses.OBJECTIVES:
        results.append(validate(json.loads((b.OUT/f'{k}-{n}.json').read_text())))
    print(json.dumps(results,indent=2))
