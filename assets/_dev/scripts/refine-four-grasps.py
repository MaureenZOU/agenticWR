"""Four-pair review iteration: original simulation duck and unilateral bottle wrap."""
import importlib,json,concurrent.futures
import numpy as np
fit=importlib.import_module('refine-seven-grasps');b=fit.b
OUT=b.SITE/'.preview/four-grasps-20261029';OUT.mkdir(exist_ok=True)

def bottle(job):
    p,aperture,preload,timing=job;q=np.array(p['qtarget']);bounds=np.array([j['range'] for j in b.RIGS['shadow']['joints']]).T
    qo=np.clip(fit.opened(q,'shadow',aperture),*bounds);qc=np.clip(q+preload*(q*.7),*bounds);qc[0]=qo[0]=0
    r=b.trial('shadow','bottle',p['offset'],custom=qc,custom_open=qo,angle=p['angle'],roll=p['roll'],style='bottle-wrap',close_start=timing,close_end=3)
    for key in ['seed','objective','initial_loss','optimized_loss','optimization_evaluations','fit_cost']:r[key]=p[key]
    r['score']=fit.score(r)+.02*r['tilt_max_deg']
    print(p['seed'],aperture,preload,timing,r['success'],r['lift_min'],r['prelift_drift_m'],r['tilt_max_deg'],flush=True)
    return r

if __name__=='__main__':
    rows=json.loads((fit.OUT/'bottle-four-side2.json').read_text());seeds=[]
    for p in sorted(rows,key=lambda x:x['fit_cost']):
        if p['seed'] not in [x['seed'] for x in seeds]:seeds.append(p)
    jobs=[(p,ap,pre,t) for p in seeds[:3] for ap in [.2,.4,.6] for pre in [0,.08] for t in [1.2,.8]]
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:rs=list(pool.map(bottle,jobs))
    (OUT/'bottle-approach.json').write_text(json.dumps(rs,indent=2))
