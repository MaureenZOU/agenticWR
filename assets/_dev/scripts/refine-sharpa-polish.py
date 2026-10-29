"""Contact-aware approach and enveloping grasp objectives for the two reviewed cases."""
import sys,importlib,json
import numpy as np,mujoco
from scipy.optimize import least_squares
base=importlib.import_module('sharpa-grasp-losses');b=base.b
OUT=b.SITE/'.preview/polish-20261030';OUT.mkdir(exist_ok=True)
PRESETS=json.loads((b.SITE/'assets/lab/sharpa-grasp-presets.json').read_text())
class Refine(base.Context):
 def __init__(self,name,seed):
  p=PRESETS[name];super().__init__(name,p['angle'],p['roll']);self.seed=seed;self.p=p
  if name=='mug':
   self.style='mug-handle';self.angle=[0,-10,10,0][seed%4];self.roll=0
   self.m,self.d,self.h,self.local,self.rot,self.parts,_,_=b.build('sharpa',name,angle=self.angle,roll=self.roll,style=self.style);self.quat=base.R.from_matrix(self.rot).as_quat(scalar_first=True);self.d.qpos[self.oa:self.oa+7]=np.r_[self.center,1,0,0,0]
  self.goal=np.asarray(p['qtarget']);self.offset=np.asarray(p['offset']);self.target=np.array([0,.076,.025] if name=='mug' else [0,0,-.008]);self.w=self.center+self.target-self.rot@(self.local+self.offset)
  if name=='mug':self.w=np.array([.025,.143,.217]);self.goal[:9]=[1.2,0,.4,0,.7,.8,0,.7,.7]
  self.palm=[g for g in range(self.m.ngeom) if self.m.geom_contype[g]==2 and 'palm' in self.m.geom(g).name]
  self.middle=[self.m.geom('right_'+digit+'_MP_fit').id for digit in base.DIGITS[1:]]
 def distances(self,groups,objects):
  return np.array([min(mujoco.mj_geomDistance(self.m,self.d,g,o,.3,None) for g in group for o in objects) for group in groups])
 def extra(self,x):
  q=x[:self.n];self.d.qpos[self.wa:self.wa+7]=np.r_[x[self.n:],self.quat];self.set(q)
  tips=self.d.geom_xpos[self.tipgeoms]-self.center
  native=np.zeros(self.m.ngeom)
  for ct in self.d.contact:
   if self.m.geom_contype[ct.geom1]==2 or self.m.geom_contype[ct.geom2]==2:
    g=ct.geom1 if self.m.geom_contype[ct.geom1]==2 else ct.geom2;native[g]=min(native[g],ct.dist+.00015)
  res=[native*1000,(q-self.goal)*.10]
  sep=np.array([min(0,min(mujoco.mj_geomDistance(self.m,self.d,a,bb,.003,None) for a,bb in ps)-.00025) for ps in self.pairs]);res.append(sep*900)
  full=np.concatenate([pts@self.d.xmat[bid].reshape(3,3).T+self.d.xpos[bid] for bid,pts in self.sparse]);res.append(np.minimum(full[:,2]-.004,0)*500)
  if self.name=='mug':
   height=[.016,.024,.008,.0][self.seed%4];y=.038+.045*np.sqrt(1-((height-.005)/.038)**2)
   targets=np.array([[.0145,y,height],[-.0145,y,height]])
   res.extend([(tips[:2]-targets).ravel()*650,self.distances([[g] for g in self.tipgeoms[:2]],self.og[25:])*150,np.minimum(self.distances(self.groups[:2],self.og[:25])-.008,0)*500,np.minimum(self.distances(self.groups[2:],self.og)-.012,0)*500,(q[9:]-self.goal[9:])*.8])
  return np.concatenate([np.atleast_1d(v) for v in res])
 def fit_closed(self):
  rng=np.random.default_rng(491+self.seed);lo=np.r_[self.bounds[0],[-.15,-.23,.03]];hi=np.r_[self.bounds[1],[.25,.25,.25]]
  x=np.r_[self.goal+rng.normal(0,.07,self.n),self.w]
  x=np.clip(x,lo+1e-5,hi-1e-5)
  if self.name=='mug':
   height=[.016,.024,.008,.0][self.seed%4];y=.038+.045*np.sqrt(1-((height-.005)/.038)**2);targets=np.array([[.0145,y,height],[-.0145,y,height]])
   def tipfit(xx):
    self.d.qpos[self.wa:self.wa+7]=np.r_[xx[self.n:],self.quat];self.set(xx[:self.n]);return np.r_[(self.d.geom_xpos[self.tipgeoms[:2]]-self.center-targets).ravel()*500,(xx[:self.n]-self.goal)*.02]
   x=least_squares(tipfit,x,bounds=(lo,hi),max_nfev=160,diff_step=1e-4).x
  fit=least_squares(self.extra,x,bounds=(lo,hi),max_nfev=250,diff_step=1e-4,ftol=2e-6)
  return fit.x,fit.cost
 def fit_open(self,x):
  q=x[:self.n];w=x[self.n:];self.d.qpos[self.wa:self.wa+7]=np.r_[w,self.quat];self.set(q);target=self.d.geom_xpos[self.tipgeoms[:2]].copy();target[0,0]+=.032;target[1,0]-=.032
  def fun(qo):
   self.set(qo);res=[(self.d.geom_xpos[self.tipgeoms[:2]]-target).ravel()*100,(qo-q)*.08,(qo[9:]-q[9:])*3]
   # Both digits remain outside the handle until symmetric closure.
   for t in [0,.25,.5,.75]:
    self.set(qo*(1-t)+q*t)
    res.append(np.minimum(self.distances(self.groups,self.og)-.002*(1-t),0)*900)
    res.append(np.array([min(0,min(mujoco.mj_geomDistance(self.m,self.d,a,bb,.003,None) for a,bb in ps)-.0002) for ps in self.pairs])*700)
   for a in [0,.015,.03,.05,.08,.12]:
    self.d.qpos[self.wa:self.wa+3]=w+[0,a,.015*a/.13];self.set(qo);res.append(np.minimum(self.distances(self.groups,self.og)-.004,0)*1200)
   self.d.qpos[self.wa:self.wa+3]=w;self.set(qo);return np.concatenate(res)
  result=least_squares(fun,q,bounds=self.bounds,max_nfev=120,diff_step=1e-4,ftol=2e-6)
  return result.x
 def fit_open_duck(self,x):
  q=x[:self.n];w=x[self.n:];approach=-self.rot[:,0]*.11+np.array([0,0,.03]);init=q.copy();init[self.flex]-=.50;init=np.clip(init,*self.bounds)
  def fun(qo):
   res=[(qo-init)*.08]
   for a in [0,.15,.3,.5,.7,1.]:
    self.d.qpos[self.wa:self.wa+7]=np.r_[w+approach*a,self.quat];self.set(qo)
    res.append(np.minimum(self.distances(self.groups,self.og)-.004,0)*1400)
    floor=np.array([mujoco.mj_geomDistance(self.m,self.d,g,0,.03,None) for gg in self.groups for g in gg]);res.append(np.minimum(floor-.003,0)*500)
   self.d.qpos[self.wa:self.wa+7]=np.r_[w,self.quat];self.set(qo)
   res.append(np.array([min(0,min(mujoco.mj_geomDistance(self.m,self.d,a,bb,.003,None) for a,bb in ps)-.0003) for ps in self.pairs])*1000)
   return np.concatenate(res)
  fit=least_squares(fun,init,bounds=self.bounds,max_nfev=180,diff_step=1e-4,ftol=2e-6);return fit.x,approach
 def run(self):
  x,cost=self.fit_closed();q=x[:self.n];w=x[self.n:];offset=self.rot.T@(self.center+self.target-w)-self.local
  if self.name=='mug':qo=self.fit_open(x);approach=[0,.13,.015]
  else:qo,approach=self.fit_open_duck(x)
  results=[]
  for preload in [.015,.04,.07]:
   qc=q.copy();qc[self.flex]+=preload
   if self.name=='mug':qc[9:]=q[9:]
   qc=np.clip(qc,*self.bounds)
   r=b.trial('sharpa',self.name,offset,custom=qc,custom_open=qo,angle=self.angle,roll=self.roll,style=self.style,approach_vector=approach,record=False)
   r.update(fit_cost=cost,seed=self.seed,objective='sharpa_'+self.name+'_approach_and_wrap')
   print(self.name,self.seed,preload,{k:r[k] for k in ['success','lift_min','prelift_drift_m','approach_drift_m','first_contact_seconds','non_tip_contacts_min','max_penetration','self_penetration_m','tilt_max_deg']},flush=True);results.append(r)
  (OUT/f'{self.name}-refined-{self.seed}.json').write_text(json.dumps(results,indent=2))
  return results

class DuckWrap(Refine):
 def __init__(self,seed):
  super().__init__('duck',seed);self.style='duck-overview';self.angle=0;self.roll=-15;self.rot=b.config('sharpa','duck',0,-15,self.style)[2];self.quat=base.R.from_matrix(self.rot).as_quat(scalar_first=True);self.goal=np.array(PRESETS['duck']['qtarget']);self.w=np.array([.055,-.11,.09]);self.targets=np.array(b.duck_reference()['digit_centres_m']);self.targets[:,2]=np.maximum(self.targets[:,2],-.037)
 def setx(self,x):
  self.angle,self.roll=x[-2:];self.rot=b.config('sharpa','duck',self.angle,self.roll,self.style)[2];self.quat=base.R.from_matrix(self.rot).as_quat(scalar_first=True);self.d.qpos[self.wa:self.wa+7]=np.r_[x[22:25],self.quat];self.set(x[:22])
 def first(self,x):
  self.setx(x);return np.r_[(self.d.geom_xpos[self.tipgeoms]-self.center-self.targets).ravel()*120,(x[:22]-self.goal)*.03,x[-2:]*.001]
 def final(self,x):
  self.setx(x);q=x[:22];native=np.zeros(self.m.ngeom)
  for ct in self.d.contact:
   if self.m.geom_contype[ct.geom1]==2 or self.m.geom_contype[ct.geom2]==2:
    g=ct.geom1 if self.m.geom_contype[ct.geom1]==2 else ct.geom2;native[g]=min(native[g],ct.dist+.0002)
  tips=self.d.geom_xpos[self.tipgeoms]-self.center;full=np.concatenate([pts@self.d.xmat[bid].reshape(3,3).T+self.d.xpos[bid] for bid,pts in self.sparse])
  sep=np.array([min(0,min(mujoco.mj_geomDistance(self.m,self.d,a,bb,.003,None) for a,bb in ps)-.0003) for ps in self.pairs]);mid=self.distances([[g] for g in self.middle],self.og)
  return np.r_[(tips-self.targets).ravel()*90,self.distances([[g] for g in self.tipgeoms],self.og)*100,np.maximum(mid-.004,0)*70,np.maximum(self.distances([self.palm],self.og)-.014,0)*90,native*1300,np.minimum(full[:,2]-.004,0)*600,sep*1200,(q-self.goal)*.03,x[-2:]*.001]
 def runfree(self):
  rng=np.random.default_rng(712+self.seed);x=np.r_[self.goal+rng.normal(0,.25,22),self.w+rng.normal(0,.007,3),[-5,-15]];lo=np.r_[self.bounds[0],[-.1,-.23,.04],[-50,-55]];hi=np.r_[self.bounds[1],[.2,.1,.25],[50,35]];x=np.clip(x,lo+1e-5,hi-1e-5)
  x=least_squares(self.first,x,bounds=(lo,hi),max_nfev=180,diff_step=1e-4).x
  fit=least_squares(self.final,x,bounds=(lo,hi),max_nfev=240,diff_step=1e-4,ftol=2e-6);x=fit.x;self.setx(x);q=x[:22];w=x[22:25];offset=self.rot.T@(self.center+self.target-w)-self.local;qo,approach=self.fit_open_duck(x[:25]);out=[]
  for pre in [.01,.04,.08]:
   qc=q.copy();qc[self.flex]+=pre;qc=np.clip(qc,*self.bounds)
   for bal in [None,{'touch_preload':.001,'hold_preload':.04}]:
    r=b.trial('sharpa','duck',offset,custom=qc,custom_open=qo,angle=self.angle,roll=self.roll,style=self.style,approach_vector=approach,contact_balance=bal);r.update(seed=self.seed,fit_cost=fit.cost);out.append(r);print(self.seed,pre,bool(bal),{k:r[k] for k in ['success','prelift_drift_m','tilt_max_deg','non_tip_contacts_min','digit_contact_min','lift_min','self_penetration_m']},flush=True)
  open(f'.preview/polish-20261030/duck-free-{self.seed}.json','w').write(json.dumps(out,indent=2))
def squeeze_handle(context, parameters, amount):
 q=np.array(parameters['qtarget']);w=context.center+context.target-context.rot@(context.local+parameters['offset']);context.d.qpos[context.wa:context.wa+7]=np.r_[w,context.quat];context.set(q);targets=context.d.geom_xpos[context.tipgeoms[:2]].copy();targets[:,0]+=[-amount,amount]
 def residual(x):
  qq=q.copy();qq[:9]=x;context.set(qq)
  return np.r_[(context.d.geom_xpos[context.tipgeoms[:2]]-targets).ravel()*300,(x-q[:9])*.02,np.minimum(context.distances(context.groups[:2],context.og[:25])-.006,0)*600]
 q[:9]=least_squares(residual,q[:9],bounds=context.bounds[:,:9],max_nfev=90,diff_step=1e-4).x
 return b.trial('sharpa','mug',parameters['offset'],custom=q,custom_open=parameters['qopen'],angle=parameters['angle'],roll=parameters['roll'],style=parameters['style'],approach_vector=parameters['approach_vector'])

def work(job):
 name,seed=job
 if name=='duck':return DuckWrap(seed).runfree()
 context=Refine(name,seed);initial=context.run()[0];results=[squeeze_handle(context,initial,a) for a in [.002,.004,.007]]
 (OUT/f'mug-squeeze-{seed}.json').write_text(json.dumps(results,indent=2));return results
if __name__=='__main__':
 import concurrent.futures
 names=sys.argv[1:] or ['mug','duck']
 with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:list(pool.map(work,[(n,s) for n in names for s in range(4)]))
