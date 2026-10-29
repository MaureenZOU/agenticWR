"""Retarget the accepted overview wrap and check all three native hands."""
import argparse,concurrent.futures,importlib,json
import numpy as np
from scipy.optimize import least_squares

loss=importlib.import_module('duck-overview-loss');b=loss.b;base=loss.base
OUT=b.SITE/'.preview/duck-overview-final-20261029';OUT.mkdir(exist_ok=True)

def fit(job):
    kind,seed=job;angle=[0,-5,5,0,-10,10][seed%6];roll=[0,0,0,-6,0,0][seed%6]
    c=loss.Context(kind,angle,roll);rng=np.random.default_rng(seed+726)
    w=c.center+np.array(c.reference['wrist_relative'])
    if kind=='allegro':w+=c.rot@np.array([0,0,.075])
    w[2]+=.012
    lower=np.r_[c.bounds[0],[.015,-.17,.018]];upper=np.r_[c.bounds[1],[.15,.08,.14]]
    if kind=='shadow':lower[0]=-.00001;upper[0]=.00001;lower[-1]=.060
    if kind=='allegro':lower[[1,2,3,5,6,7,9,10,11]]=0.02
    x=np.clip(np.r_[c.prior+rng.normal(0,.035,c.n),w+rng.normal(0,.003,3)],lower+1e-6,upper-1e-6)
    initial=float(np.sum(c.evaluate(x)**2))
    result=least_squares(c.evaluate,x,bounds=(lower,upper),max_nfev=90,ftol=3e-6,diff_step=1e-4)
    q=result.x[:c.n];w=result.x[c.n:];offset=c.rot.T@(c.center+np.array([0,0,-.008])-w)-c.local
    rows=[]
    for preload,opening in [(0,.25),(.06,.35),(.12,.45)]:
        qc=q.copy();qc[c.flexion]+=preload;qc=np.clip(qc,*c.bounds)
        qo=np.clip(base.opened(q,kind,opening),*c.bounds)
        r=b.trial(kind,'duck',offset,custom=qc,custom_open=qo,angle=angle,roll=roll,style='duck-overview')
        r.update(seed=seed,fit_cost=float(result.cost),initial_loss=initial,optimized_loss=float(2*result.cost),
            optimization_evaluations=result.nfev,objective='overview_cached_wrap',preload=preload,opening=opening)
        r['score']=base.score(r)+max(0,r['table_penetration_m']-.0003)*2000+max(0,r['max_penetration']-.001)*1500
        rows.append(r)
        print(kind,seed,'preload',preload,'OK',r['success'],'lift',r['lift_min'],'pen',r['max_penetration'],
            'floor',r['table_penetration_m'],'tilt',r['tilt_max_deg'],'fit',round(result.cost,3),flush=True)
    (OUT/f'fit-{kind}-{seed}.json').write_text(json.dumps(rows,indent=2)+'\n')
    return rows

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--hand');p.add_argument('--seeds',type=int,default=6);p.add_argument('--workers',type=int,default=3);a=p.parse_args()
    jobs=[(k,i) for k in ([a.hand] if a.hand else ['xhand','allegro','shadow']) for i in range(a.seeds)]
    with concurrent.futures.ProcessPoolExecutor(max_workers=a.workers) as pool:results=sum(pool.map(fit,jobs),[])
    (OUT/f'fits-{a.hand or "all"}.json').write_text(json.dumps(results,indent=2)+'\n')
