import { mountPolicyScene } from './assets/policy-scenes.js';
import { mountMethodResults } from './assets/method-results.js';
import { mountCapture, mountComparison } from './assets/interactive-scenes.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function pressed(buttons,selected){buttons.forEach(b=>{const active=b===selected;b.setAttribute('aria-pressed',String(active));b.classList.toggle('active',active);});}
function wireTabs(selector,handler){const tabs=$$(selector);tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>handler(index));tab.addEventListener('keydown',event=>{const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index-1+tabs.length)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;if(next===null)return;event.preventDefault();tabs[next].focus();handler(next);});});}
function selectTabs(selector,index){$$(selector).forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;});}
const comparison=mountComparison($('#real-scene'),$('#sim-scene'));
$$('[data-compare-object]').forEach(b=>b.addEventListener('click',()=>{pressed($$('[data-compare-object]'),b);comparison.setObject(b.dataset.compareObject);}));
const fieldLabels={occupancy:'Occupancy · object surface',sdf:'<span class="field-dot inside"></span> Inside <span class="field-dot surface"></span> Surface <span class="field-dot outside"></span> Outside · cross-section',normals:'<span class="normal-arrow-key">↗</span> Outward surface normals'};
$$('[data-field]').forEach(b=>b.addEventListener('click',()=>{pressed($$('[data-field]'),b);comparison.setMode(b.dataset.field);$('#field-key').innerHTML=fieldLabels[b.dataset.field];}));
$('#comparison').addEventListener('input',event=>{const split=Number(event.target.value);$('#compare-frame').style.setProperty('--split',`${split}%`);$('#compare-value').textContent=`${split}% object / ${100-split}% field`;event.target.setAttribute('aria-valuetext',`${split} percent object, ${100-split} percent field`);});

// Supporting material opens where it belongs in the story.
let disposeCapture;
$('#observations').addEventListener('toggle', () => {
  if ($('#observations').open && !disposeCapture) disposeCapture = mountCapture($('#capture-scene'));
  if (!$('#observations').open && disposeCapture) { disposeCapture(); disposeCapture = undefined; }
});
$$('[data-open-detail]').forEach(link => link.addEventListener('click', () => {
  const detail = document.getElementById(link.dataset.openDetail);
  detail.open = true;
}));
const initialDetail = document.getElementById(location.hash.slice(1));
if (initialDetail?.tagName === 'DETAILS') initialDetail.open = true;

$$('[data-recorded-media]').forEach(container => {
  const image = container.querySelector('[data-motion-src]');
  const button = container.querySelector('[data-media-toggle]');
  let paused = reducedMotion.matches;
  function update() {
    image.src = paused ? image.dataset.motionPoster : image.dataset.motionSrc;
    button.textContent = paused ? 'Play' : 'Pause';
    button.setAttribute('aria-pressed', String(paused));
    button.setAttribute('aria-label', `${paused ? 'Play' : 'Pause'} recorded robot animation`);
  }
  button.addEventListener('click', () => { paused = !paused; update(); });
  update();
});

const policies = [
  { kicker: '01 / OPTIMIZE THE GRASP', title: 'Optimize each joint through geometry.', description: 'AWR supplies contact and distance queries. Grasp losses combine these with pose regularization. Gradients through the frozen fields and hand kinematics adjust the joint angles toward a grasp.', input: 'Frozen AWR fields + grasp objectives', output: 'Optimized hand configurations', next: 'Next: demonstrations' },
  { kicker: '02 / COLLECT DEMONSTRATIONS', title: 'Collect demonstrations across placements.', description: 'Repeat grasp optimization with AWR across object placements. Pair observed states with optimized actions along the trajectories. The illustration follows approach, grasp, lift, and placement.', input: 'Object states + AWR-optimized trajectories', output: 'State-action demonstration pairs', next: 'Next: policy learning' },
  { kicker: '03 / LEARN THE POLICY', title: 'Train a policy on AWR demonstrations.', description: 'Behavior cloning fits a policy to the optimized state-action pairs. At execution time, the policy maps current observations to joint actions. The illustration shows fitting followed by task execution.', input: 'Demonstrations generated with AWR', output: 'A policy that maps observations to actions', next: 'Back to grasp optimization' }
];
let disposePolicy = () => {}, policyIndex = 0;
function setPolicy(index) {
  disposePolicy(); policyIndex = index;
  const policy = policies[index];
  selectTabs('[data-policy]', index);
  $('#policy-panel').setAttribute('aria-labelledby', `policy-tab-${index}`);
  for (const key of ['kicker', 'title', 'description', 'input', 'output']) $(`#policy-${key}`).textContent = policy[key];
  $('#policy-next').innerHTML = `${policy.next} <span aria-hidden="true">→</span>`;
  disposePolicy = mountPolicyScene($('#policy-scene'), { phase: index + 1 });
}
wireTabs('[data-policy]', setPolicy);
$('#policy-next').addEventListener('click', () => setPolicy((policyIndex + 1) % 3));
$$('[data-action-phase]').forEach(link => link.addEventListener('click', () => setPolicy(Number(link.dataset.actionPhase))));
setPolicy(0);

const families = [
  { id: 'articulated', name: 'Articulated', description: 'Joints, mechanisms, and robot hands', preview: 'foldingrule' },
  { id: 'skinned', name: 'Skinned', description: 'Characters and animals in motion', preview: 'smal_felidae' },
  { id: 'deformable', name: 'Soft', description: 'Cloth, plush toys, and deformable shapes', preview: '008-pink-cloth' }
];
let catalog = [], currentObject = null, zooPaused = reducedMotion.matches, currentFilter = 'all';
function chooseObject(object) {
  currentObject = object;
  $('#zoo-browser').hidden = false;
  $('#zoo-family-label').textContent = families.find(f => f.id === object.family).name.toUpperCase();
  $('#zoo-object-name').textContent = object.name;
  $('#zoo-animation').src = zooPaused ? object.poster : object.src;
  $('#zoo-animation').alt = `${object.name}: AWR object reconstruction`;
  $$('[data-zoo-object]').forEach(button => {
    const active = button.dataset.zooObject === object.id;
    button.setAttribute('aria-pressed', String(active)); button.classList.toggle('active', active);
  });
}
function renderZoo(filter = 'all') {
  currentFilter = filter;
  const selected = catalog.filter(o => filter === 'all' || o.family === filter);
  $('#object-grid').innerHTML = families.map(f => {
    const members = catalog.filter(o => o.family === f.id), preview = members.find(o => o.id === f.preview) || members[0];
    return `<button class="object-card family-card ${filter === f.id ? 'active' : ''}" data-family="${f.id}" aria-label="Explore ${f.name} objects"><div class="family-preview"><img data-family-preview data-src="${preview.src}" data-poster="${preview.poster}" src="${zooPaused ? preview.poster : preview.src}" alt="${preview.name}: AWR reconstructed motion" width="720" height="400" loading="lazy"><span class="family-count">${members.length} objects</span></div><div class="object-card-copy"><h3>${f.name}</h3><p>${f.description}</p><span aria-hidden="true">↗</span></div></button>`;
  }).join('');
  $('#zoo-count').textContent = `${selected.length} animated objects`;
  $('#zoo-thumbnails').innerHTML = selected.map(o => `<button class="zoo-thumb" data-zoo-object="${o.id}" aria-label="Show ${o.name}" aria-pressed="false"><img src="${o.poster}" alt="" width="180" height="120" loading="lazy"><span>${o.name}</span></button>`).join('');
  $$('[data-family]').forEach(button => button.addEventListener('click', () => {
    const family = button.dataset.family;
    pressed($$('[data-filter]'), $(`[data-filter="${family}"]`));
    renderZoo(family); $('#zoo-library').open = true;
    $('#zoo-library').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
  }));
  $$('[data-zoo-object]').forEach(button => button.addEventListener('click', () => chooseObject(catalog.find(o => o.id === button.dataset.zooObject))));
  if (selected.length) chooseObject(selected.find(o => o.id === currentObject?.id) || selected[0]);
}
function updateZooPlayback() {
  $$('[data-zoo-playback]').forEach(button => {
    button.textContent = zooPaused ? 'Play animations' : 'Pause animations';
    button.setAttribute('aria-pressed', String(zooPaused));
  });
  $$('[data-family-preview]').forEach(image => image.src = zooPaused ? image.dataset.poster : image.dataset.src);
  if (currentObject) chooseObject(currentObject);
}
$$('[data-filter]').forEach(button => button.addEventListener('click', () => { pressed($$('[data-filter]'), button); renderZoo(button.dataset.filter); }));
$$('[data-zoo-playback]').forEach(button => button.addEventListener('click', () => { zooPaused = !zooPaused; updateZooPlayback(); }));
updateZooPlayback();

const dialog=$('#object-dialog');let dialogPaused=false;
$('#zoo-expand').addEventListener('click',()=>{if(!currentObject)return;dialogPaused=zooPaused;$('#object-dialog-title').textContent=currentObject.name;$('#object-dialog-category').textContent=families.find(f=>f.id===currentObject.family).name.toUpperCase();$('#dialog-art').innerHTML=`<img src="${dialogPaused?currentObject.poster:currentObject.src}" alt="${currentObject.name}: AWR reconstruction" width="1200" height="720">`;$('#dialog-motion').textContent=`${dialogPaused?'Play':'Pause'} animation`;$('#dialog-motion').setAttribute('aria-pressed',String(dialogPaused));document.body.classList.add('dialog-open');dialog.showModal();$('#dialog-close').focus();});
$('#dialog-motion').addEventListener('click',event=>{dialogPaused=!dialogPaused;$('#dialog-art img').src=dialogPaused?currentObject.poster:currentObject.src;event.currentTarget.textContent=`${dialogPaused?'Play':'Pause'} animation`;event.currentTarget.setAttribute('aria-pressed',String(dialogPaused));});$('#dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close();});dialog.addEventListener('close',()=>{document.body.classList.remove('dialog-open');$('#dialog-art').replaceChildren();$('#zoo-expand').focus();});
fetch('assets/demos/catalog.json').then(r=>{if(!r.ok)throw new Error('Object catalog unavailable');return r.json();}).then(items=>{catalog=items.filter(o=>o.animated);renderZoo(currentFilter);}).catch(error=>{$('#zoo-count').textContent='Object gallery could not load. Please refresh.';console.error(error);});

const realTrials = { id: [13, 11, 10, 11], ood: [13, 10, 9, 9] };
const graspObjects = [{ name: 'Duck', image: 'duck.jpg' }, { name: 'Piggy bank', image: 'piggy-bank.jpg' }, { name: 'Trophy', image: 'trophy.jpg' }, { name: 'Apple', image: 'apple.jpg' }];
function setResultSplit(split) {
  pressed($$('[data-split]'), $(`[data-split="${split}"]`));
  const counts = realTrials[split], successes = counts.reduce((sum, n) => sum + n, 0);
  $('#real-success').innerHTML = `${(successes / 52 * 100).toFixed(2)}<span>%</span>`;
  $('#real-trial-count').textContent = `${successes} / 52 trials · four objects`;
  $('#split-description').textContent = split === 'ood' ? 'OOD: outside the 8 × 8 cm training square, within 24 × 24 cm.' : 'ID: positions within the central 8 × 8 cm training square.';
  $('#grasp-objects').innerHTML = graspObjects.map((object, i) => `<div class="grasp-object"><img src="assets/research/${object.image}" alt="${object.name}" width="194" height="130" loading="lazy"><h4>${object.name}</h4><p><strong>${counts[i]} / 13</strong> successful trials</p></div>`).join('');
}
$$('[data-split]').forEach(button => button.addEventListener('click', () => setResultSplit(button.dataset.split)));
setResultSplit('ood');

function selectResult(index) {
  selectTabs('[data-method]', index);
  $$('#method .method-panel').forEach((panel, i) => panel.hidden = i !== index);
}
wireTabs('[data-method]', selectResult);
$$('[data-open-result]').forEach(link => link.addEventListener('click', () => selectResult(Number(link.dataset.openResult) - 1)));
mountMethodResults();

const menu=$('.menu-toggle');function closeMenu(){menu.setAttribute('aria-expanded','false');$('#navigation').classList.remove('open');}menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));$('#navigation').classList.toggle('open',open);});$$('#navigation a').forEach(link=>link.addEventListener('click',closeMenu));document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.getAttribute('aria-expanded')==='true'){closeMenu();menu.focus();}});
const sectionObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)$$('#navigation a').forEach(link=>{const active=link.getAttribute('href')===`#${entry.target.id}`;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});},{rootMargin:'-15% 0px -60% 0px',threshold:0});$$('main section[id]').forEach(s=>sectionObserver.observe(s));
