"""Five object-specific Sharpa objectives with native contact, pad and pose constraints."""
import importlib,json,itertools,sys
from pathlib import Path
import numpy as np,mujoco
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation as R
b=importlib.import_module('build-grasp-replays');OUT=b.SITE/'.preview/library50-sharpa-20261029/grasps';OUT.mkdir(exist_ok=True)
DIGITS=['thumb','index','middle','ring','pinky']
class Context:
 def __init__(self,name,angle=0,roll=0):
  self.name=name;self.angle=angle;self.roll=roll;self.style={'apple':'apple-top','duck':'duck-overview','bottle':'bottle-top','mug':'mug-pinch','dumbbell':'dumbbell-top'}[name]
  self.m,self.d,self.h,self.local,self.rot,self.parts,samples,_=b.build('sharpa',name,angle=angle,roll=roll,style=self.style);m=self.m
  self.n=len(self.h['joints']);self.adr=[m.jnt_qposadr[m.joint(j['name']).id] for j in self.h['joints']];self.wa=m.jnt_qposadr[m.joint('wrist_free').id];self.oa=m.jnt_qposadr[m.joint('object_free').id]
  self.center=np.array([0,0,{'mug':.063,'apple':.035,'bottle':.049,'dumbbell':.096,'duck':.001-min(min(np.asarray(p['vertices']).reshape(-1,3)[:,2]) for p in self.parts) if name=='duck' else 0}[name]])
  self.quat=R.from_matrix(self.rot).as_quat(scalar_first=True);self.d.qpos[self.oa:self.oa+7]=np.r_[self.center,1,0,0,0]
  self.bounds=np.array([j['range'] for j in self.h['joints']]).T;self.prior=b.initial(self.h,'sharpa')[1];self.prior[0]=1.4;self.prior[2]=.35;self.prior[4]=.8
  self.flex=np.array([i for i,j in enumerate(self.h['joints']) if '_AA' not in j['name'] and i not in [0,17]])
  self.groups=[[g for g in range(m.ngeom) if m.geom_contype[g]==2 and digit in m.body(m.geom_bodyid[g]).name] for digit in DIGITS]
  self.tipgeoms=[m.geom('right_'+digit+'_fingertip_collision').id for digit in DIGITS]
  self.og=[m.geom('object_'+str(i)).id for i in range(len(self.parts))]
  self.sparse=[(bid,pts[::4]) for bid,pts in samples]
  excluded={frozenset((e['body1'],e['body2'])) for e in self.h.get('contactExclusions',[])}
  self.pairs=[[ (g,gg) for g,gg in itertools.product(a,bb) if frozenset((m.body(m.geom_bodyid[g]).name,m.body(m.geom_bodyid[gg]).name)) not in excluded] for a,bb in itertools.combinations(self.groups,2)]
  self.history=[]
  if name=='mug':
   self.prior[9:]=[1.15,0,1.4,1.05,1.2,0,1.4,1.05,.12,1.2,0,1.4,1.05]
 def set(self,q):self.d.qpos[self.adr]=q;mujoco.mj_forward(self.m,self.d)
 def residual(self,x):
  m,d=self.m,self.d;q=x[:self.n]
  if self.name=='bottle' and len(x)>self.n+3:
   self.angle,self.roll=x[-2:];self.rot=b.config('sharpa',self.name,self.angle,self.roll,self.style)[2];self.quat=R.from_matrix(self.rot).as_quat(scalar_first=True)
  self.d.qpos[self.wa:self.wa+7]=np.r_[x[self.n:self.n+3],self.quat];self.set(q)
  tips=d.geom_xpos[self.tipgeoms]-self.center
  groups=[[g] for g in self.tipgeoms] if self.name!='mug' else [[g] for g in self.tipgeoms[:2]]
  objects=self.og[25:] if self.name=='mug' else self.og[:1] if self.name in ['bottle','dumbbell'] else self.og
  dist=np.array([min(mujoco.mj_geomDistance(m,d,g,o,1,None) for g in gg for o in objects) for gg in groups])
  native=np.zeros(m.ngeom)
  for ct in d.contact:
   if m.geom_contype[ct.geom1]==2 or m.geom_contype[ct.geom2]==2:
    g=ct.geom1 if m.geom_contype[ct.geom1]==2 else ct.geom2;native[g]=min(native[g],ct.dist+.00025)
  full=np.concatenate([pts@d.xmat[bid].reshape(3,3).T+d.xpos[bid] for bid,pts in self.sparse]);mesh=b.sdf(full-self.center,self.parts,penetration_only=True)
  sep=np.array([min(0,min(mujoco.mj_geomDistance(m,d,a,bb,.002,None) for a,bb in ps)-.0002) for ps in self.pairs])
  res=[(dist+.00015)*180,native*650,np.minimum(full[:,2]-.003,0)*250,np.minimum(mesh+.0002,0)*100,sep*700,(q-self.prior)*.14]
  if self.name=='mug':
   targets=np.array([[-.016,.072,.025],[.016,.072,.025]])
   res+=[(tips[:2]-targets).ravel()*42]
   # Every other digit stays curled back and clear of both handle and vessel.
   other=np.array([min(mujoco.mj_geomDistance(m,d,g,o,.05,None) for g in gg for o in self.og) for gg in self.groups[2:]])
   res+=[np.minimum(other-.009,0)*300,(q[9:]-self.prior[9:])*.8]
   wrong=np.array([min(mujoco.mj_geomDistance(m,d,g,o,.03,None) for g in gg for o in self.og[:25]) for gg in self.groups[:2]])
   res+=[np.minimum(wrong-.006,0)*250]
  elif self.name=='bottle':
   targets=np.array([[.034,-.012,.020],[-.019,-.027,.020],[-.033,-.009,.018],[-.030,.012,.019],[-.014,.028,.023]])
   res+=[(tips-targets).ravel()*24,np.maximum(tips[1:,0]+.016,0)*150,np.minimum(tips[0,0]-.016,0)*150]
  elif self.name=='apple':
   targets=np.array([[.040,-.023,.001],[-.025,-.036,-.001],[-.044,-.012,-.002],[-.040,.018,-.001],[-.024,.035,.003]])
   res+=[(tips-targets).ravel()*25]
  elif self.name=='dumbbell':
   targets=np.array([[.025,-.02,0],[-.024,-.035,0],[-.024,-.01,0],[-.024,.015,0],[-.023,.039,0]])
   res+=[(tips-targets).ravel()*30]
  else:
   targets=np.array(b.duck_reference()['digit_centres_m']);targets[:,2]=np.maximum(targets[:,2],-.036)
   res+=[(tips-targets).ravel()*24,np.maximum(np.abs(b.sdf(tips,self.parts))-.018,0)*30]
  if self.name=='bottle':
   qo=q.copy();qo[self.flex]-=.22;self.set(np.clip(qo,*self.bounds))
   ow=np.concatenate([pts@d.xmat[bid].reshape(3,3).T+d.xpos[bid] for bid,pts in self.sparse]);res.append(np.minimum(ow[:,2]-.004,0)*350)
   res.append(np.array([min(0,min(mujoco.mj_geomDistance(m,d,a,bb,.002,None) for a,bb in ps)-.0002) for ps in self.pairs])*700);self.set(q)
  return np.concatenate([np.atleast_1d(v) for v in res])
 def fit(self,seed=0):
  rng=np.random.default_rng(seed+417);target=np.array({'mug':[0,.076,.025],'bottle':[0,0,-.012],'duck':[0,0,-.008]}.get(self.name,[0,0,0]));w=self.center+target-self.rot@self.local
  if self.name in ('apple','dumbbell'):w[2]=self.center[2]+.10
  if self.name=='bottle':w[0]=.10;w[2]=.15;self.prior[:5]=[1.0,-.3,.45,-.22,1.1];self.prior[[5,9,13,18]]=.75;self.prior[[7,11,15,20]]=.45;self.prior[[8,12,16,21]]=.5
  lo=np.r_[self.bounds[0],[-.20,-.18,.028]];hi=np.r_[self.bounds[1],[.26,.25,.32]]
  q=self.prior+rng.normal(0,.08,self.n);x=np.clip(np.r_[q,w+rng.normal(0,.004,3)],lo+1e-6,hi-1e-6);initial=0
  if self.name=='bottle':lo=np.r_[lo,-30,-1];hi=np.r_[hi,30,1];x=np.r_[x,self.angle,0]
  initial=np.sum(self.residual(x)**2)
  fit=least_squares(self.residual,x,bounds=(lo,hi),max_nfev=120,ftol=4e-6,diff_step=2e-4)
  q,w=fit.x[:self.n],fit.x[self.n:self.n+3];self.residual(fit.x);offset=self.rot.T@(self.center+target-w)-self.local
  candidates=[]
  for preload,opening in ([(0,.18),(.05,.22),(.10,.25)] if self.name=='bottle' else [(.03,.65),(.08,.85),(.15,1.05)]):
   qc=q.copy();qc[self.flex]+=preload;qc=np.clip(qc,*self.bounds);qo=q.copy();qo[self.flex]-=opening
   if self.name=='mug':qc[9:]=q[9:];qo[9:]=q[9:]
   qo=np.clip(qo,*self.bounds)
   r=b.trial('sharpa',self.name,offset,custom=qc,custom_open=qo,angle=self.angle,roll=self.roll,style=self.style)
   r.update(seed=seed,fit_cost=float(fit.cost),initial_loss=float(initial),optimized_loss=float(2*fit.cost),objective='sharpa_'+self.name,optimization_evaluations=fit.nfev)
   candidates.append(r);print(self.name,seed,preload,r['success'],'lift',r['lift_min'],'pen',r['max_penetration'],'floor',r['table_penetration_m'],'tilt',r['tilt_max_deg'],'cost',round(fit.cost,2),flush=True)
  (OUT/f'{self.name}-{seed}.json').write_text(json.dumps(candidates,indent=2));return candidates
def work(job):
 name,seed=job;angle=[0,-10,10,0,0,-15,15,0][seed];roll=[0,0,0,8,-8,0,0,0][seed] if name!='mug' else [0,-12,12,0,0,-6,6,0][seed];return Context(name,angle,roll).fit(seed)

if __name__=='__main__':
 import concurrent.futures
 names=sys.argv[1:] or ['mug','apple','bottle','duck','dumbbell']
 jobs=[(name,seed) for name in names for seed in range(8)]
 with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:list(pool.map(work,jobs))
