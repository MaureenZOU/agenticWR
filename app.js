const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function pressed(buttons,selected){buttons.forEach(b=>{const active=b===selected;b.setAttribute('aria-pressed',String(active));b.classList.toggle('active',active);});}
function wireTabs(selector,handler){const tabs=$$(selector);tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>handler(index));tab.addEventListener('keydown',event=>{const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index-1+tabs.length)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;if(next===null)return;event.preventDefault();tabs[next].focus();handler(next);});});}
function selectTabs(selector,index){$$(selector).forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;});}
// Keep deep links shareable when an in-page tab changes.
function setQueryChoice(key, value, defaultValue) {
  const url = new URL(location.href);
  if (value === defaultValue) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  if (url.href !== location.href) history.replaceState(null, '', url);
}

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

const menu=$('.menu-toggle');function closeMenu(){menu.setAttribute('aria-expanded','false');$('#navigation').classList.remove('open');}menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));$('#navigation').classList.toggle('open',open);});$$('#navigation a').forEach(link=>link.addEventListener('click',closeMenu));document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.getAttribute('aria-expanded')==='true'){closeMenu();menu.focus();}});

async function initRepresentation() {
  const { mountObjectLab } = await import('./assets/object-lab.js?v=20261029-constrained-poses-v1');
  await mountObjectLab();
}

async function initOverview() {
  const { mountProjectPage } = await import('./assets/project-page.js?v=20261029-constrained-poses-v1');
  mountProjectPage({ representation: initRepresentation, action: initAction });
}

async function initAction() {
  const {mountGraspLab} = await import('./assets/grasp-lab.js?v=20261029-constrained-poses-v1');
  await mountGraspLab();
}
async function initZoo() {
  const {mountZoo} = await import('./assets/zoo-page.js');
  await mountZoo();
}

async function initRealRobot() {}
async function initResults() {
 const {mountResults} = await import('./assets/results-page.js');
 await mountResults();
}

// The Overview loads each interactive chapter as it approaches the viewport.
const initializers = {
  overview: initOverview,
  representation: initRepresentation,
  action: initAction,
  zoo: initZoo,
  'real-robot': initRealRobot,
  results: initResults
};

function openLinkedDetail() {
  const detail = document.getElementById(location.hash.slice(1));
  if (detail?.tagName !== 'DETAILS') return;
  detail.open = true;
  requestAnimationFrame(() => detail.scrollIntoView({ block: 'start' }));
}

const legacyPages = { method: 'method.html', references: 'method.html' };
const legacySections = { reconstruction: 'representation', observations: 'representation', architecture: 'representation', zoo: 'representation', 'zoo-library': 'representation', setup: 'experiments' };
const isOverview = document.body.dataset.page === 'overview';
const legacyPage = isOverview && legacyPages[location.hash.slice(1)];
if (legacyPage) {
  location.replace(legacyPage);
} else {
  const section = isOverview && legacySections[location.hash.slice(1)];
  if (section) {
    history.replaceState(null, '', location.pathname + location.search + '#' + section);
    requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView());
  }
  await initializers[document.body.dataset.page]?.();
  openLinkedDetail();
  window.addEventListener('hashchange', openLinkedDetail);
}
