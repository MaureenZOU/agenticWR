"""Re-solve Shadow's two wraps with complete cross-finger mesh separation."""
import importlib,json,concurrent.futures
import numpy as np
from scipy.optimize import least_squares
fit=importlib.import_module('refine-seven-grasps');b=fit.b;OUT=fit.OUT

def run(name):
    data=json.loads((OUT/f'candidate-shadow-{name}.json').read_text());p=data['selection'];c=fit.Context('shadow',name,p['angle'],p['roll'])
    q0=np.array(p['qtarget']);qo0=np.array(p['qopen']);target=np.array([0,0,-.008 if name=='duck' else -.012]);w=c.center+target-c.rot@(c.local+p['offset']);start=np.r_[q0,w]
    lower=np.r_[np.maximum(c.bounds[0],q0-.38),w-.008];upper=np.r_[np.minimum(c.bounds[1],q0+.38),w+.008];lower[0]=-.00001;upper[0]=.00001
    initial=float(np.sum(c.evaluate(start)**2));res=least_squares(c.evaluate,np.clip(start,lower+1e-8,upper-1e-8),bounds=(lower,upper),max_nfev=100,ftol=1e-7,diff_step=1e-4)
    q=res.x[:c.n];w=res.x[c.n:];off=c.rot.T@(c.center+target-w)-c.local;rs=[]
    for preload in [0,.035,.07]:
        for aperture in [0,.05,.12]:
            qc=np.clip(q+preload*(q-c.prior*.3),*c.bounds);qo=np.clip(fit.opened(qo0+(q-q0),c.kind,aperture),*c.bounds)
            r=b.trial('shadow',name,off,custom=qc,custom_open=qo,angle=p['angle'],roll=p['roll'],style=p['style']);r.update(objective=fit.losses.OBJECTIVES[('shadow',name)].__name__,initial_loss=initial,optimized_loss=float(2*res.cost),optimization_evaluations=res.nfev,fit_cost=float(res.cost));r['score']=fit.score(r)+.015*r['tilt_max_deg'];rs.append(r)
            print(name,preload,aperture,r['success'],r['lift_min'],r['tilt_max_deg'],res.cost,flush=True)
    (OUT/f'clearance-shadow-{name}.json').write_text(json.dumps(rs))

if __name__=='__main__':
    with concurrent.futures.ProcessPoolExecutor(max_workers=2) as pool:list(pool.map(run,['duck','bottle']))
