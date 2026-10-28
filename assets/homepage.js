import { mountHomepageScenes } from './homepage-scenes.js';

const root = document.querySelector('.home-flow');
const $ = selector => root.querySelector(selector);
const optimization = $('#home-optimization-video'), robot = $('#home-robot');
const videos = [optimization, robot];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let paused = reducedMotion.matches, visible = true, paintScenes = () => {}, timeline = [];
let elapsed = 0, previous = performance.now(), lastPaint = -1, lastIndex = -2;
const SVG = 'http://www.w3.org/2000/svg';
const keypointDots = Array.from({length:18},()=>{const node=document.createElementNS(SVG,'circle');node.setAttribute('r','4.4');$('#home-keypoint-dots').append(node);return node;});
const gradientVectors = Array.from({length:10},()=>{const node=document.createElementNS(SVG,'path');$('#home-gradient-vectors').append(node);return node;});

function playbackLabel() {
  const button = $('#flow-toggle');
  button.setAttribute('aria-pressed', String(paused));
  button.setAttribute('aria-label', `${paused ? 'Play' : 'Pause'} the entire workflow`);
  button.title = paused ? 'Play' : 'Pause';
  $('#flow-toggle-icon').setAttribute('d', paused ? 'M4 3L12 8L4 13Z' : 'M5 3V13M11 3V13');
  root.dataset.playback = paused ? 'paused' : 'playing';
}
async function synchronizePlayback() {
  if (paused || !visible || document.hidden) videos.forEach(video => video.pause());
  else {
    const results = await Promise.allSettled(videos.map(video => video.play()));
    if (results.some(result => result.status === 'rejected')) { paused = true; videos.forEach(video => video.pause()); }
  }
  playbackLabel();
}
function draw(t) {
  paintScenes(t);
  root.dataset.animationTime = t.toFixed(2);
  if (!timeline.length) return;
  const position = Math.min(timeline.length - 1, Math.floor(t * 25));
  const row = timeline[position], first = timeline.find(frame => frame.loss !== null), current = row.loss === null ? first : row;
  keypointDots.forEach((node,i)=>{const p=row.keypoints_2d?.[i];node.style.display=p?'':'none';if(p){node.setAttribute('cx',p[0]);node.setAttribute('cy',p[1]);}});
  gradientVectors.forEach((node,i)=>{const line=row.arrows_2d?.[i];node.style.display=line?'':'none';if(line)node.setAttribute('d',`M${line[0][0]} ${line[0][1]}L${line[1][0]} ${line[1][1]}`);});
  if (row.index === lastIndex) return;
  lastIndex = row.index;
  $('#home-loss-value').textContent = current.loss.toFixed(2);
  root.dataset.optimizationIteration = String(current.iteration);
  const valid = timeline.filter((frame,i) => i <= position && frame.loss !== null && (i === 0 || timeline[i-1].index !== frame.index));
  if (!valid.length) valid.push(first);
  const maximum = Math.max(...timeline.map(frame => frame.loss || 0));
  const points = valid.map(frame => [4 + Math.max(0,frame.time-2.4)/6.3*210,47-frame.loss/maximum*39]);
  $('#home-loss-path').setAttribute('d',points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' '));
  $('#home-loss-dot').setAttribute('cx',Math.min(214,points.at(-1)[0]));
  $('#home-loss-dot').setAttribute('cy',points.at(-1)[1]);
}
async function initialize() {
  try {
    const [asset, trace, articulated] = await Promise.all(['scene-meshes.json','optimization-timeline.json','articulated-meshes.json'].map(async name => {
      const response = await fetch(new URL(`./home/${name}`,import.meta.url));
      if (!response.ok) throw new Error(`Could not load ${name}`);
      return response.json();
    }));
    timeline = trace; paintScenes = mountHomepageScenes({...asset, articulated}); draw(elapsed);
    root.dataset.geometryLoaded = 'true';
  } catch (error) {
    console.error('Homepage media setup failed',error);
    root.dataset.geometryLoaded = 'error';
    $('#home-capture').textContent = 'Scene unavailable. Refresh to retry.';
    $('#home-representations').textContent = 'Geometry unavailable. Refresh to retry.';
  }
}
function tick(now) {
  const dt = Math.min((now-previous)/1000,.1); previous = now;
  if (!paused && visible && !document.hidden) {
    elapsed = optimization.readyState >= 2 && !optimization.paused ? optimization.currentTime : (elapsed+dt)%10;
    if (robot.readyState >= 2 && optimization.duration) {
      const target = elapsed/optimization.duration*robot.duration;
      if (Math.abs(robot.currentTime-target)>.18) robot.currentTime=target;
    }
    if (now-lastPaint>1000/30) { draw(elapsed); lastPaint=now; }
  }
  requestAnimationFrame(tick);
}
$('#flow-toggle').addEventListener('click',()=>{paused=!paused;synchronizePlayback();});
$('#flow-restart').addEventListener('click',()=>{videos.forEach(video=>{video.currentTime=0;});elapsed=0;lastIndex=-2;draw(0);synchronizePlayback();});
reducedMotion.addEventListener('change',event=>{paused=event.matches;synchronizePlayback();});
robot.addEventListener('loadedmetadata',()=>{robot.playbackRate=robot.duration/10;});
document.addEventListener('visibilitychange',synchronizePlayback);
const observer = new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;synchronizePlayback();});observer.observe(root);
const resize = new ResizeObserver(()=>{draw(elapsed);});resize.observe(root);
addEventListener('pagehide',()=>videos.forEach(video=>video.pause()));
addEventListener('pageshow',synchronizePlayback);
initialize();playbackLabel();synchronizePlayback();requestAnimationFrame(tick);
