import {decodeEmbeddingTrace, embeddingFrame, embeddingRanges, networkGradientColors, projectNativeHand} from './embedding-data.js';

const root=document.querySelector('#gradient-flow');
if(root) mount();

function mount() {
  const $=selector=>root.querySelector(selector), svgNS='http://www.w3.org/2000/svg';
  const canvas=$('#gradient-heatmap'), ctx=canvas.getContext('2d'), timeline=$('#gradient-replay-time');
  const toggle=$('#gradient-replay-toggle'), detail=$('#gradient-embedding-detail');
  const modes=[...root.querySelectorAll('[data-embedding-mode]')];
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let data, ranges, networks, projection, mode='delta', frame=0, paused=motion.matches, visible=false, loading=false, last=0;
  let currentValues, inspectedCell=null, nativePoints=[], nativeLines=[], rowSwatches=[], rowHits=[];
  const palette=[[79,61,149],[43,127,190],[53,177,155],[96,184,121],[243,207,83],[239,147,60],[217,78,71]];
  const networkPalette=[[206,197,235],[116,108,195],[199,62,137]];
  function color(fraction, colors=palette) {
    const x=Math.max(0,Math.min(1,fraction))*(colors.length-1), i=Math.min(colors.length-2,Math.floor(x)), t=x-i;
    return colors[i].map((c,j)=>Math.round(c+(colors[i+1][j]-c)*t));
  }
  const rgb=c=>`rgb(${c.join(',')})`;
  function node(tag, attrs, parent) {const n=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);parent.append(n);return n;}
  function select(row) {
    nativePoints.forEach((p,i)=>p.classList.toggle('is-highlighted',i===row));
    rowHits.forEach((p,i)=>p.classList.toggle('is-highlighted',i===row));
  }
  function build() {
    const hand=$('#gradient-native-hand'), labels=$('#gradient-row-labels');
    const heatmapBox=canvas.closest('foreignObject'), rowHeight=Number(heatmapBox.getAttribute('height'))/18;
    const rowWidth=Number(heatmapBox.getAttribute('x'))+Number(heatmapBox.getAttribute('width'))-13;
    nativeLines=data.manifest.edges.map(edge=>({edge,line:node('line',{class:'gradient-native-bone'},hand)}));
    nativePoints=data.manifest.keypoint_names.map((name,i)=>{
      const p=node('circle',{r:3.8,class:'gradient-native-kp','data-kp':i},hand);
      node('title',{},p).textContent=`KP ${i} · ${name}`;
      return p;
    });
    for(let row=0;row<18;row++) {
      const y=Number(heatmapBox.getAttribute('y'))+row*rowHeight;
      const group=node('g',{'data-kp-row':row,tabindex:0,role:'button','aria-label':`Inspect keypoint ${row}: ${data.manifest.keypoint_names[row]}`},labels);
      const hit=node('rect',{x:13,y:y-.5,width:rowWidth,height:rowHeight,rx:1,class:'gradient-row-hit'},group);rowHits.push(hit);
      node('text',{x:25,y:y+rowHeight*.75,class:'gradient-row-number'},group).textContent=row;
      rowSwatches.push(node('rect',{x:32,y:y+.7,width:9,height:rowHeight-2,class:'gradient-row-swatch'},group));
      group.addEventListener('pointerenter',()=>select(row));group.addEventListener('pointerleave',()=>select(-1));
      group.addEventListener('click',()=>{paused=true;sync();select(row);detail.textContent=`KP ${row} · ${data.manifest.keypoint_names[row]}`;});
      group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();group.dispatchEvent(new Event('click'));}});
    }
    timeline.max=data.manifest.frames-1;
    [timeline,toggle,...modes].forEach(n=>n.disabled=false);
  }
  function sync() {toggle.textContent=paused?'Play':'Pause';toggle.setAttribute('aria-label',`${paused?'Play':'Pause'} recorded optimization`);root.dataset.embeddingPlayback=paused?'paused':'playing';}
  function describeCell() {
    const [row,column]=inspectedCell;
    detail.textContent=`KP ${row} · channel ${column} · ${mode==='delta'?'ΔE':mode==='gradient'?'∂L/∂E':'E'} = ${currentValues[row*128+column].toPrecision(6)}`;
  }
  function paint() {
    currentValues=embeddingFrame(data,mode,frame);
    const range=ranges[mode], image=ctx.createImageData(256,180), pixels=image.data;
    for(let row=0;row<18;row++) {
      let sum=0;
      for(let column=0;column<128;column++) {
        const v=currentValues[row*128+column];sum+=v*v;
        const c=color(.5+.5*v/range.limit);
        for(let dy=0;dy<9;dy++) for(let dx=0;dx<2;dx++) {const at=((row*10+dy)*256+column*2+dx)*4;pixels.set([...c,255],at);}
      }
      const shade=rgb(color(Math.sqrt(sum/128)/range.rowMax));
      rowSwatches[row].style.fill=shade;nativePoints[row].style.fill=shade;
      const point=projection[frame*18+row];nativePoints[row].setAttribute('cx',point[0]);nativePoints[row].setAttribute('cy',point[1]);
    }
    ctx.putImageData(image,0,0);
    nativeLines.forEach(({edge,line})=>{const [a,b]=edge.map(i=>projection[frame*18+i]);line.setAttribute('x1',a[0]);line.setAttribute('y1',a[1]);line.setAttribute('x2',b[0]);line.setAttribute('y2',b[1]);});
    const label=mode==='delta'?'ΔE this step':mode==='embedding'?'E':'∂L/∂E';
    $('#gradient-matrix-caption').textContent=`${label} · 18 × 128`;
    canvas.setAttribute('aria-label',`${label}, 18 keypoints by 128 channels at accepted step ${data.manifest.rows[frame].step}`);
    $('#gradient-replay-step').textContent=`Step ${data.manifest.rows[frame].step} / ${data.manifest.rows.at(-1).step}`;
    $('#gradient-recorded-loss').textContent=`Loss ${data.manifest.rows[frame].loss.toFixed(2)} · recorded optimization`;
    $('#gradient-range-low').textContent='−';$('#gradient-range-high').textContent='+';
    const legend=root.querySelector('.gradient-color-legend');legend.title=`Fixed recording-wide scale: ±${range.limit.toPrecision(4)} (99th percentile; hover for raw values)`;
    timeline.value=frame;
    // Schematic network glyphs now use measured feature-gradient magnitudes,
    // grouped into nine consecutive channel bins; they are not architecture diagrams.
    root.querySelectorAll('.gradient-neural').forEach((net,index)=>{
      const measured=networks[index];
      const circles=[...net.querySelectorAll('circle')];
      circles.forEach((circle,bin)=>{circle.style.fill=rgb(color(Math.sqrt(measured.bins[frame][bin]/measured.limit),networkPalette));});
    });
    $('#gradient-duck-center').style.fill=rgb(color(networks[1].magnitudes[frame]/networks[1].magnitudeMax));
    root.dataset.embeddingFrame=String(frame);root.dataset.embeddingMode=mode;
    root.dataset.embeddingLoss=String(data.manifest.rows[frame].loss);
    if(inspectedCell)describeCell();
  }
  function inspect(event) {
    if(!data)return;
    const rect=canvas.getBoundingClientRect(), row=Math.min(17,Math.max(0,Math.floor((event.clientY-rect.top)/rect.height*18))), column=Math.min(127,Math.max(0,Math.floor((event.clientX-rect.left)/rect.width*128)));
    inspectedCell=[row,column];select(row);describeCell();
  }
  canvas.addEventListener('pointermove',inspect);
  canvas.addEventListener('pointerdown',event=>{if(data){paused=true;sync();inspect(event);}});
  canvas.addEventListener('pointerleave',()=>{inspectedCell=null;select(-1);detail.textContent='18 keypoints · matching row colors · 128 recorded channels';});
  modes.forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.embeddingMode;modes.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));paint();}));
  toggle.addEventListener('click',()=>{paused=!paused;last=performance.now();sync();});
  timeline.addEventListener('input',()=>{paused=true;frame=Number(timeline.value);sync();paint();});
  motion.addEventListener('change',()=>{paused=motion.matches;sync();});
  async function load() {
    loading=true;
    try {
      const response=await fetch(new URL('./lab/embedding/trace.json',import.meta.url));
      if(!response.ok)throw Error('Embedding manifest unavailable');
      const manifest=await response.json();
      const binary=await fetch(new URL(`./lab/embedding/${manifest.binary}`,import.meta.url));
      if(!binary.ok)throw Error('Embedding tensors unavailable');
      const buffer=await new Response(binary.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      data=decodeEmbeddingTrace(manifest,buffer);ranges=embeddingRanges(data);networks=networkGradientColors(data);projection=projectNativeHand(data);
      build();paint();sync();root.dataset.embeddingReady='true';
      detail.textContent='18 keypoints · matching row colors · 128 recorded channels';
    } catch(error) {root.dataset.embeddingReady='error';$('#gradient-replay-step').textContent='Recording unavailable';detail.textContent='Refresh to retry loading the recorded model tensors.';console.error('Embedding replay failed',error);}
  }
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible&&!loading)load();},{rootMargin:'300px'});observer.observe(root);
  function tick(now) {
    if(data&&!paused&&visible&&!document.hidden) {
      const interval=frame===data.manifest.frames-1?1300:150;
      if(now-last>=interval){frame=(frame+1)%data.manifest.frames;last=now;paint();}
    } else last=now;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
