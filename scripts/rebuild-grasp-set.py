"""Rebuild the 15 checked contact replays. Run from the WorldString checkout.
Uses simulator/.venv (MuJoCo, numpy, scipy); the website itself needs no backend.
"""
import importlib,json,concurrent.futures
from pathlib import Path
build=importlib.import_module('build-grasp-replays')
def replay(preset):
 result=build.trial(preset['hand'],preset['object'],preset['offset'],preset['scale'],preset['closure'],record=True,custom=preset['qtarget'],custom_open=preset['qopen'],angle=preset['angle'],roll=preset['roll'],close_start=preset.get('close_start',1.2),close_end=preset.get('close_end',3),style=preset.get('style'))
 if not result['success']:raise RuntimeError(f"Contact validation failed: {result['hand']}/{result['object']}")
 if preset['object'] in ['mug','dumbbell'] and (result['region_contacts_min']<2 or result['wrong_contacts_max']):raise RuntimeError('Grasp must retain the handle or shaft without body/weight support')
 return result.pop('replay')
if __name__=='__main__':
 presets=json.loads(Path(__file__).with_name('grasp-presets.json').read_text())
 with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:results=list(pool.map(replay,presets))
 arm=importlib.import_module('attach-grasp-arm')
 for data in results:
  data=arm.attach(data);n=len(data['jointNames']);held=[f for f in data['frames'] if f[0]>=5]
  excursion=max(f[n+4] for f in held)-min(f[n+4] for f in held)
  if excursion<.045 or data['physics']['arm_ik_max_error_m']>.003 or data['physics']['arm_surface_clearance_m']<.001 or (data['physics'].get('style')!='duck-front' and data['physics']['forward_reach_alignment']<.3):raise RuntimeError('Shake, forward reach, or arm clearance failed')
  data['physics']['shake_excursion_m']=excursion
  path=build.OUT/f"{data['hand']}-{data['object']}.json"
  data['graspStyle']={'mug':'side-facing handle grasp','duck':'forward body grasp','dumbbell':'palm-up shaft grasp','bottle':'side bottle wrap','apple':'forward apple wrap'}[data['object']]
  data['provenance']={'execution':'Offline MuJoCo contact replay. Gravity-driven free object; native finger actuators, dynamic wrist target, no object attachment or pose commands after reset. Arm follows by native IK with table clearance.', 'grasp_selection':'Object-specific forward approach, wrist roll, contact region, pregrasp, finger closure and timing. Cup uses handle-only contact and bounded measured-object wrist compensation during closure. All pairs were physically replayed and checked.', 'geometry':'Cup handle faces sideways; cup and dumbbell proportions retain the accepted native-hand clearance. All bottles use the same geometry.', 'loss':'Sampled hand/object surface distance plus penetration, evaluated along physical execution.', 'scope':'Illustrative static-site contact demonstration. No new GPT API calls, RL training, live neural inference, or hardware validation.'}
  if data['physics'].get('style'):
   check=importlib.import_module('validate-seven-grasps');data=check.score_replay(data);check.validate(data)
   data['graspStyle']={'duck':'frontal palm wrap, tail toward arm','apple':'palm-down top grasp','bottle':'shared bottle cylindrical wrap'}[data['object']]
   data['provenance']['grasp_selection']='Independent hand/object objective, native digit landing regions and joint coordination; physical lift-and-shake validation.'
   data['provenance']['loss']=data['objective']['chart']
   data['optimizationSummary']=next(p['optimizationSummary'] for p in presets if p['hand']==data['hand'] and p['object']==data['object'])
  path.write_text(json.dumps(data,separators=(',',':')))
  print(path.name,'lift',round(data['physics']['lift_min'],3),'m',flush=True)
