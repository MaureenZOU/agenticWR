"""Retain the unilateral bottle wrap while giving the native arm wrist clearance."""
import importlib,json,concurrent.futures
import numpy as np
from scipy.optimize import least_squares
fit=importlib.import_module('refine-seven-grasps');b=fit.b;Q=b.SITE/'.preview/four-grasps-20261029'

def run(angle):
    data=json.loads((fit.OUT/'candidate-shadow-bottle.json').read_text());p=data['selection'];c=fit.Context('shadow','bottle',angle,0)
    c.open_amount=.6
    q0=np.array(p['qtarget']);qo0=np.array(p['qopen']);w=c.center+[0,0,-.012]-c.rot@(c.local+p['offset']);start=np.r_[q0,w]
    lower=np.r_[np.maximum(c.bounds[0],q0-.3),w-.025];upper=np.r_[np.minimum(c.bounds[1],q0+.3),w+.025];lower[0]=-.00001;upper[0]=.00001
    initial=float(np.sum(c.evaluate(start)**2));res=least_squares(c.evaluate,np.clip(start,lower+1e-8,upper-1e-8),bounds=(lower,upper),max_nfev=100,ftol=1e-7,diff_step=1e-4)
    q=res.x[:c.n];w=res.x[c.n:];off=c.rot.T@(c.center+[0,0,-.012]-w)-c.local;rs=[]
    for aperture in [.4,.6]:
        for preload in [0,.04,.08]:
            qc=np.clip(q+preload*(q*.7),*c.bounds);qo=np.clip(fit.opened(q,'shadow',aperture),*c.bounds);qc[0]=qo[0]=0
            r=b.trial('shadow','bottle',off,custom=qc,custom_open=qo,angle=angle,roll=0,style='bottle-wrap');r.update(objective='shadow_bottle',initial_loss=initial,optimized_loss=float(2*res.cost),optimization_evaluations=res.nfev,fit_cost=float(res.cost));r['score']=fit.score(r)+.02*r['tilt_max_deg'];rs.append(r)
            print(angle,aperture,preload,r['success'],r['lift_min'],r['tilt_max_deg'],r['prelift_drift_m'],flush=True)
    return rs

if __name__=='__main__':
    with concurrent.futures.ProcessPoolExecutor(max_workers=3) as pool:rs=sum(pool.map(run,[-5,-10,-15]),[])
    (Q/'bottle-arm-fit.json').write_text(json.dumps(rs,indent=2))
