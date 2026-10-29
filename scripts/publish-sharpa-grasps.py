"""Build chosen Sharpa free-body replays and attach xArm FK/IK trajectories."""
import sys,importlib,json
from pathlib import Path
b=importlib.import_module('build-grasp-replays');arm=importlib.import_module('attach-grasp-arm');review=importlib.import_module('render-seven-grasps');Q=b.SITE/'.preview/library50-sharpa-20261029/grasps'
choices=json.loads((b.SITE/'assets/lab/sharpa-grasp-presets.json').read_text())
if __name__=='__main__':
 for name in sys.argv[1:] or choices:
  p=choices[name];file='assets/lab/sharpa-grasp-presets.json'
  r=b.trial('sharpa',name,p['offset'],custom=p['qtarget'],custom_open=p['qopen'],angle=p['angle'],roll=p['roll'],style=p['style'],close_start=p.get('close_start',1.2),close_end=p.get('close_end',3),approach_vector=p.get('approach_vector'),contact_balance=p.get('contact_balance'),record=True);data=r.pop('replay');assert r['success'],r
  data['selection']={'objective':p.get('objective',f'sharpa_{name}'),'source':file,'parameters':{k:v for k,v in p.items() if k in ['offset','qtarget','qopen','angle','roll','style','close_start','close_end','approach_vector','contact_balance','fit_cost','initial_loss','optimized_loss']}}
  data['physicsModel']={'hand':'Official Sharpa Wave right hand, native 22-DOF kinematics, native collision shapes and mass/inertia','actuation':'bounded position servos; frictional soft-finger contacts'+('; balanced digit contact holds' if p.get('contact_balance') else ''),'object':'gravity-driven free body; no object weld, force or pose following'}
  data=arm.attach(data);(b.OUT/f'sharpa-{name}.json').write_text(json.dumps(data,separators=(',',':')));review.render(data,Q/(name+'-final.png'));review.render(data,Q/(name+'-arm.png'),True);print(name,json.dumps(data['physics']),flush=True)
