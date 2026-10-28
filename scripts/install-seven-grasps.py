"""Install the selected seven *locally*. This command never commits or pushes."""
import importlib,json
fit=importlib.import_module('refine-seven-grasps');arm=importlib.import_module('attach-grasp-arm')
check=importlib.import_module('validate-seven-grasps');b=fit.b;Q=fit.OUT
FIELDS=['hand','object','offset','scale','closure','qtarget','qopen','angle','roll','close_start','close_end','style']

if __name__=='__main__':
    presets=json.loads((b.SITE/'scripts/grasp-presets.json').read_text());results=[];staged=[]
    for k,n in fit.losses.OBJECTIVES:
        data=json.loads((Q/f'candidate-{k}-{n}.json').read_text());data=arm.attach(data)
        data=check.score_replay(data);result=check.validate(data);results.append(result)
        data['graspStyle']={'duck':'frontal palm wrap, tail toward arm','apple':'palm-down top grasp','bottle':'shared bottle cylindrical wrap'}[n]
        data['provenance']={
            'execution':'Offline MuJoCo free-object contact replay, gravity, bounded native finger actuators, dynamic wrist target. No object attachment or object pose commands after reset. Arm follows with native IK and table-clearance checks.',
            'grasp_selection':'An independent named objective for this hand/object pair, followed by physical lift-and-shake validation. Palm direction is fixed during fitting. Joint coordination and contact regions differ for each pair.',
            'geometry':'The duck is rotated 180 degrees, tail toward the arm. All three ducks use scale 1. The bottle primitives are identical for all three hands; no Shadow-specific reshaping.',
            'loss':data['objective']['chart'],
            'scope':'Illustrative local static-site simulation, pending user visual acceptance; not hardware or benchmark evidence.'}
        selection=data.pop('selection');data['optimizationSummary']={key:selection[key] for key in ['objective','initial_loss','optimized_loss','optimization_evaluations','fit_cost']}
        data['optimizationSummary']['physical_polish_seed']=selection.get('polish_seed')
        preset={key:data['physics'][key] for key in FIELDS};preset['objective']=data['objective']['name'];preset['optimizationSummary']=data['optimizationSummary']
        presets[next(i for i,p in enumerate(presets) if (p['hand'],p['object'])==(k,n))]=preset
        staged.append((b.OUT/f'{k}-{n}.json',data));print(result,flush=True)
    # Install only after all seven complete the acceptance checks.
    for path,data in staged:path.write_text(json.dumps(data,separators=(',',':')))
    (b.SITE/'scripts/grasp-presets.json').write_text(json.dumps(presets,indent=2)+'\n')
    (Q/'validation.json').write_text(json.dumps(results,indent=2)+'\n')
