export async function mountZoo() {
  const catalog=(await (await fetch('assets/demos/catalog.json')).json()).filter(o=>o.animated);
  const tiles=document.querySelector('#zoo-tiles'),image=document.querySelector('#zoo-animation'),play=document.querySelector('#zoo-playback');
  let selected=catalog[0],family=null,paused=false;
  function choose(object){selected=object;image.src=paused?object.poster:object.src;image.alt=`${object.name}: AWR reconstruction`;tiles.querySelectorAll('button').forEach(b=>{const active=b.dataset.object===object.id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});}
  function render(){tiles.replaceChildren();for(const object of catalog.filter(o=>!family||o.family===family)){const button=document.createElement('button');button.type='button';button.dataset.object=object.id;button.setAttribute('aria-label',`Show ${object.name}`);button.innerHTML=`<img src="assets/zoo-thumbnails/${object.id}.png" alt="" width="200" height="160"><span>${object.name}</span>`;button.addEventListener('click',()=>choose(object));tiles.append(button);}if(family&&selected.family!==family)selected=catalog.find(o=>o.family===family);choose(selected);}
  document.querySelectorAll('[data-zoo-family]').forEach(button=>button.addEventListener('click',()=>{family=family===button.dataset.zooFamily?null:button.dataset.zooFamily;document.querySelectorAll('[data-zoo-family]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.zooFamily===family)));render();}));
  play.addEventListener('click',()=>{paused=!paused;play.textContent=paused?'Play':'Pause';play.setAttribute('aria-label',`${paused?'Play':'Pause'} animation`);choose(selected);});render();
}
