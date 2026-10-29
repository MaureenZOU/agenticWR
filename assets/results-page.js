const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const table=(caption,headers,rows)=>`<div class="table-scroll" role="region" tabindex="0" aria-label="${esc(caption)}"><table><caption>${caption}</caption><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr class="${r.name.includes('Ours')||r.name.includes('(Full)')?'highlight-row':''}"><th scope="row">${esc(r.name)}</th>${r.values.map(v=>`<td>${v==='/'?'—':esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
export async function mountResults(){
 const root = document.querySelector('#detailed-results');
 const families = [{name:'Articulated',bounds:[0,8],protocol:'100 articulated objects'},{name:'Skinning',bounds:[8,15],protocol:'70 skinned objects'},{name:'SMPL',bounds:[15,17],protocol:'Human body reconstruction'},{name:'Soft',bounds:[17,26],protocol:'30 soft objects'}];
 try {
  const response = await fetch('assets/research/paper-results.json');
  if (!response.ok) throw new Error('Paper results could not load');
  mountDetailedTables(root, await response.json(), families);
 } catch (error) {
  root.innerHTML = '<p role="alert">Results could not load. Please refresh.</p>';
  console.error(error);
 } finally {
  root.setAttribute('aria-busy', 'false');
 }
}

function mountDetailedTables(root, data, families) {
 const reconstructionNote = 'Occupancy: %. SDF: voxels. Normal error: degrees. Unreported values are marked with a dash.';
 const realNote = 'ID: within the 8 × 8 cm training region. OOD: outside that region, within 24 × 24 cm. ACT and π0.5 use RGB-D observations; the simulator-trained policies and ∂Oθ use structured motion-capture observations.';
 const groups = [
  {
   id: 'reconstruction', anchor: 'reconstruction', label: 'Reconstruction',
   tables: families.map(f => ({
    label: f.name,
    html: table(f.name + ' · ' + f.protocol, ['Method','Precision ↑','Recall ↑','F1 ↑','SDF MAE ↓','SDF CD ↓','Normal error ↓','Parameters'], data['multi-head-results'].slice(...f.bounds)),
    note: reconstructionNote
   }))
  },
  {
   id: 'ablations', anchor: 'ablations', label: 'Ablations', tables: [
    {label: 'Structural conditioning', html: table('Structural conditioning · 10 rigid objects', ['Conditioning','Precision ↑','Recall ↑','F1 ↑'], data['shape-code-ablation'])},
    {label: 'Training stages', html: table('Training stages · 100 rigid objects', ['Stage','Occ. F1 ↑','SDF MAE ↓','Normal error ↓'], data['training-stage-ablation']), note: reconstructionNote}
   ]
  },
  {
   id: 'grasp', anchor: 'grasp-optimization', label: 'Grasp optimization',
   tables: ['Duck','Piggy bank','Trophy','Apple'].map((name,i) => ({
    label: name,
    html: table(name + ' · simulation', ['Method','Loss ↓','Penetration (mm) ↓','Success (%) ↑','Mean steps ↓'], data['policy-results'].map(r => ({name:r.name,values:[...r.values.slice(i*3,i*3+3),r.values[12]]})))
   }))
  },
  {
   id: 'real', anchor: 'real-world-transfer', label: 'Real robot',
   tables: ['In-distribution','Out-of-distribution'].map((name,i) => ({
    label: name,
    html: table(name, ['Method','Duck (%) ↑','Piggy bank (%) ↑','Trophy (%) ↑','Apple (%) ↑'], data['real-world-results'].map(r => ({name:r.name,values:r.values.filter((_,j)=>j%2===i)}))),
    note: realNote
   }))
  }
 ];
 const button = (id,panel,label,selected) => `<button type="button" id="${id}" role="tab" aria-controls="${panel}" aria-selected="${selected}" tabindex="${selected?0:-1}">${esc(label)}</button>`;
 root.innerHTML = `<div class="table-tabs" role="tablist" aria-label="Experiment category">${groups.map((g,i)=>button('table-tab-'+g.id,g.anchor,g.label,i===0)).join('')}</div>` + groups.map((g,i) => `
  <div class="table-category" id="${g.anchor}" role="tabpanel" aria-labelledby="table-tab-${g.id}" ${i?'hidden':''}>
   <div class="table-subtabs" role="tablist" aria-label="${g.label} tables">${g.tables.map((t,j)=>button('table-tab-'+g.id+'-'+j,'table-pane-'+g.id+'-'+j,t.label,j===0)).join('')}</div>
   ${g.tables.map((t,j)=>`<div class="table-pane" id="table-pane-${g.id}-${j}" role="tabpanel" aria-labelledby="table-tab-${g.id}-${j}" tabindex="0" ${j?'hidden':''}>${t.html}${t.note?`<p class="protocol">${t.note}</p>`:''}</div>`).join('')}
  </div>`).join('');
 root.querySelectorAll('[role="tablist"]').forEach(list => {
  const buttons = [...list.querySelectorAll(':scope > [role="tab"]')];
  function select(index, focus=false, updateURL=true) {
   buttons.forEach((button,i) => {
    button.setAttribute('aria-selected',String(i===index));
    button.tabIndex = i===index ? 0 : -1;
    root.querySelector('#'+button.getAttribute('aria-controls')).hidden = i!==index;
   });
   if (list.classList.contains('table-tabs') && updateURL) {
    const url = new URL(location.href);
    url.hash = groups[index].anchor;
    history.replaceState(null, '', url);
   }
   if (focus) buttons[index].focus();
  }
  if (list.classList.contains('table-tabs')) {
   const openLinkedTable = () => {
    const index = groups.findIndex(group => group.anchor === location.hash.slice(1));
    select(index < 0 ? 0 : index, false, false);
   };
   openLinkedTable();
   window.addEventListener('hashchange', openLinkedTable);
  }
  buttons.forEach((button,index) => {
   button.addEventListener('click',()=>select(index));
   button.addEventListener('keydown',event=>{
    const next = {ArrowRight:(index+1)%buttons.length,ArrowLeft:(index+buttons.length-1)%buttons.length,Home:0,End:buttons.length-1}[event.key];
    if (next===undefined) return;
    event.preventDefault();
    select(next,true);
   });
  });
 });
}
