"""Small physical refinements around the independently optimized grasp poses."""
import argparse,concurrent.futures,importlib,json
import numpy as np
fit=importlib.import_module('refine-seven-grasps');b=fit.b;OUT=fit.OUT

def run(job):
    p,seed,lift=job;k,n=p['hand'],p['object'];rng=np.random.default_rng(9100+seed)
    q=np.array(p['qtarget']);qo=np.array(p['qopen']);off=np.array(p['offset'])
    if seed:
        off+=rng.normal(0,.0018,3)
        delta=rng.normal(0,.035,len(q));q+=delta
        qo+=delta*.5
        # Vary the open aperture without introducing a new grasp family.
        qo=fit.opened(qo,k,rng.uniform(-.10,.08))
    h,_,rot=b.config(k,n,angle=p['angle'],roll=p['roll'],style=p['style']);bounds=np.array([j['range'] for j in h['joints']]).T
    off-=rot.T@np.array([0,0,lift/1000])
    q=np.clip(q,*bounds);qo=np.clip(qo,*bounds)
    if k=='shadow':q[0]=qo[0]=0
    r=b.trial(k,n,off,custom=q,custom_open=qo,angle=p['angle'],roll=p['roll'],style=p['style'],close_start=1.2,close_end=3)
    for key in ['objective','initial_loss','optimized_loss','optimization_evaluations','fit_cost']:r[key]=p[key]
    r['polish_seed']=seed;r['score']=fit.score(r)+r['tilt_max_deg']*.02+r['prelift_drift_m']*8+max(0,r['table_penetration_m']-.0002)*2000
    print(k,n,seed,r['success'],r['lift_min'],r['tilt_max_deg'],r['max_penetration'],flush=True)
    return r

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--pair',default='xhand-duck');p.add_argument('--count',type=int,default=48);p.add_argument('--source',default='duck2.json');p.add_argument('--output');p.add_argument('--lift-wrist-mm',type=float,default=0);a=p.parse_args()
    k,n=a.pair.split('-');rs=json.loads((OUT/a.source).read_text());ok=[r for r in rs if (r['hand'],r['object'])==(k,n) and r['success']]
    seeds=sorted(ok,key=lambda r:r['score'])[:2]
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:results=list(pool.map(run,[(seeds[i%len(seeds)],i,a.lift_wrist_mm) for i in range(a.count)]))
    (OUT/(a.output or f'polish-{k}-{n}.json')).write_text(json.dumps(results,indent=2))
