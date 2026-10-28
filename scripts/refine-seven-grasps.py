"""Fit the seven requested pairs and validate each in free-object simulation.

Writes candidates only under .preview; publishing is a separate local step.
"""
from pathlib import Path
import argparse,importlib,json,itertools,concurrent.futures
import numpy as np
import mujoco
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation as R

b=importlib.import_module('build-grasp-replays')
losses=importlib.import_module('seven-grasp-losses')
OUT=b.SITE/'.preview/seven-grasps-20261029';OUT.mkdir(exist_ok=True)
TIPS={'xhand':['right_right_hand_thumb_rota_tip','right_right_hand_index_rota_tip','right_right_hand_mid_tip','right_right_hand_ring_tip','right_right_hand_pinky_tip'],
      'allegro':['th_tip','ff_tip','mf_tip','rf_tip'],
      'shadow':['rh_thdistal','rh_ffdistal','rh_mfdistal','rh_rfdistal','rh_lfdistal']}

def opened(q,kind,amount):
    out=q.copy()
    indices={'xhand':[0,2,4,5,6,7,8,9,10,11], 'allegro':[1,2,3,5,6,7,9,10,11,14,15],
             'shadow':[2,3,4,6,7,8,10,11,12,15,16,17,19,22]}[kind]
    out[indices]-=amount
    return out

class Context:
    def __init__(self,kind,name,angle,roll):
        self.kind,self.name=kind,name
        self.style={'duck':'duck-front','apple':'apple-top','bottle':'bottle-wrap'}[name]
        self.m,self.d,self.h,self.local,self.rot,self.parts,samples,_=b.build(kind,name,angle=angle,roll=roll,style=self.style)
        self.n=len(self.h['joints']);self.adr=[self.m.jnt_qposadr[self.m.joint(j['name']).id] for j in self.h['joints']]
        self.wa=int(self.m.jnt_qposadr[self.m.joint('wrist_free').id]);self.oa=int(self.m.jnt_qposadr[self.m.joint('object_free').id])
        self.center=np.array([0.,0.,{'duck':.038,'apple':.035,'bottle':.049}[name]])
        if name=='duck':self.center[2]=.001-min(min(np.asarray(p['vertices']).reshape(-1,3)[:,2]) for p in self.parts)
        self.quat=R.from_matrix(self.rot).as_quat(scalar_first=True)
        self.object_rotation=np.eye(3)
        self.d.qpos[self.oa:self.oa+7]=np.r_[self.center,[1,0,0,0]]
        self.sparse=[(bid,pts[::max(1,len(pts)//16)]) for bid,pts in samples]
        self.tips=[(bid,np.mean(pts,0)) for name in TIPS[kind] for bid,pts in samples if self.m.body(bid).name==name]
        self.tipgeoms=[list(range(self.m.body_geomadr[bid],self.m.body_geomadr[bid]+self.m.body_geomnum[bid])) for bid,_ in self.tips]
        groups={}
        for g in range(self.m.ngeom):
            bn=self.m.body(self.m.geom_bodyid[g]).name.lower()
            group=next((x for x in (['thumb','index','mid','ring','pinky'] if kind=='xhand' else ['th','ff','mf','rf','lf']) if x in bn),None)
            if group:groups.setdefault(group,[]).append(g)
        self.finger_pairs=[list(itertools.product(a,bb)) for a,bb in itertools.combinations(groups.values(),2)]
        self.og=self.m.geom('object_0').id
        self.object_geoms=[self.m.geom(f'object_{i}').id for i in range(len(self.parts))] if name=='duck' else [self.og]
        self.bounds=np.array([j['range'] for j in self.h['joints']]).T
        self.prior=b.initial(self.h,kind)[1]
        if kind=='xhand':self.prior[:3]=[1.15,.55,1.05]
        if kind=='allegro':self.prior[[0,4,8]]=[-.12,0,.12];self.prior[12:]=[1.15,.35,.7,.9]
        if kind=='shadow':self.prior[0]=0;self.prior[[4,8,12,17]]=.65;self.prior[18:]=[.8,.65,0,.35,.8]
        if name=='duck':
            if kind=='xhand':self.prior[:3]=[1.35,1.,.3];self.prior[[4,6,8,10]]=.45
            elif kind=='allegro':self.prior[[1,5,9]]=.5;self.prior[12:]=[1.2,.4,.7,.5]
            else:self.prior[[2,6,10,15]]=.45;self.prior[18:]=[.8,.7,0,.4,.5]
        self.open_amount=.20
        self.finger_clearance=.001 if (kind,name)==('shadow','bottle') else .0003

    def setq(self,q):
        self.d.qpos[self.adr]=q
        mujoco.mj_forward(self.m,self.d)

    def self_clearance(self):
        return [min(0,min(mujoco.mj_geomDistance(self.m,self.d,g,gg,.003,None) for g,gg in pairs)-self.finger_clearance) for pairs in self.finger_pairs]

    def geometry(self,targets,weights):
        m,d=self.m,self.d
        tippts=np.array([p@d.xmat[bid].reshape(3,3).T+d.xpos[bid]-self.center for bid,p in self.tips])@self.object_rotation
        world=np.concatenate([p@d.xmat[bid].reshape(3,3).T+d.xpos[bid] for bid,p in self.sparse])
        ds=b.sdf((world-self.center)@self.object_rotation,self.parts,penetration_only=True)
        native=np.zeros(m.ngeom)
        for c in d.contact:
            if m.geom_contype[c.geom1]==2 or m.geom_contype[c.geom2]==2:
                g=c.geom1 if m.geom_contype[c.geom1]==2 else c.geom2
                native[g]=min(native[g],c.dist+.001)
        contact=[min(mujoco.mj_geomDistance(m,d,g,og,1,None) for g in gs for og in self.object_geoms) for gs in self.tipgeoms]
        selfpen=self.self_clearance()
        self.actual_self_penetration=max(0.,-min(selfpen)-self.finger_clearance)
        # Keep the whole final hand and its pregrasp above the real table.
        qo=np.clip(opened(self.q,self.kind,self.open_amount),*self.bounds)
        self.setq(qo)
        ow=np.concatenate([p@d.xmat[bid].reshape(3,3).T+d.xpos[bid] for bid,p in self.sparse])
        open_selfpen=self.self_clearance()
        self.setq(self.q)
        return np.r_[((tippts-targets)*np.array(weights)[:,None]).ravel()*32,
                     (np.array(contact)+.0006)*180,native*300,np.minimum(ds+.001,0)*90,
                     np.minimum(world[:,2]-.003,0)*160,np.minimum(ow[:,2]-.004,0)*160,
                     np.array(selfpen)*500,np.array(open_selfpen)*500]

    def evaluate(self,x):
        self.q=x[:self.n];self.d.qpos[self.wa:self.wa+7]=np.r_[x[self.n:],self.quat]
        self.setq(self.q)
        return losses.OBJECTIVES[(self.kind,self.name)](self)

    def bottle_opposition(self):
        # All four distal fingers belong to one half-space; thumb to the other.
        tips=np.array([p@self.d.xmat[bid].reshape(3,3).T+self.d.xpos[bid]-self.center for bid,p in self.tips])@self.object_rotation
        return np.r_[np.maximum(tips[1:,1]+.012,0),min(tips[0,1]-.012,0)]*220

def score(r):
    return (max(0,.15-r['lift_min'])*120+max(0,r['max_penetration']-.003)*500
            +max(0,r['table_penetration_m']-.001)*500+max(0,r['tilt_max_deg']-20)*.03
            +r['prelift_drift_m']*20+(0 if r['contacts_min'] else 8)+r.get('fit_cost',0)*.02)

def fit(args):
    kind,name,seed=args
    angles={'duck':[-20,-10,0,10], 'apple':[0,10,-10,0], 'bottle':[0,-10,10,-5]}[name]
    angle=angles[seed%4];roll=0 if name!='bottle' else [-5,0,10,20][seed%4]
    if (kind,name)==('allegro','duck'):angle=[-45,-35,-25,-15][seed%4]
    if (kind,name)==('shadow','bottle'):angle=0;roll=[0,4,-4,8][seed%4]
    c=Context(kind,name,angle,roll);rng=np.random.default_rng(seed+718)
    if name=='duck':w=np.array([.090,0,.19 if kind!='allegro' else .125])
    elif name=='apple':w=np.array([.13 if kind!='allegro' else .065,0,.13])
    else:w=np.array([.10,.060,.047])
    lower=np.r_[c.bounds[0],[-.06,-.12,.065]];upper=np.r_[c.bounds[1],[.24,.14,.25]]
    if kind=='shadow':lower[0]=-.00001;upper[0]=.00001
    if (kind,name)==('shadow','bottle'):
        lower[[2,6,10,15]]=.2;lower[[3,7,11,16,4,8,12,17]]=.15;lower[c.n+2]=.034
    if name=='duck' and kind=='allegro':lower[[1,2,3,5,6,7,9,10,11]]=0.05
    q=c.prior+rng.normal(0,.08,c.n);w+=rng.normal(0,.008,3)
    if seed>=4:q+=.22
    x=np.clip(np.r_[q,w],lower+1e-7,upper-1e-7);history=[]
    initial=float(np.sum(c.evaluate(x)**2))
    result=least_squares(c.evaluate,x,bounds=(lower,upper),max_nfev=100,ftol=2e-6,diff_step=1e-4)
    q=result.x[:c.n];w=result.x[c.n:]
    target=np.array({'duck':[0,0,-.008],'bottle':[0,0,-.012]}.get(name,[0,0,0]))
    offset=c.rot.T@(c.center+target-w)-c.local
    candidates=[]
    for preload,opening in [(0,.20),(.10,.30)]:
        qc=np.clip(q+(q-c.prior*.3)*preload,*c.bounds)
        qo=np.clip(opened(q,kind,opening),*c.bounds)
        r=b.trial(kind,name,offset,custom=qc,custom_open=qo,angle=angle,roll=roll,style=c.style)
        r.update(seed=seed,fit_cost=float(result.cost),objective=losses.OBJECTIVES[(kind,name)].__name__,initial_loss=initial,optimized_loss=float(2*result.cost),optimization_evaluations=result.nfev)
        r['score']=score(r);candidates.append(r)
        print(kind,name,seed,preload,r['success'],'lift',r['lift_min'],'pen',r['max_penetration'],'floor',r['table_penetration_m'],'tilt',r['tilt_max_deg'],'fit',round(result.cost,3),flush=True)
    (OUT/f'fit-{kind}-{name}-{seed}.json').write_text(json.dumps(candidates,indent=2))
    return candidates

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--seeds',type=int,default=12);p.add_argument('--pair');p.add_argument('--object');p.add_argument('--output',default='fits.json');p.add_argument('--workers',type=int,default=4);a=p.parse_args()
    pairs=list(losses.OBJECTIVES)
    if a.pair:pairs=[tuple(a.pair.split('-'))]
    if a.object:pairs=[pair for pair in pairs if pair[1]==a.object]
    jobs=[(k,n,i) for k,n in pairs for i in range(a.seeds)]
    with concurrent.futures.ProcessPoolExecutor(max_workers=a.workers) as pool:results=sum(pool.map(fit,jobs),[])
    (OUT/a.output).write_text(json.dumps(results,indent=2))
