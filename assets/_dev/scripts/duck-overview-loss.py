"""One overview-derived wrap objective shared by all three native hands.

The reference is the final accepted cached_fk432_restored_loose_v1 pose in
the homepage movie. Its detached XHand probes, pose and weight constants are
preserved. Other hands use native link-surface probes with the same normalized
pad/palm/loose-tip/penetration/closure formulas and doubled thumb weighting.
Distances here come from native collision geometry, not the original neural
fields. A reference-keypoint term preserves the requested pose family; table,
full-link and inter-finger clearance make that pose executable on the table.
"""
import importlib
import numpy as np
import mujoco
from scipy.spatial.transform import Rotation as R

base=importlib.import_module('refine-seven-grasps');b=base.b

def huber_residual(x,beta):
    a=np.abs(x)
    return np.sign(x)*np.sqrt(np.where(a<beta,.5*a*a/beta,a-.5*beta))

class Context(base.Context):
    def __init__(self,kind,angle=0,roll=0):
        super().__init__(kind,'duck',angle,roll,style='duck-overview')
        self.reference=b.duck_reference();ref=self.reference
        self.size=ref['characteristic_size_m'];self.clearance=ref['clearance_fraction'];self.open_amount=.35
        self.finger_clearance=.0005
        self.targets=np.asarray(ref['digit_centres_m'])[[0,1,2,4] if kind=='allegro' else [0,1,2,3,4]].copy()
        # Retarget to the same body bands, above the supporting table.
        self.targets[:,2]=np.maximum(self.targets[:,2],-.039)
        self.probes=[];self.thumb=[]
        if kind=='xhand':
            self.prior=np.array(ref['qtarget'])
            cp=ref['cached_probes']
            for i,(name,p) in enumerate(zip(cp['bodies'],cp['local_offsets_m'])):
                self.probes.append((self.m.body(name).id,np.array(p)))
                self.thumb.append(i in cp['thumb_indices'])
            self.pad_count=20
        else:
            # Two surface pads per phalanx, rigidly transported by native FK.
            normal=np.array([1,0,0]) if kind=='allegro' else np.array([0,-1,0])
            for body in self.h['bodies'][1:]:
                name=body['name']
                if not any(x in name for x in ['proximal','medial','middle','distal']):continue
                points=[]
                for g in body['geoms']:
                    points.extend(R.from_quat(g['quat'],scalar_first=True).apply(np.array(g['vertices']).reshape(-1,3))+g['pos'])
                if not points:continue
                points=np.asarray(points);lo,hi=points.min(0),points.max(0)
                inward=points@normal;cross_axis=1 if kind=='allegro' else 0
                # Select the inward half of the actual link surface.
                candidates=points[inward>=np.quantile(inward,.65)]
                for f in [.35,.70]:
                    z=lo[2]+(hi[2]-lo[2])*f
                    score=(candidates[:,2]-z)**2+(candidates[:,cross_axis]-(lo[cross_axis]+hi[cross_axis])/2)**2
                    self.probes.append((self.m.body(name).id,candidates[np.argmin(score)]));self.thumb.append('th' in name)
            self.pad_count=len(self.probes)
            palm=self.h['bodies'][0];pts=[]
            for g in palm['geoms']:pts.extend(R.from_quat(g['quat'],scalar_first=True).apply(np.array(g['vertices']).reshape(-1,3))+g['pos'])
            pts=np.asarray(pts);front=pts[pts@normal>=np.quantile(pts@normal,.80)]
            for f in [.45,.65,.82]:
                goal=(front.min(0)+front.max(0))/2;goal[2]=np.quantile(front[:,2],f)
                self.probes.append((self.m.body(palm['name']).id,front[np.argmin(np.sum((front-goal)**2,axis=1))]));self.thumb.append(False)
            if kind=='allegro':
                self.prior[:12]=[0,.95,.65,.65,0,.90,.55,.65,0,.95,.70,.75]
                self.prior[12:]=[1.2,.4,.5,.65]
            else:
                self.prior[[2,6,10,15]]=[1.10,.90,.80,.90]
                self.prior[[3,7,11,16]]=[.55,.35,.6,.75]
                self.prior[[4,8,12,17]]=[.55,.45,.6,.75]
                self.prior[18:]=[.75,.7,0,.25,.35]
        self.thumb=np.array(self.thumb,dtype=bool)
        self.open_reference=b.initial(self.h,kind)[0]
        if kind=='xhand':self.open_reference=np.array(ref['qopen'])
        self.flexion=np.array({'xhand':[0,1,2,4,5,6,7,8,9,10,11],
            'allegro':[1,2,3,5,6,7,9,10,11,13,14,15],
            'shadow':[2,3,4,6,7,8,10,11,12,15,16,17,19,21,22]}[kind])
        # Source FLEXION excludes the thumb's opposition swivel.
        self.closure_flexion=self.flexion[self.flexion!=0] if kind=='xhand' else self.flexion
        self.q=self.prior.copy()

    def positions(self,points):
        return np.array([p@self.d.xmat[bid].reshape(3,3).T+self.d.xpos[bid] for bid,p in points])

    def evaluate(self,x):
        self.q=np.asarray(x[:self.n]);self.d.qpos[self.wa:self.wa+7]=np.r_[x[self.n:],self.quat];self.setq(self.q)
        return self.residual()

    def residual(self):
        world=self.positions(self.probes);tips=self.positions(self.tips)
        distance=b.sdf((np.r_[world,tips]-self.center)@self.object_rotation,self.parts)/self.size
        probe=distance[:len(world)];tip=distance[len(world):]
        pad=probe[:self.pad_count];palm=probe[self.pad_count:]
        weight=1+self.thumb[:self.pad_count].astype(float)
        tip_weight=np.ones(len(tip));tip_weight[0]=2
        fraction=(self.q-self.bounds[0])/(self.bounds[1]-self.bounds[0])
        # Restored loose-tip loss: no requirement to force every tip into the duck.
        loose=huber_residual(np.maximum(tip-.10,0),.12)*np.sqrt(3*tip_weight/len(tip))
        pad_contact=huber_residual(np.maximum(pad-self.clearance-.015,0),.10)*np.sqrt(60*weight/self.pad_count)
        palm_contact=huber_residual(np.maximum(palm-self.clearance-.030,0),.10)*np.sqrt(12/len(palm))
        penetration=np.minimum(probe-self.clearance,0)*np.sqrt(900/len(probe))
        closure=np.maximum(.80-fraction[self.closure_flexion],0)*np.sqrt(.5/len(self.closure_flexion))
        extreme=np.maximum(fraction-.94,0)*np.sqrt(8/self.n)
        anchor=(self.q-self.open_reference)/(self.bounds[1]-self.bounds[0])*np.sqrt(.02/self.n)
        # Same semantic digit regions as the overview, retargeted by digit identity.
        landing=(((tips-self.center)@self.object_rotation-self.targets)/self.size).ravel()*np.sqrt(6/len(tips))
        pose=(self.q-self.prior)*.22
        full=np.concatenate([pts@self.d.xmat[bid].reshape(3,3).T+self.d.xpos[bid] for bid,pts in self.sparse])
        mesh_pen=b.sdf((full-self.center)@self.object_rotation,self.parts,penetration_only=True)
        native=np.zeros(self.m.ngeom)
        for c in self.d.contact:
            if self.m.geom_contype[c.geom1]==2 or self.m.geom_contype[c.geom2]==2:
                g=c.geom1 if self.m.geom_contype[c.geom1]==2 else c.geom2
                native[g]=min(native[g],c.dist+.0003)
        separation=self.self_clearance();self.actual_self_penetration=max(0.,-min(separation)-self.finger_clearance)
        # Closure preload must be feasible too; never let dynamics force
        # crossing fingers merely because the un-preloaded fit was clear.
        preloaded=self.q.copy();preloaded[self.flexion]+=.12
        self.setq(np.clip(preloaded,*self.bounds));preload_sep=self.self_clearance();self.setq(self.q)
        qo=np.clip(base.opened(self.q,self.kind,self.open_amount),*self.bounds);self.setq(qo)
        pre=np.concatenate([pts@self.d.xmat[bid].reshape(3,3).T+self.d.xpos[bid] for bid,pts in self.sparse]);open_sep=self.self_clearance();self.setq(self.q)
        safety=np.r_[np.minimum(mesh_pen+.0003,0)*150,native*500,
            np.minimum(full[:,2]-.003,0)*260,np.minimum(pre[:,2]-.004,0)*260,
            np.array(separation)*900,np.array(open_sep)*900,np.array(preload_sep)*900]
        self.components={name:float(v@v) for name,v in dict(loose_tip=loose,finger_pad=pad_contact,palm=palm_contact,
            probe_penetration=penetration,closure=closure,reference_landing=landing,safety=safety).items()}
        return np.r_[loose,pad_contact,palm_contact,penetration,closure,extreme,anchor,landing,pose,safety]
