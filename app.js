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
  const { mountRepresentationWorkbench } = await import('./assets/representation-workbench.js');
  await mountRepresentationWorkbench();
}

async function initAction() {
  const {mountAction} = await import('./assets/action-page.js');
  await mountAction();
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

// Each URL contains one chapter and only loads the modules that chapter needs.
const initializers = {
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

// Previously shared section URLs still lead to their new standalone page.
const legacyPages = {
  reconstruction: 'representation.html', observations: 'representation.html',
  architecture: 'representation.html', zoo: 'zoo.html', 'zoo-library': 'zoo.html',
  optimization: 'action.html', experiments: 'real-robot.html', setup: 'real-robot.html',
  method: 'method.html', references: 'method.html'
};
const legacyPage = document.body.dataset.page === 'overview' && legacyPages[location.hash.slice(1)];
if (legacyPage) {
  location.replace(legacyPage + location.hash);
} else {
  await initializers[document.body.dataset.page]?.();
  openLinkedDetail();
  window.addEventListener('hashchange', openLinkedDetail);
}
