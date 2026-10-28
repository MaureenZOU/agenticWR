const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const shortName=s=>s.includes('Ours')?'∂Oθ':s.replace('-trained policy','').replace('Fast-Grasp’D','Fast-Grasp’D');
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const colors={ours:'#9371b7',baseline:'#a8bdce',id:'#b6a0ce',ood:'#7f5ba0'};
function chart(target,{title,subtitle,rows,max,unit='',series}){
 const grouped=!!series,W=grouped?1080:530,H=310,left=45,right=17,top=30,bottom=62,pw=W-left-right,ph=H-top-bottom,groups=rows.length,n=grouped?series.length:1,slot=pw/groups,bw=Math.min(grouped?46:40,slot*.66/n);max=max||Math.ceil(Math.max(...rows.flatMap(r=>r.values))*1.18*10)/10;
 const y=v=>top+ph*(1-v/max);let svg='';
 for(let i=0;i<=4;i++){const v=max*i/4;svg+=`<line class="chart-gridline" x1="${left}" x2="${W-right}" y1="${y(v)}" y2="${y(v)}"/><text class="chart-tick" text-anchor="end" x="${left-9}" y="${y(v)+4}">${Number(v.toFixed(2))}</text>`;}
 rows.forEach((r,i)=>{const mid=left+slot*(i+.5);r.values.forEach((v,j)=>{const x=mid+(j-n/2)*bw+bw*.1,w=bw*.8;const color=grouped?series[j].color:(r.name.includes('Ours')?colors.ours:colors.baseline);svg+=`<rect x="${x}" y="${y(v)}" width="${w}" height="${top+ph-y(v)}" rx="3" fill="${color}"><title>${esc(r.name)}${grouped?' · '+series[j].name:''}: ${v.toFixed(2)}${unit}</title></rect><text class="chart-value" x="${x+w/2}" y="${y(v)-7}" text-anchor="middle">${v>=1000?v.toFixed(0):v.toFixed(max<10?2:1)}</text>`;});const label=shortName(r.name);svg+=`<text class="chart-label" text-anchor="middle" x="${mid}" y="${H-bottom+24}">${esc(label)}</text>`;});
 target.innerHTML=`<h3>${title}</h3><p>${subtitle}</p>${grouped?`<div class="chart-legend">${series.map(s=>`<span><i style="--key-color:${s.color}"></i>${s.name}</span>`).join('')}</div>`:''}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${svg}</svg>`;
}
const table=(caption,headers,rows)=>`<div class="table-scroll" role="region" tabindex="0" aria-label="${esc(caption)}"><table><caption>${caption}</caption><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr class="${r.name.includes('Ours')||r.name.includes('(Full)')?'highlight-row':''}"><th scope="row">${esc(r.name)}</th>${r.values.map(v=>`<td>${v==='/'?'—':esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
export async function mountResults(){
 const response=await fetch('assets/research/paper-results.json');if(!response.ok)throw new Error('Paper results could not load');const d=await response.json();
 const families=[{name:'Articulated',bounds:[0,8],protocol:'100 articulated objects'},{name:'Skinning',bounds:[8,15],protocol:'70 skinned objects'},{name:'SMPL',bounds:[15,17],protocol:'Human body reconstruction'},{name:'Soft',bounds:[17,26],protocol:'30 soft objects'}];
 const filter=document.querySelector('#result-family');families.forEach((f,i)=>{const b=document.createElement('button');b.type='button';b.textContent=f.name;b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>selectFamily(i));filter.append(b);});
 function selectFamily(i){filter.querySelectorAll('button').forEach((b,j)=>b.setAttribute('aria-pressed',String(i===j)));const f=families[i],rs=d['multi-head-results'].slice(...f.bounds);chart(document.querySelector('#chart-occupancy'),{title:'Occupancy F1 ↑',subtitle:f.protocol+' · %',rows:rs.map(r=>({name:r.name,values:[+r.values[2]]})),max:100,unit:'%'});chart(document.querySelector('#chart-sdf'),{title:'SDF mean absolute error ↓',subtitle:f.protocol+' · voxels',rows:rs.filter(r=>r.values[3]!=='/').map(r=>({name:r.name,values:[+r.values[3]]}))});}
 selectFamily(0);
 chart(document.querySelector('#chart-grasp'),{title:'Grasp success ↑',subtitle:'Simulation · mean over Duck, Piggy bank, Trophy and Apple · %',rows:d['policy-results'].map(r=>({name:r.name,values:[mean([2,5,8,11].map(i=>+r.values[i]))]})),max:100,unit:'%'});
 chart(document.querySelector('#chart-convergence'),{title:'Steps to convergence ↓',subtitle:'Capped mean steps · equal weight for each of the four objects',rows:d['policy-results'].map(r=>({name:r.name,values:[+r.values[12]]})),max:3000});
 chart(document.querySelector('#chart-real'),{title:'Real-robot grasp success ↑',subtitle:'Mean over four objects · 13 trials per object and placement split · %',rows:d['real-world-results'].map(r=>({name:r.name,values:[mean([0,2,4,6].map(i=>+r.values[i])),mean([1,3,5,7].map(i=>+r.values[i]))]})),max:100,unit:'%',series:[{name:'In-distribution',color:colors.id},{name:'Out-of-distribution',color:colors.ood}]});
 mountDetailedTables(document.querySelector('#detailed-results'),d,families);
}

function mountDetailedTables(root, data, families) {
 const reconstructionNote = 'Occupancy: %. SDF: voxels. Normal error: degrees. Unreported values are marked with a dash.';
 const realNote = 'ID: within the 8 × 8 cm training region. OOD: outside that region, within 24 × 24 cm. ACT and π0.5 use RGB-D observations; the simulator-trained policies and ∂Oθ use structured motion-capture observations.';
 const groups = [
  {
   id: 'reconstruction', label: 'Reconstruction',
   tables: families.map(f => ({
    label: f.name,
    html: table(f.name + ' · ' + f.protocol, ['Method','Precision ↑','Recall ↑','F1 ↑','SDF MAE ↓','SDF CD ↓','Normal error ↓','Parameters'], data['multi-head-results'].slice(...f.bounds)),
    note: reconstructionNote
   }))
  },
  {
   id: 'ablations', label: 'Ablations', tables: [
    {label: 'Structural conditioning', html: table('Structural conditioning · 10 rigid objects', ['Conditioning','Precision ↑','Recall ↑','F1 ↑'], data['shape-code-ablation'])},
    {label: 'Training stages', html: table('Training stages · 100 rigid objects', ['Stage','Occ. F1 ↑','SDF MAE ↓','Normal error ↓'], data['training-stage-ablation']), note: reconstructionNote}
   ]
  },
  {
   id: 'grasp', label: 'Grasp optimization',
   tables: ['Duck','Piggy bank','Trophy','Apple'].map((name,i) => ({
    label: name,
    html: table(name + ' · simulation', ['Method','Loss ↓','Penetration (mm) ↓','Success (%) ↑','Mean steps ↓'], data['policy-results'].map(r => ({name:r.name,values:[...r.values.slice(i*3,i*3+3),r.values[12]]})))
   }))
  },
  {
   id: 'real', label: 'Real robot',
   tables: ['In-distribution','Out-of-distribution'].map((name,i) => ({
    label: name,
    html: table(name, ['Method','Duck (%) ↑','Piggy bank (%) ↑','Trophy (%) ↑','Apple (%) ↑'], data['real-world-results'].map(r => ({name:r.name,values:r.values.filter((_,j)=>j%2===i)}))),
    note: realNote
   }))
  }
 ];
 const button = (id,panel,label,selected) => `<button type="button" id="${id}" role="tab" aria-controls="${panel}" aria-selected="${selected}" tabindex="${selected?0:-1}">${esc(label)}</button>`;
 root.innerHTML = `<div class="table-tabs" role="tablist" aria-label="Experiment category">${groups.map((g,i)=>button('table-tab-'+g.id,'table-category-'+g.id,g.label,i===0)).join('')}</div>` + groups.map((g,i) => `
  <div class="table-category" id="table-category-${g.id}" role="tabpanel" aria-labelledby="table-tab-${g.id}" ${i?'hidden':''}>
   <div class="table-subtabs" role="tablist" aria-label="${g.label} tables">${g.tables.map((t,j)=>button('table-tab-'+g.id+'-'+j,'table-pane-'+g.id+'-'+j,t.label,j===0)).join('')}</div>
   ${g.tables.map((t,j)=>`<div class="table-pane" id="table-pane-${g.id}-${j}" role="tabpanel" aria-labelledby="table-tab-${g.id}-${j}" tabindex="0" ${j?'hidden':''}>${t.html}${t.note?`<p class="protocol">${t.note}</p>`:''}</div>`).join('')}
  </div>`).join('');
 root.querySelectorAll('[role="tablist"]').forEach(list => {
  const buttons = [...list.querySelectorAll(':scope > [role="tab"]')];
  function select(index, focus=false) {
   buttons.forEach((button,i) => {
    button.setAttribute('aria-selected',String(i===index));
    button.tabIndex = i===index ? 0 : -1;
    root.querySelector('#'+button.getAttribute('aria-controls')).hidden = i!==index;
   });
   if (focus) buttons[index].focus();
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
