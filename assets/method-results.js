// Preserve exported source values and baseline names; apply the project name at display time.
const methodName=name=>name==='∂Oθ (Ours)'?'AWR (Ours)':name;
const display=value=>value==='/'?'—':value.replace('*',' × ');
const table=(caption,headers,rows)=>`<div class="table-scroll" tabindex="0" role="region" aria-label="${caption}"><table><caption>${caption}</caption><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr class="${row.name.includes('Ours')||row.name.includes('(Full)')?'highlight-row':''}"><th scope="row">${methodName(row.name)}</th>${row.values.map(v=>`<td>${display(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const heading=(label,title,copy)=>`<div class="result-heading"><p class="mini-label">${label}</p><h3>${title}</h3><p>${copy}</p></div>`;
function choice(container,label,options,render){
  const controls=document.createElement('div');controls.className='pill-group result-choices';controls.setAttribute('role','group');controls.setAttribute('aria-label',label);
  controls.innerHTML=options.map((name,i)=>`<button class="pill ${i===0?'active':''}" aria-pressed="${i===0}">${name}</button>`).join('');
  const content=document.createElement('div');content.className='result-content';container.append(controls,content);
  const buttons=[...controls.querySelectorAll('button')];
  const select=i=>{buttons.forEach((b,j)=>{b.classList.toggle('active',i===j);b.setAttribute('aria-pressed',String(i===j));});content.innerHTML=render(i);};
  buttons.forEach((button,i)=>button.addEventListener('click',()=>select(i)));select(0);
}
export async function mountMethodResults(){
  const panels=[1,2,3,4].map(i=>document.querySelector(`#method-panel-${i}`));
  try{
    const response=await fetch('assets/research/paper-results.json');if(!response.ok)throw new Error('Paper tables unavailable');const data=await response.json();
    const reconstruction=panels[0];reconstruction.innerHTML=heading('AWR','Reconstruct object geometry','Evaluate AWR occupancy, signed distance, and surface normals across object families.');
    const familyNames=['Rigid','Skinning','SMPL','Soft'],bounds=[[0,8],[8,15],[15,17],[17,26]];
    const protocols=['100 articulated objects · held-out poses','70 skinned objects · unseen identities','SMPL body reconstruction','30 soft objects · held-out poses'];
    choice(reconstruction,'Reconstruction result family',familyNames,i=>table(`${familyNames[i]} · ${protocols[i]}`,['Method','Precision ↑','Recall ↑','F1 ↑','SDF MAE ↓','SDF CD ↓','Normal ↓','Parameters'],data['multi-head-results'].slice(...bounds[i]))+'<p class="table-note">Occupancy: % · SDF: voxels · Normal error: degrees · —: not reported.</p>');
    panels[1].innerHTML=heading('AWR','Which components matter?','Ablate the structural conditioning and supervision stages used to learn AWR geometry.')+'<div class="ablation-grid">'+table('Shape code · 10 rigid objects',['Shape code','Precision ↑','Recall ↑','F1 ↑'],data['shape-code-ablation'])+table('Training stages · 100 rigid objects',['Training stage','Occ. F1 ↑','SDF MAE ↓','Normal ↓'],data['training-stage-ablation'])+'</div><p class="table-note">Occupancy: % · SDF MAE: voxels · Normal error: degrees.</p>';
    panels[2].innerHTML=heading('AWR','Optimize grasps with AWR','Compare grasp quality and convergence on four objects. Success is evaluated in simulation.');
    choice(panels[2],'Grasp optimization result object',['Duck','Piggy bank','Trophy','Apple'],i=>table(['Duck','Piggy bank','Trophy','Apple'][i]+' · simulated grasp optimization',['Method','Loss ↓','Penetration (mm) ↓','Success (%) ↑','Mean steps ↓'],data['policy-results'].map(row=>({name:row.name,values:[...row.values.slice(i*3,i*3+3),row.values[12]]})))+'<p class="table-note">Mean steps: capped convergence steps, averaged equally over all four objects.</p>');
    panels[3].innerHTML=heading('AWR','Evaluate the learned policy','Compare AWR policy grasp success with baselines. Each method has 13 trials per object and placement split.');
    choice(panels[3],'Real robot result split',['Out of distribution','In distribution'],i=>table(i===0?'OOD · outside the 8 × 8 cm training square, within 24 × 24 cm':'ID · inside the 8 × 8 cm training square',['Method','Duck ↑','Piggy bank ↑','Trophy ↑','Apple ↑'],data['real-world-results'].map(row=>({name:row.name,values:row.values.filter((_,j)=>j%2===(i===0?1:0))})))+'<p class="table-note">Success rates in %. ACT and π0.5 use RGB-D observations; AWR and simulator-trained policies use structured motion-capture observations.</p>');
  }catch(error){panels.forEach(panel=>panel.innerHTML='<p>Paper results could not load. Please refresh.</p>');console.error(error);}
}
