// FLOOR — 01-state-render.js
// Extracted from the original single-file build. All files share global scope
// (loaded as classic scripts, in order). True ES modules come with the build step later.
'use strict';
// ---------------------------------------------------------------- storage backend
// Inside Claude artifacts, window.storage is provided by the platform.
// Hosted anywhere else (Netlify, a subdomain, local file), fall back to
// IndexedDB with the same API so persistence keeps working per browser.
if(!window.storage && window.FLOOR_STORAGE){
  window.storage = window.FLOOR_STORAGE; // Stage 2 cloud adapter (see README)
}
if(!window.storage){
  const DB='blockingBoard', ST='kv';
  const dbp = new Promise((res, rej)=>{
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = ()=>r.result.createObjectStore(ST);
    r.onsuccess = ()=>res(r.result);
    r.onerror = ()=>rej(r.error);
  });
  const run = async (mode, fn)=>{
    const db = await dbp;
    return new Promise((res, rej)=>{
      const q = fn(db.transaction(ST, mode).objectStore(ST));
      q.onsuccess = ()=>res(q.result);
      q.onerror = ()=>rej(q.error);
    });
  };
  window.storage = {
    async get(k){ const v = await run('readonly', s=>s.get(k)); return v===undefined ? null : {key:k, value:v}; },
    async set(k, v){ await run('readwrite', s=>s.put(v, k)); return {key:k, value:v}; },
    async delete(k){ await run('readwrite', s=>s.delete(k)); return {key:k, deleted:true}; },
    async list(prefix){ const keys = await run('readonly', s=>s.getAllKeys());
      return {keys: keys.filter(x=>!prefix || String(x).startsWith(prefix))}; },
  };
}

// ---------------------------------------------------------------- state
let project = null;
const imgCache = {};
const view = {x:0, y:0, scale:.65}; // start a bit zoomed out — room to think
let tool = 'select';
let sel = null;
let drag = null;
let libDrag = null;
let hoverWall = null;
let spaceDown = false;
let dirty = false, saveTimer = null;
let noteEditor = null;
let polyDraw = null; // {name, pts:[], mouse}
let drawShot = null; // shot currently being rendered (canvas or export)
let inkWeight = 3, inkColor = '#E8604C';

const cv = document.getElementById('cv');
let ctx = cv.getContext('2d'); // reassigned temporarily during exports
const wrap = document.getElementById('canvasWrap');

const WEATHERS = ['Any','Sunny','Partly cloudy','Overcast','Golden hour','Blue hour','Rain','Fog','Snow','Night'];

function newShot(n){
  return {id:uid(), name:'Scene '+n, walls:[], objects:[], stills:[],
    scene:'', sceneDesc:'', script:'', date:'', time:'', duration:60, weather:'Any', sun:null};
}
function migrateShot(s){
  if(s.scene===undefined) s.scene='';
  if(s.sceneDesc===undefined) s.sceneDesc='';
  if(s.script===undefined) s.script='';
  if(s.date===undefined) s.date='';
  if(s.time===undefined) s.time='';
  if(s.duration===undefined) s.duration=60;
  if(s.weather===undefined) s.weather='Any';
  if(s.sun===undefined) s.sun=null;
  if(!s.stills) s.stills=[];
  if(!s.objects) s.objects=[];
  if(!s.walls) s.walls=[];
  if(!Array.isArray(s.shots)){
    // first migration: every camera already on the board becomes its own shot
    s.shots = [];
    const cams = (s.objects||[]).filter(o=>o.cat==='camera');
    cams.forEach((c,i)=>{
      const sh = {id:uid(), name: c.label || ('Shot ' + (i+1)), desc:''};
      s.shots.push(sh);
      c.shotId = sh.id;
    });
  }
  s.objects.forEach(o=>{
    if((o.kind==='jib'||o.kind==='technocrane') && Array.isArray(o.path)){
      o.path.forEach(p=>{
        if(p.len===undefined) p.len = Math.max(120, (o.w||350) - 0.72*(o.h||60));
        if(p.rot===undefined||p.rot===null) p.rot = o.rot||0;
      });
    }
  });
}
let activeTab = 'design'; // design | mood | script | story | org
const BOARD_TABS = new Set(['mood','org','write']);
function activeScene(){
  if(activeTab === 'mood' && project.moodboard) return project.moodboard;
  if(activeTab === 'org' && project.prodboard) return project.prodboard;
  if(activeTab === 'write' && project.scriptboard) return project.scriptboard;
  return project.scenes.find(s => s.id === project.activeSceneId) || project.scenes[0];
}
const activeShot = activeScene; // legacy alias — every existing call site keeps working
function findObj(id){ return activeShot().objects.find(o=>o.id===id); }

// ---------------------------------------------------------------- storage
let currentProjectId = null;
async function loadProjectIndex(){
  try{
    const r = await window.storage.get('sd:projects');
    if(r && r.value) return JSON.parse(r.value);
  }catch(e){}
  return null;
}
async function saveProjectIndex(idx){
  await window.storage.set('sd:projects', JSON.stringify(idx));
}
async function loadProject(){
  try{
    let idx = await loadProjectIndex();
    if(!idx){
      // first run OR migration from the single-project era
      const legacy = await window.storage.get('sd:project').catch(()=>null);
      const id = uid();
      if(legacy && legacy.value){
        await window.storage.set('sd:project:' + id, legacy.value);
        let nm = 'My production';
        try{ nm = JSON.parse(legacy.value).shootName || nm; }catch(e){}
        idx = [{id, name:nm, updated:Date.now()}];
      } else {
        idx = [{id, name:'My production', updated:Date.now()}];
      }
      await saveProjectIndex(idx);
      await window.storage.set('sd:current', id);
    }
    const cur = await window.storage.get('sd:current').catch(()=>null);
    currentProjectId = (cur && cur.value && idx.some(p=>p.id===cur.value))
      ? cur.value : idx[0].id;
    const res = await window.storage.get('sd:project:' + currentProjectId).catch(()=>null);
    if(res && res.value){ project = JSON.parse(res.value); }
  }catch(e){ /* first run */ }
  if(!project || !project.scenes || !project.scenes.length){
    project = {v:4, scenes:[newShot(1)], activeSceneId:null, customProps:[], shootName:''};
    project.activeSceneId = project.scenes[0].id;
  }
  // v3 → v4: boards used to be called "shots"; a board is now a SCENE that
  // contains shot entities, and each camera on the board maps to one shot.
  if(project.shots && !project.scenes){
    project.scenes = project.shots;
    delete project.shots;
  }
  if(project.activeShotId !== undefined && project.activeSceneId === undefined){
    project.activeSceneId = project.activeShotId;
    delete project.activeShotId;
  }
  project.v = Math.max(project.v||0, 4);
  if(project.moodboard) migrateShot(project.moodboard);
  if(project.prodboard) migrateShot(project.prodboard);
  if(project.scriptboard) migrateShot(project.scriptboard);
  if(!project.script) project.script = {text:'', type:'film'};
  if(!project.production) project.production = {company:'', lead:'', notes:'', contacts:[], locations:[]};
  if(!project.customProps) project.customProps = [];
  if(!project.exportPrefs) project.exportPrefs = {grid:true, stills:true};
  if(project.shootName===undefined) project.shootName='';
  project.scenes.forEach(migrateShot);
  if(!project.scenes.find(s=>s.id===project.activeSceneId)) project.activeSceneId = project.scenes[0].id;
}
function markDirty(){
  dirty = true;
  document.getElementById('saveState').textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveProject, 700);
}
async function saveProject(){
  if(!dirty) return;
  dirty = false;
  try{
    await window.storage.set('sd:project:' + currentProjectId, JSON.stringify(project));
    // keep the production list in sync (name + freshness)
    try{
      const idx = (await loadProjectIndex()) || [];
      const e0 = idx.find(p=>p.id===currentProjectId);
      const nm = project.shootName || 'Untitled production';
      if(e0){ e0.name = nm; e0.updated = Date.now(); }
      else idx.push({id:currentProjectId, name:nm, updated:Date.now()});
      await saveProjectIndex(idx);
    }catch(e){}
    document.getElementById('saveState').textContent = 'Saved';
  }catch(e){
    document.getElementById('saveState').textContent = 'Save failed';
    console.error('save error', e);
  }
}
async function loadStill(id){
  if(imgCache[id]) return imgCache[id];
  try{
    const res = await window.storage.get('sd:img:'+id);
    if(res && res.value){
      const img = new Image();
      img.src = res.value;
      await img.decode().catch(()=>{});
      imgCache[id] = img;
      return img;
    }
  }catch(e){}
  return null;
}
function imgReferenced(id){
  return project.scenes.some(s =>
    s.stills.includes(id) || s.objects.some(o => o.cat==='image' && o.imgId===id));
}
async function maybeDeleteImg(id){
  if(!imgReferenced(id)){
    try{ await window.storage.delete('sd:img:'+id); }catch(_){}
    delete imgCache[id];
  }
}
async function ensureShotImages(shot, includeStills){
  const ids = new Set();
  shot.objects.forEach(o=>{ if((o.cat==='image' || o.cat==='link' || o.cat==='camera') && o.imgId) ids.add(o.imgId); });
  if(includeStills) shot.stills.forEach(id=>ids.add(id));
  await Promise.all([...ids].map(loadStill));
}

// ---------------------------------------------------------------- transforms
function toWorld(sx, sy){ return {x: sx/view.scale + view.x, y: sy/view.scale + view.y}; }
function toScreen(wx, wy){ return {x:(wx-view.x)*view.scale, y:(wy-view.y)*view.scale}; }
function evtPos(e){
  const r = cv.getBoundingClientRect();
  return {sx: e.clientX - r.left, sy: e.clientY - r.top};
}

// ---------------------------------------------------------------- sun helpers
function northAngle(s){ return (s && s.north !== undefined && s.north !== null) ? s.north : -Math.PI/2; }
function sunVec(hour, nA){ // unit vector pointing TOWARD the sun; nA = angle of the north direction
  if(nA === undefined || nA === null) nA = -Math.PI/2;
  const az = rad(90 + (hour-6)*15);
  const nx = Math.cos(nA), ny = Math.sin(nA);
  return {x: nx*Math.cos(az) - ny*Math.sin(az), y: nx*Math.sin(az) + ny*Math.cos(az)};
}
function formatHour(h){
  const hh = Math.floor(h), mm = Math.round((h-hh)*60);
  return String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0');
}

// ---------------------------------------------------------------- path helpers
function pathPoints(o){ return [{x:o.x,y:o.y}, ...o.path]; }
function tangentAt(pts, i){
  const a = pts[Math.max(0, i-1)], b = pts[Math.min(pts.length-1, i+1)];
  return Math.atan2(b.y-a.y, b.x-a.x);
}
function prot(o, i){ // effective rotation of path point i (index into o.path)
  const p = o.path[i];
  return (p.rot === undefined || p.rot === null) ? tangentAt(pathPoints(o), i+1) : p.rot;
}
function tracePath(pts, straight){
  ctx.moveTo(pts[0].x, pts[0].y);
  if(straight || pts.length < 3){
    for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
    return;
  }
  for(let i=0;i<pts.length-1;i++){
    const p0 = pts[Math.max(0,i-1)], p1 = pts[i], p2 = pts[i+1], p3 = pts[Math.min(pts.length-1,i+2)];
    ctx.bezierCurveTo(p1.x+(p2.x-p0.x)/6, p1.y+(p2.y-p0.y)/6, p2.x-(p3.x-p1.x)/6, p2.y-(p3.y-p1.y)/6, p2.x, p2.y);
  }
}
function samplePath(pts, straight, step){ // → [{x,y,ang}]
  const out = [];
  const push = (x,y)=>out.push({x,y,ang:0});
  if(straight || pts.length < 3){
    for(let i=0;i<pts.length-1;i++){
      const a=pts[i], b=pts[i+1], L=dist(a.x,a.y,b.x,b.y), n=Math.max(1,Math.round(L/step));
      for(let k=(i===0?0:1);k<=n;k++) push(a.x+(b.x-a.x)*k/n, a.y+(b.y-a.y)*k/n);
    }
  } else {
    for(let i=0;i<pts.length-1;i++){
      const p0=pts[Math.max(0,i-1)], p1=pts[i], p2=pts[i+1], p3=pts[Math.min(pts.length-1,i+2)];
      const c1x=p1.x+(p2.x-p0.x)/6, c1y=p1.y+(p2.y-p0.y)/6;
      const c2x=p2.x-(p3.x-p1.x)/6, c2y=p2.y-(p3.y-p1.y)/6;
      const L=dist(p1.x,p1.y,p2.x,p2.y), n=Math.max(2,Math.round(L/step));
      for(let k=(i===0?0:1);k<=n;k++){
        const t=k/n, u=1-t;
        push(u*u*u*p1.x+3*u*u*t*c1x+3*u*t*t*c2x+t*t*t*p2.x,
             u*u*u*p1.y+3*u*u*t*c1y+3*u*t*t*c2y+t*t*t*p2.y);
      }
    }
  }
  for(let i=0;i<out.length;i++){
    const a=out[Math.max(0,i-1)], b=out[Math.min(out.length-1,i+1)];
    out[i].ang = Math.atan2(b.y-a.y, b.x-a.x);
  }
  return out;
}
function trackCentroid(o){
  let x=0,y=0; o.pts.forEach(p=>{x+=p.x;y+=p.y;});
  o.x = x/o.pts.length; o.y = y/o.pts.length;
}

// ---------------------------------------------------------------- rendering
let dpr = 1;
function resize(){
  dpr = window.devicePixelRatio || 1;
  cv.width = wrap.clientWidth * dpr;
  cv.height = wrap.clientHeight * dpr;
  render();
}
window.addEventListener('resize', resize);

function render(){
  if(!project) return;
  const shot = activeShot();
  drawShot = shot;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);

  const g = 50, gs = g * view.scale;
  if(gs > 11){
    ctx.fillStyle = 'rgba(60,58,52,.13)';
    const ox = (-view.x % g + g) % g * view.scale;
    const oy = (-view.y % g + g) % g * view.scale;
    for(let x = ox; x < W; x += gs)
      for(let y = oy; y < H; y += gs){ ctx.fillRect(x-1, y-1, 2, 2); }
  }

  ctx.setTransform(dpr*view.scale, 0, 0, dpr*view.scale, -view.x*view.scale*dpr, -view.y*view.scale*dpr);
  for(const o of shot.objects) if(o.cat==='image' && o.underlay) drawObject(o); // map / recce underlays first
  drawWalls(shot);
  for(const o of shot.objects) if(o.path && o.path.length && o.kind!=='track') drawPath(o);
  framePoses = {};
  const animT = (typeof anim !== 'undefined' && anim.playing) ? animProgress() : 0;
  for(const o of shot.objects){
    if(o.cat==='image' && o.underlay) continue;
    drawObject((typeof anim !== 'undefined' && anim.playing) ? poseOf(o, shot, animT) : o);
  }
  drawSun(shot);
  drawSelection(shot);
  drawToolPreview();

  ctx.setTransform(dpr,0,0,dpr,0,0);
  if(!BOARD_TABS.has(activeTab)) drawRuler(W, H);

  updateSelBarPos();
  positionNoteEditor();
}

function drawRuler(W, H){
  const steps = [25,50,100,200,500,1000,2000,5000];
  let L = steps.find(s => s*view.scale >= 70);
  if(!L) L = 10000;
  const px = L*view.scale;
  if(px > 260) return;
  const y = H - 24, x0 = W/2 - px/2;
  ctx.strokeStyle = 'rgba(90,87,80,.75)'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x0, y); ctx.lineTo(x0+px, y);
  ctx.moveTo(x0, y-5); ctx.lineTo(x0, y+5);
  ctx.moveTo(x0+px, y-5); ctx.lineTo(x0+px, y+5);
  ctx.moveTo(x0+px/2, y-3); ctx.lineTo(x0+px/2, y+3);
  ctx.stroke();
  ctx.font = '10.5px -apple-system,Segoe UI,sans-serif';
  ctx.fillStyle = 'rgba(90,87,80,.85)';
  ctx.textAlign = 'center';
  ctx.fillText(L >= 100 ? (L/100)+' m' : L+' cm', x0+px/2, y-9);
  ctx.textAlign = 'left';
}

function drawWalls(shot){
  const T = 11;
  for(const wall of shot.walls){
    const {x1,y1,x2,y2} = wall;
    const L = dist(x1,y1,x2,y2); if(L < 1) continue;
    const dx=(x2-x1)/L, dy=(y2-y1)/L;
    const ops = (wall.openings||[]).map(o => ({...o, c:o.t*L})).sort((a,b)=>a.c-b.c);
    let cur = 0;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = WALL_COLOR;
    ctx.lineWidth = T;
    const segs = [];
    for(const o of ops){
      const a = clamp(o.c-o.w/2, 0, L), b = clamp(o.c+o.w/2, 0, L);
      if(a > cur) segs.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if(cur < L) segs.push([cur, L]);
    for(const [a,b] of segs){
      ctx.beginPath();
      ctx.moveTo(x1+dx*a, y1+dy*a);
      ctx.lineTo(x1+dx*b, y1+dy*b);
      ctx.stroke();
    }
    for(const o of ops){
      const cx = x1+dx*o.c, cy = y1+dy*o.c;
      const ang = Math.atan2(dy,dx);
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(ang);
      if(o.type === 'gap'){
        ctx.strokeStyle = WALL_COLOR; ctx.lineWidth = 2;
        ctx.globalAlpha = .45;
        ctx.beginPath();
        ctx.moveTo(-o.w/2, -T/2); ctx.lineTo(-o.w/2, T/2);
        ctx.moveTo(o.w/2, -T/2); ctx.lineTo(o.w/2, T/2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if(o.type === 'window'){
        ctx.strokeStyle = WALL_COLOR; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-o.w/2, -T/2+1); ctx.lineTo(o.w/2, -T/2+1);
        ctx.moveTo(-o.w/2, T/2-1); ctx.lineTo(o.w/2, T/2-1); ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-o.w/2, 0); ctx.lineTo(o.w/2, 0); ctx.stroke();
        if(o.curtain){
          ctx.save();
          if(o.flip) ctx.scale(1,-1);
          ctx.lineWidth = 1.6;
          const nSc = Math.max(3, Math.round(o.w/16));
          const step = o.w/nSc;
          ctx.beginPath();
          for(let i=0;i<nSc;i++){
            ctx.arc(-o.w/2 + i*step + step/2, -T/2-3, step/2, Math.PI, 0, false);
          }
          ctx.stroke();
          ctx.restore();
        }
      } else {
        const s = o.flip ? -1 : 1;
        ctx.strokeStyle = WALL_COLOR; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-o.w/2, 0); ctx.lineTo(-o.w/2, -s*o.w); ctx.stroke();
        ctx.lineWidth = 1.3; ctx.setLineDash([4,4]);
        ctx.beginPath(); ctx.arc(-o.w/2, 0, o.w, s>0 ? -Math.PI/2 : 0, s>0 ? 0 : Math.PI/2);
        ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.restore();
    }
  }
}

function drawTrack(o, ghost){
  if(!o.pts || o.pts.length < 2) return;
  const smp = samplePath(o.pts, false, 12);
  const G = 13; // half rail gauge
  ctx.save();
  if(ghost) ctx.globalAlpha = .32;
  ctx.strokeStyle = o.color; ctx.lineWidth = 3; ctx.lineCap='round';
  for(const side of [-1,1]){
    ctx.beginPath();
    smp.forEach((p,i)=>{
      const nx = -Math.sin(p.ang)*G*side, ny = Math.cos(p.ang)*G*side;
      i ? ctx.lineTo(p.x+nx, p.y+ny) : ctx.moveTo(p.x+nx, p.y+ny);
    });
    ctx.globalAlpha = ghost ? .32 : .85; ctx.stroke();
  }
  // sleepers
  ctx.lineWidth = 2; ctx.globalAlpha = ghost ? .2 : .45;
  let acc = 0;
  for(let i=1;i<smp.length;i++){
    acc += dist(smp[i-1].x,smp[i-1].y,smp[i].x,smp[i].y);
    if(acc >= 38){
      acc = 0;
      const p = smp[i];
      const nx = -Math.sin(p.ang)*(G+7), ny = Math.cos(p.ang)*(G+7);
      ctx.beginPath(); ctx.moveTo(p.x-nx,p.y-ny); ctx.lineTo(p.x+nx,p.y+ny); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawSun(shot){
  const s = shot.sun;
  if(!s || !s.on) return;
  const nA = northAngle(s);
  const v = sunVec(s.hour, nA);
  const dx = -v.x, dy = -v.y; // direction light travels (shadow direction)
  ctx.save();
  // light arrows
  ctx.strokeStyle = '#E2A93B'; ctx.fillStyle = '#E2A93B';
  ctx.lineWidth = 2/Math.max(view.scale,.35);
  ctx.setLineDash([10/view.scale, 8/view.scale]);
  for(const k of [-1,0,1]){
    const px = -dy*k*70, py = dx*k*70;
    const x0 = s.x + dx*36 + px, y0 = s.y + dy*36 + py;
    const x1 = x0 + dx*330, y1 = y0 + dy*330;
    ctx.globalAlpha = .4;
    ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
    drawArrowHead(x1, y1, Math.atan2(dy,dx), '#E2A93B');
  }
  ctx.setLineDash([]);
  // disc + rays
  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(s.x, s.y, 20, 0, 7);
  ctx.fillStyle = '#E2A93B'; ctx.globalAlpha=.92; ctx.fill(); ctx.globalAlpha=1;
  ctx.strokeStyle = '#C98A17'; ctx.lineWidth = 2;
  for(let i=0;i<8;i++){ const a=i*Math.PI/4;
    ctx.beginPath(); ctx.moveTo(s.x+Math.cos(a)*25, s.y+Math.sin(a)*25);
    ctx.lineTo(s.x+Math.cos(a)*31, s.y+Math.sin(a)*31); ctx.stroke(); }
  // hour label
  const fs = 12/Math.max(view.scale,.35);
  ctx.font = `600 ${fs}px -apple-system,Segoe UI,sans-serif`;
  ctx.textAlign='center';
  ctx.fillStyle = '#8a6612';
  ctx.fillText(formatHour(s.hour), s.x, s.y + 34 + fs);
  // north indicator (rotatable — drag its handle to re-orient the map)
  const nx = Math.cos(nA), ny = Math.sin(nA);
  ctx.globalAlpha = .55;
  ctx.strokeStyle = '#8A877F'; ctx.lineWidth = 1.6/Math.max(view.scale,.35);
  ctx.beginPath(); ctx.moveTo(s.x+nx*40, s.y+ny*40); ctx.lineTo(s.x+nx*58, s.y+ny*58); ctx.stroke();
  ctx.save(); ctx.translate(s.x+nx*60, s.y+ny*60); ctx.rotate(nA);
  ctx.beginPath(); ctx.moveTo(-8,-4); ctx.lineTo(0,0); ctx.lineTo(-8,4); ctx.stroke();
  ctx.restore();
  ctx.fillStyle='#8A877F';
  ctx.font = `${fs*.85}px -apple-system,Segoe UI,sans-serif`;
  ctx.fillText('N', s.x+nx*72, s.y+ny*72+fs*.3);
  ctx.globalAlpha = 1;
  ctx.textAlign='left';
  ctx.restore();
}

function drawObjectShape(o, ghost){
  if(o.kind === 'track'){ drawTrack(o, ghost); return; }
  if(o.cat === 'note'){
    ctx.save();
    ctx.translate(o.x, o.y); ctx.rotate(o.rot);
    if(ghost) ctx.globalAlpha = .32;
    drawNoteShape(ctx, o, noteEditor && noteEditor.id === o.id);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(o.x, o.y); ctx.rotate(o.rot);
  ctx.lineWidth = 2;
  if(ghost) ctx.globalAlpha = .32;
  if(o.cat === 'camera'){
    ctx.save(); ctx.globalAlpha = ghost ? .09 : .13;
    ctx.beginPath(); ctx.moveTo(0,0);
    ctx.arc(0,0,o.range, -rad(o.fov/2), rad(o.fov/2));
    ctx.closePath(); ctx.fillStyle = o.color; ctx.fill();
    ctx.restore();
    ctx.save(); ctx.globalAlpha = ghost ? .22 : .55;
    ctx.strokeStyle = o.color; ctx.lineWidth = 1.4; ctx.setLineDash([6,5]);
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(-rad(o.fov/2))*o.range, Math.sin(-rad(o.fov/2))*o.range);
    ctx.moveTo(0,0); ctx.lineTo(Math.cos(rad(o.fov/2))*o.range, Math.sin(rad(o.fov/2))*o.range);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,o.range,-rad(o.fov/2),rad(o.fov/2)); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
    drawCameraKind(ctx, o.kind, o.w, o.h, o.color);
  } else if(o.cat === 'actor'){
    drawActorIcon(ctx, o.w, o.h, o.color, o.kind);
  } else if(o.cat === 'text'){
    const fs = o.fontSize || 18, lh = fs*1.32;
    ctx.font = noteFont(o, 18);
    ctx.textBaseline = 'top';
    ctx.fillStyle = (o.color === '#5B6472') ? '#33322E' : o.color;
    const lines = wrapCanvasText(ctx, o.text||'', Math.max(40, o.w-4));
    o.h = Math.max(fs*1.4, lines.length*lh);
    if(!(noteEditor && noteEditor.id === o.id)){
      lines.forEach((l,i)=> ctx.fillText(l, -o.w/2+2, -o.h/2 + i*lh));
      if(!o.text){
        ctx.globalAlpha=.4;
        ctx.fillText('Double-click to type…', -o.w/2+2, -o.h/2);
        ctx.globalAlpha=1;
      }
    }
    ctx.textBaseline='alphabetic';
  } else if(o.cat === 'line'){
    const p1={x:o.p1.x-o.x, y:o.p1.y-o.y}, p2={x:o.p2.x-o.x, y:o.p2.y-o.y};
    ctx.strokeStyle=o.color; ctx.lineWidth=o.weight||2.5; ctx.lineCap='round';
    if(o.dashed) ctx.setLineDash([(o.weight||2.5)*3.2, (o.weight||2.5)*2.6]);
    ctx.beginPath(); ctx.moveTo(p1.x,p1.y);
    let endAng;
    if(o.mid){
      // curve passes through the mid handle: control = 2*mid - (p1+p2)/2
      const m={x:o.mid.x-o.x, y:o.mid.y-o.y};
      const cx=2*m.x-(p1.x+p2.x)/2, cy=2*m.y-(p1.y+p2.y)/2;
      ctx.quadraticCurveTo(cx, cy, p2.x, p2.y);
      endAng = Math.atan2(p2.y-cy, p2.x-cx);
    } else {
      ctx.lineTo(p2.x, p2.y);
      endAng = Math.atan2(p2.y-p1.y, p2.x-p1.x);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if(o.arrow){
      const sA=(o.weight||2.5)*4+6;
      ctx.save(); ctx.translate(p2.x,p2.y); ctx.rotate(endAng);
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-sA,-sA*.5); ctx.lineTo(-sA,sA*.5); ctx.closePath();
      ctx.fillStyle=o.color; ctx.fill(); ctx.restore();
    }
  } else if(o.cat === 'link'){
    const disp = (o.label && o.label !== 'Link') ? o.label : (shortUrl(o.url) || 'Link');
    const thumb = o.imgId ? imgCache[o.imgId] : null;
    if(thumb && thumb.complete && thumb.naturalWidth){
      const stripH = 26;
      ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
      ctx.fillStyle='#fff'; ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.clip();
      ctx.drawImage(thumb, -o.w/2, -o.h/2, o.w, o.h-stripH);
      ctx.fillStyle='#fff';
      ctx.fillRect(-o.w/2, o.h/2-stripH, o.w, stripH);
      ctx.beginPath(); ctx.arc(0, -stripH/2, 15, 0, 7);
      ctx.fillStyle='rgba(20,19,17,.55)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-4,-stripH/2-6); ctx.lineTo(8,-stripH/2); ctx.lineTo(-4,-stripH/2+6); ctx.closePath();
      ctx.fillStyle='#fff'; ctx.fill();
      ctx.font='600 11.5px -apple-system,Segoe UI,sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle=shade(o.color,.7);
      ctx.fillText(trimText(ctx, disp+'  \u2197', o.w-16), 0, o.h/2-stripH/2+1);
      ctx.restore();
      ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
      ctx.strokeStyle=o.color; ctx.lineWidth=1.6; ctx.stroke();
      ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    } else {
      ctx.font='600 13px -apple-system,Segoe UI,sans-serif';
      const disp2 = trimText(ctx, disp+'  \u2197', 380);
      const needW = ctx.measureText(disp2).width + 26;
      o.w = Math.max(80, needW); o.h = 34;
      ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,o.h/2);
      ctx.fillStyle='#fff'; ctx.fill();
      ctx.fillStyle=o.color; ctx.globalAlpha=.14; ctx.fill(); ctx.globalAlpha=1;
      ctx.strokeStyle=o.color; ctx.lineWidth=1.6; ctx.stroke();
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle=shade(o.color,.7);
      ctx.fillText(disp2, 0, 1);
      ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    }
  } else if(o.cat === 'ink'){
    const pts=o.pts||[];
    if(pts.length>1){
      ctx.strokeStyle=o.color; ctx.lineWidth=o.weight||3;
      ctx.lineCap='round'; ctx.lineJoin='round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x-o.x, pts[0].y-o.y);
      for(let i=1;i<pts.length-1;i++){
        const mx=(pts[i].x+pts[i+1].x)/2-o.x, my=(pts[i].y+pts[i+1].y)/2-o.y;
        ctx.quadraticCurveTo(pts[i].x-o.x, pts[i].y-o.y, mx, my);
      }
      const lp=pts[pts.length-1];
      ctx.lineTo(lp.x-o.x, lp.y-o.y);
      ctx.stroke();
    }
  } else if(o.cat === 'infocard'){
    drawInfoCard(ctx, o);
  } else if(o.cat === 'audio'){
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#D8D5CF'; ctx.lineWidth = 1.5; ctx.stroke();
    const playing = (typeof audioPlayingId !== 'undefined') && audioPlayingId === o.id;
    // play / pause disc
    const px = -o.w/2 + 30;
    ctx.beginPath(); ctx.arc(px, 0, 16, 0, 7);
    ctx.fillStyle = o.color; ctx.fill();
    ctx.fillStyle = '#fff';
    if(playing){
      ctx.fillRect(px-5.5, -6, 4, 12);
      ctx.fillRect(px+1.5, -6, 4, 12);
    } else {
      ctx.beginPath(); ctx.moveTo(px-4, -6.5); ctx.lineTo(px+7, 0); ctx.lineTo(px-4, 6.5); ctx.closePath(); ctx.fill();
    }
    o._playZone = {x1:o.x+px-18, x2:o.x+px+18};
    ctx.textBaseline = 'middle';
    ctx.font = '600 12.5px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#33322E';
    ctx.fillText(trimText(ctx, o.name||'Audio', o.w-140), -o.w/2+56, -8);
    ctx.font = '11px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#8A877F';
    ctx.fillText((o.size ? Math.round(o.size/1024/102.4)/10 + ' MB \u00b7 ' : '') + (playing ? 'playing\u2026 tap to stop' : 'tap \u25b8 to play'), -o.w/2+56, 10);
    // little waveform
    ctx.strokeStyle = o.color; ctx.globalAlpha = .55; ctx.lineWidth = 2; ctx.lineCap='round';
    const bx = o.w/2 - 58;
    for(let i2=0;i2<7;i2++){
      const bh = [6,12,8,15,7,11,5][i2] * (playing ? 1 : .7);
      ctx.beginPath(); ctx.moveTo(bx + i2*7, -bh/2); ctx.lineTo(bx + i2*7, bh/2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  } else if(o.cat === 'weather'){
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
    ctx.fillStyle='#fff'; ctx.fill();
    ctx.strokeStyle='#D8D5CF'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.fillStyle = o.color; ctx.fillRect(-o.w/2, -o.h/2, o.w, 5);
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-o.w/2+2,-o.h/2+2,o.w-4,o.h-4,2); ctx.clip();
    ctx.textBaseline='top';
    ctx.font='700 10px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle='#8A877F';
    ctx.fillText('W E A T H E R', -o.w/2+13, -o.h/2+14);
    ctx.font='700 13.5px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle='#33322E';
    ctx.fillText(trimText(ctx, o.place || 'Set place & date \u2192', o.w-26), -o.w/2+13, -o.h/2+29);
    ctx.font='11.5px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle='#8A877F';
    if(o.date) ctx.fillText(o.date, -o.w/2+13, -o.h/2+48);
    let y = -o.h/2 + 70;
    for(const [k,v] of (o.data||[])){
      ctx.font='700 9.5px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle='#8A877F';
      ctx.fillText(k.toUpperCase(), -o.w/2+13, y);
      ctx.font='12px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle='#33322E';
      ctx.fillText(trimText(ctx, String(v), o.w-26), -o.w/2+13, y+12);
      y += 31;
    }
    if(!(o.data||[]).length && o.place){
      ctx.font='11.5px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle='#B9B6AE';
      ctx.fillText('Select \u2192 Fetch forecast', -o.w/2+13, -o.h/2+70);
    }
    ctx.restore();
    ctx.textBaseline='alphabetic';
  } else if(o.cat === 'colorcard'){
    const strip = 34;
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.clip();
    ctx.fillStyle = o.hex || '#E8604C';
    ctx.fillRect(-o.w/2, -o.h/2, o.w, o.h - strip);
    ctx.fillStyle = '#33322E';
    ctx.font = '700 12px -apple-system,Segoe UI,sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText((o.hex||'').toUpperCase(), -o.w/2+10, o.h/2 - strip/2);
    if(o.label){
      ctx.font = '400 11.5px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = '#8A877F';
      ctx.textAlign = 'right';
      ctx.fillText(trimText(ctx, o.label, o.w/2 - 14), o.w/2-10, o.h/2 - strip/2);
      ctx.textAlign = 'left';
    }
    ctx.restore();
    ctx.strokeStyle = '#D8D5CF'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.stroke();
    ctx.textBaseline = 'alphabetic';
  } else if(o.cat === 'todo'){
    o.items = o.items || [];
    const rowH = 32, pad = 10, top = o.label ? 36 : 8;
    o.h = Math.max(56, top + o.items.length*rowH + 8);
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#D8D5CF'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textBaseline = 'middle';
    if(o.label && !(noteEditor && noteEditor.id===o.id && noteEditor.field==='todo')){
      ctx.font = '700 13px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = '#33322E';
      ctx.fillText(o.label, -o.w/2+pad+2, -o.h/2 + 19);
    }
    const bulkEditing = noteEditor && noteEditor.id===o.id && noteEditor.field==='todo';
    o.items.forEach((it, i2)=>{
      const yTop = -o.h/2 + top + i2*rowH;
      const y = yTop + rowH/2;
      // cell
      ctx.fillStyle = i2 % 2 ? '#FAFAF8' : '#fff';
      ctx.fillRect(-o.w/2+3, yTop, o.w-6, rowH);
      ctx.strokeStyle = '#EDEBE6'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-o.w/2+3, yTop+rowH); ctx.lineTo(o.w/2-3, yTop+rowH); ctx.stroke();
      if(bulkEditing) return;
      // checkbox
      ctx.strokeStyle = it.done ? o.color : '#B9B6AE';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.roundRect(-o.w/2+pad, y-8, 16, 16, 2);
      if(it.done){
        ctx.fillStyle = o.color; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(-o.w/2+pad+4, y); ctx.lineTo(-o.w/2+pad+7.2, y+3.6); ctx.lineTo(-o.w/2+pad+12.4, y-3.8); ctx.stroke();
      } else ctx.stroke();
      // text (skip the row being edited inline)
      if(noteEditor && noteEditor.id===o.id && noteEditor.field==='item:'+i2) return;
      ctx.font = '12.5px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = it.done ? '#B9B6AE' : '#33322E';
      const tx = trimText(ctx, it.t || '', o.w - pad*2 - 28);
      ctx.fillText(tx, -o.w/2+pad+26, y+.5);
      if(it.done && tx){
        const tw = ctx.measureText(tx).width;
        ctx.strokeStyle = '#B9B6AE'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-o.w/2+pad+26, y); ctx.lineTo(-o.w/2+pad+26+tw, y); ctx.stroke();
      }
    });
    if(!o.items.length && !bulkEditing){
      ctx.font = '12px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = 'rgba(74,70,54,.4)';
      ctx.fillText('Double-click to add an item\u2026', -o.w/2+pad, 0);
    }
    ctx.textBaseline = 'alphabetic';
  } else if(o.cat === 'table'){
    o.cells = (o.cells && o.cells.length) ? o.cells : [['',''],['','']];
    const nR = o.cells.length, nC = o.cells[0].length;
    const headH = 30, rowH = 28;
    // columns size themselves to content
    const ws = [];
    for(let c=0;c<nC;c++){
      let mw = 90;
      for(let r=0;r<nR;r++){
        ctx.font = (r===0 ? '700 ' : '') + '12px -apple-system,Segoe UI,sans-serif';
        mw = Math.max(mw, ctx.measureText(o.cells[r][c]||'').width + 20);
      }
      ws.push(Math.min(280, mw));
    }
    o._colWs = ws;
    o.w = ws.reduce((a,b)=>a+b, 0);
    o.h = headH + (nR-1)*rowH;
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.clip();
    ctx.fillStyle = o.color; ctx.globalAlpha = .14;
    ctx.fillRect(-o.w/2, -o.h/2, o.w, headH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#E5E3DE'; ctx.lineWidth = 1;
    let cx0 = -o.w/2;
    for(let c=0;c<nC-1;c++){
      cx0 += ws[c];
      ctx.beginPath(); ctx.moveTo(cx0, -o.h/2); ctx.lineTo(cx0, o.h/2); ctx.stroke();
    }
    for(let r=1;r<nR;r++){
      const y = -o.h/2 + headH + (r-1)*rowH;
      ctx.beginPath(); ctx.moveTo(-o.w/2, y); ctx.lineTo(o.w/2, y); ctx.stroke();
    }
    ctx.textBaseline = 'middle';
    for(let r=0;r<nR;r++){
      let x0 = -o.w/2;
      for(let c=0;c<nC;c++){
        if(!(noteEditor && noteEditor.id===o.id && noteEditor.field==='cell:'+r+':'+c)){
          ctx.font = (r===0 ? '700 ' : '') + '12px -apple-system,Segoe UI,sans-serif';
          ctx.fillStyle = r===0 ? '#33322E' : '#4A4636';
          const cy = r===0 ? -o.h/2 + headH/2 : -o.h/2 + headH + (r-1)*rowH + rowH/2;
          ctx.fillText(trimText(ctx, o.cells[r][c]||'', ws[c]-16), x0 + 8, cy);
        }
        x0 += ws[c];
      }
    }
    ctx.restore();
    ctx.strokeStyle = '#D8D5CF'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.stroke();
    // add-row / add-column chips when selected
    if(sel && sel.type==='object' && sel.id===o.id && !ghost){
      ctx.font = '700 13px -apple-system,Segoe UI,sans-serif';
      ctx.textAlign = 'center';
      for(const [px, py, key] of [[0, o.h/2+15, '_plusRow'], [o.w/2+15, 0, '_plusCol']]){
        ctx.beginPath(); ctx.arc(px, py, 10, 0, 7);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = '#B9B6AE'; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.fillStyle = '#8A877F';
        ctx.fillText('+', px, py+1);
        o[key] = {x:o.x+px, y:o.y+py, r:14};
      }
      ctx.textAlign = 'left';
    } else { o._plusRow = null; o._plusCol = null; }
    ctx.textBaseline = 'alphabetic';
  } else if(o.cat === 'file'){
    const thumb = o.imgId ? imgCache[o.imgId] : null;
    if(thumb && thumb.complete && thumb.naturalWidth){
      // preview card: first page on top, name strip below
      const stripH = 30;
      ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
      ctx.fillStyle='#fff'; ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.clip();
      const ar = thumb.naturalWidth/thumb.naturalHeight, fr = o.w/(o.h-stripH);
      let dw = o.w, dh = o.h-stripH;
      if(ar > fr) dh = o.w/ar; else dw = (o.h-stripH)*ar;
      ctx.drawImage(thumb, -dw/2, -o.h/2 + (o.h-stripH-dh)/2, dw, dh);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-o.w/2, o.h/2-stripH, o.w, stripH);
      ctx.strokeStyle = '#EDEBE6'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-o.w/2, o.h/2-stripH); ctx.lineTo(o.w/2, o.h/2-stripH); ctx.stroke();
      ctx.font = '600 11px -apple-system,Segoe UI,sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle = '#33322E';
      ctx.fillText(trimText(ctx, o.name||'File', o.w-16), 0, o.h/2 - stripH/2 + 1);
      ctx.restore();
      ctx.strokeStyle = '#D8D5CF'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.stroke();
      ctx.textAlign='left'; ctx.textBaseline='alphabetic';
      return;
    }
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#D8D5CF'; ctx.lineWidth = 1.5; ctx.stroke();
    // doc icon with folded corner
    const ix = -o.w/2 + 14, iy = -14, iw2 = 26, ih2 = 32;
    ctx.beginPath();
    ctx.moveTo(ix, iy); ctx.lineTo(ix+iw2-9, iy); ctx.lineTo(ix+iw2, iy+9);
    ctx.lineTo(ix+iw2, iy+ih2); ctx.lineTo(ix, iy+ih2); ctx.closePath();
    ctx.fillStyle = o.color; ctx.globalAlpha = .18; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = o.color; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ix+iw2-9, iy); ctx.lineTo(ix+iw2-9, iy+9); ctx.lineTo(ix+iw2, iy+9); ctx.stroke();
    const ext = ((o.name||'').split('.').pop()||'').slice(0,4).toUpperCase();
    ctx.font = '700 8px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = shade(o.color,.7);
    ctx.textAlign = 'center';
    ctx.fillText(ext, ix+iw2/2, iy+ih2-8);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '600 12.5px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#33322E';
    ctx.fillText(trimText(ctx, o.name||'File', o.w - 70), ix + iw2 + 12, -8);
    ctx.font = '11px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#8A877F';
    ctx.fillText((o.size ? Math.round(o.size/1024) + ' KB \u00b7 ' : '') + 'select \u2192 Download', ix + iw2 + 12, 10);
    ctx.textBaseline = 'alphabetic';
  } else if(o.cat === 'script'){
    const fs = o.fontSize || 12.5, lh = fs*1.5, pad = 18, headH = o.mode==='av' ? 30 : 12;
    ctx.font = fs + 'px ui-monospace,Menlo,monospace';
    const colW = o.mode==='av' ? o.w/2 - pad*1.5 : o.w - pad*2;
    const linesL = wrapCanvasText(ctx, o.text || '', colW);
    const linesR = o.mode==='av' ? wrapCanvasText(ctx, o.textR || '', colW) : [];
    o.h = Math.max(220, headH + Math.max(linesL.length, linesR.length)*lh + pad*2);
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#D8D5CF'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-o.w/2+2,-o.h/2+2,o.w-4,o.h-4,9); ctx.clip();
    ctx.textBaseline = 'top';
    const editL = noteEditor && noteEditor.id===o.id && noteEditor.field==='text';
    const editR = noteEditor && noteEditor.id===o.id && noteEditor.field==='textR';
    if(o.mode === 'av'){
      ctx.strokeStyle = '#E5E3DE'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -o.h/2+headH-4); ctx.lineTo(0, o.h/2); ctx.stroke();
      ctx.font = '700 10px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = '#8A877F';
      ctx.fillText('V I D E O', -o.w/2+pad, -o.h/2+10);
      ctx.fillText('A U D I O', pad/2, -o.h/2+10);
    }
    ctx.font = fs + 'px ui-monospace,Menlo,monospace';
    ctx.fillStyle = '#33322E';
    if(!editL) linesL.forEach((l,i)=> ctx.fillText(l, -o.w/2+pad, -o.h/2+headH+pad*.6 + i*lh));
    if(o.mode==='av' && !editR) linesR.forEach((l,i)=> ctx.fillText(l, pad/2, -o.h/2+headH+pad*.6 + i*lh));
    if(!o.text && !editL){
      ctx.fillStyle = 'rgba(74,70,54,.4)';
      ctx.fillText('Double-click to write\u2026', -o.w/2+pad, -o.h/2+headH+pad*.6);
    }
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  } else if(o.cat === 'sbrow'){
    const z1 = o.w*.28, z2 = o.w*.30; // title | image | shot description
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#D8D5CF'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.clip();
    ctx.strokeStyle = '#E5E3DE'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-o.w/2+z1, -o.h/2); ctx.lineTo(-o.w/2+z1, o.h/2);
    ctx.moveTo(-o.w/2+z1+z2, -o.h/2); ctx.lineTo(-o.w/2+z1+z2, o.h/2);
    ctx.stroke();
    // accent stripe
    ctx.fillStyle = o.color; ctx.fillRect(-o.w/2, -o.h/2, 5, o.h);
    ctx.textBaseline = 'top';
    // title zone
    if(!(noteEditor && noteEditor.id===o.id && noteEditor.field==='title')){
      ctx.font = '700 13px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = '#33322E';
      wrapCanvasText(ctx, o.title || 'Scene', z1-24).slice(0,2)
        .forEach((l,i)=> ctx.fillText(l, -o.w/2+14, -o.h/2+12 + i*17));
    }
    const sc0 = o.sceneId && project.scenes.find(x=>x.id===o.sceneId);
    ctx.font = '10.5px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#8A877F';
    ctx.fillText(sc0 ? '\u2192 board linked' : 'no board yet', -o.w/2+14, o.h/2-20);
    // image zone
    const imx = -o.w/2 + z1, imw = z2;
    const im = o.imgId ? imgCache[o.imgId] : null;
    if(im && im.complete && im.naturalWidth){
      const ar = im.naturalWidth/im.naturalHeight, fr = imw/o.h;
      let dw = imw, dh = o.h;
      if(ar > fr) dw = o.h*ar; else dh = imw/ar;
      ctx.save();
      ctx.beginPath(); ctx.rect(imx, -o.h/2, imw, o.h); ctx.clip();
      ctx.drawImage(im, imx + imw/2 - dw/2, -dh/2, dw, dh);
      ctx.restore();
    } else {
      ctx.strokeStyle = '#D8D5CF'; ctx.setLineDash([4,4]);
      ctx.strokeRect(imx+8, -o.h/2+8, imw-16, o.h-16);
      ctx.setLineDash([]);
      ctx.font = '11px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = '#B9B6AE';
      ctx.textAlign = 'center';
      ctx.fillText('+ reference', imx + imw/2, -6);
      ctx.textAlign = 'left';
    }
    o._sbImgZone = {x1:imx, x2:imx+imw};
    // shot description zone
    if(!(noteEditor && noteEditor.id===o.id && noteEditor.field==='desc')){
      ctx.font = '12px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = o.desc ? '#4A4636' : 'rgba(74,70,54,.4)';
      const dx = -o.w/2 + z1 + z2 + 12;
      wrapCanvasText(ctx, o.desc || 'Double-click for shot description\u2026', o.w - z1 - z2 - 24)
        .slice(0, Math.floor((o.h-20)/16))
        .forEach((l,i)=> ctx.fillText(l, dx, -o.h/2+12 + i*16));
    }
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  } else if(o.cat === 'image'){
    const im = imgCache[o.imgId];
    if(o.underlay) ctx.globalAlpha = ghost ? .18 : .55;
    if(o.caption && !o.underlay){
      ctx.font = '11.5px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = '#8A877F';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      wrapCanvasText(ctx, o.caption, o.w - 8).slice(0,2)
        .forEach((l,i)=> ctx.fillText(l, 0, o.h/2 + 7 + i*15));
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    if(im && im.complete && im.naturalWidth){
      ctx.drawImage(im, -o.w/2, -o.h/2, o.w, o.h);
      ctx.strokeStyle = 'rgba(40,38,32,.18)'; ctx.lineWidth = 1.5/Math.max(view.scale,.3);
      ctx.strokeRect(-o.w/2, -o.h/2, o.w, o.h);
    } else {
      ctx.fillStyle = '#E8E6E1';
      ctx.fillRect(-o.w/2, -o.h/2, o.w, o.h);
      ctx.fillStyle = '#8A877F';
      ctx.font = '13px -apple-system,Segoe UI,sans-serif'; ctx.textAlign='center';
      ctx.fillText('loading…', 0, 4);
      ctx.textAlign='left';
      if(!o._loading){ o._loading = true; loadStill(o.imgId).then(()=>{ o._loading=false; render(); }); }
    }
  } else {
    const def = o.kind.startsWith('custom:')
      ? (project.customProps.find(p=>p.id===o.kind.slice(7)) || {shape:'rect'})
      : null;
    (def ? PROPS.custom.draw : (PROPS[o.kind]||PROPS.custom).draw)(ctx, o.w, o.h, o.color, def);
  }
  ctx.restore();
  const chipText = !ghost && o.cat!=='note' && o.cat!=='text' && o.cat!=='link'
    ? (o.cat==='camera'
        ? [o.label, o.framing, o.support].filter(Boolean).join(' \u00b7 ')
        : o.label)
    : '';
  if(chipText){
    ctx.save();
    const fsc = Math.max(view.scale,.35);
    ctx.font = `600 ${12/fsc}px -apple-system,Segoe UI,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const baseOff = (o.cat==='line')
      ? (o.h/2 + 12/view.scale)
      : Math.max(o.w,o.h)/2 + 8/view.scale;
    const ax = o.x + (o.labelDX||0);
    const ay = o.y + baseOff + (o.labelDY||0);
    const tw = ctx.measureText(chipText).width;
    const p = 4/view.scale;
    const rW = tw + p*2, rH = 15/fsc + p;
    o._labelRect = {x:ax-tw/2-p, y:ay-p*.6, w:rW, h:rH};
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath(); ctx.roundRect(o._labelRect.x, o._labelRect.y, rW, rH, 4/view.scale); ctx.fill();
    ctx.fillStyle = shade(o.color,.7);
    ctx.fillText(chipText, ax, ay);
    ctx.restore();
  } else if(!ghost){
    o._labelRect = null;
  }
  // director's-viewfinder frame attached to a camera
  if(o.cat === 'camera' && o.imgId && !ghost){
    const im = imgCache[o.imgId];
    const FW = 132, FH = 78, B = 4;
    const fx = o.x + (o.frameDX ?? 70);
    const fy = o.y + (o.frameDY ?? -85);
    ctx.save();
    // connector
    ctx.strokeStyle = o.color; ctx.globalAlpha = .5;
    ctx.lineWidth = 1.4/Math.max(view.scale,.3);
    ctx.setLineDash([4/view.scale, 4/view.scale]);
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    // white frame + image
    ctx.beginPath(); ctx.roundRect(fx-FW/2-B, fy-FH/2-B, FW+B*2, FH+B*2, 7);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = o.color; ctx.lineWidth = 1.6; ctx.stroke();
    if(im && im.complete && im.naturalWidth){
      ctx.save();
      ctx.beginPath(); ctx.roundRect(fx-FW/2, fy-FH/2, FW, FH, 4); ctx.clip();
      // cover-fit
      const ar = im.naturalWidth/im.naturalHeight, fr = FW/FH;
      let dw = FW, dh = FH;
      if(ar > fr) dw = FH*ar; else dh = FW/ar;
      ctx.drawImage(im, fx-dw/2, fy-dh/2, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = '#F2F1EE';
      ctx.fillRect(fx-FW/2, fy-FH/2, FW, FH);
    }
    o._frameRect = {x:fx-FW/2-B, y:fy-FH/2-B, w:FW+B*2, h:FH+B*2};
    ctx.restore();
  } else if(!ghost){
    o._frameRect = null;
  }
  if(!ghost && o.cat==='camera' && sel && sel.type==='object' && sel.id===o.id){
    ctx.save();
    ctx.font = `600 ${11/Math.max(view.scale,.35)}px -apple-system,Segoe UI,sans-serif`;
    ctx.textAlign='center';
    ctx.fillStyle = shade(o.color,.75);
    const tag = (o.lens ? o.lens+'mm · ' : '') + Math.round(o.fov) + '°';
    ctx.fillText(tag, o.x, o.y - Math.max(o.w,o.h)/2 - 34/view.scale);
    ctx.textAlign='left';
    ctx.restore();
  }
}
function drawObject(o){ drawObjectShape(o, false); }

function drawCranePath(o){
  const base0 = jibBasePos(o);
  const pts = [base0, ...o.path];
  ctx.save();
  ctx.strokeStyle = o.color; ctx.globalAlpha = .6;
  ctx.lineWidth = 2/Math.max(view.scale,.4);
  ctx.setLineDash([8/view.scale, 7/view.scale]);
  ctx.beginPath();
  pts.forEach((p,i)=> i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  for(const p of o.path){
    const len = p.len ?? armLen(o), rot = p.rot ?? o.rot;
    const gW = len + 0.72*o.h, lx = -gW/2 + o.h*.5;
    const g = {...o, w:gW, rot,
      x: p.x - lx*Math.cos(rot), y: p.y - lx*Math.sin(rot),
      path:[], rail:null, mount:null};
    drawObjectShape(g, true);
  }
}
function drawPath(o){
  if(isCrane(o)){ drawCranePath(o); return; }
  const pts = pathPoints(o);
  ctx.save();
  ctx.strokeStyle = o.color; ctx.globalAlpha = .75;
  ctx.lineWidth = 2/Math.max(view.scale,.4);
  ctx.setLineDash([8/view.scale, 7/view.scale]);
  ctx.beginPath();
  tracePath(pts, o.pathStraight);
  ctx.stroke();
  ctx.setLineDash([]);
  // direction arrows at segment midpoints (sampled so they sit on the curve)
  const smp = samplePath(pts, o.pathStraight, 16);
  if(smp.length > 2){
    const mid = smp[Math.floor(smp.length/2)];
    drawArrowHead(mid.x, mid.y, mid.ang, o.color);
  }
  const end = smp[smp.length-1];
  if(end) drawArrowHead(end.x, end.y, end.ang, o.color);
  ctx.restore();
  // ghost keyframe at every path point, with its own rotation / framing
  for(let i=0;i<o.path.length;i++){
    const p = o.path[i];
    const g = {...o, x:p.x, y:p.y, rot:prot(o,i), path:[]};
    if(o.cat === 'camera'){
      g.fov = (p.fov ?? o.fov);
      g.range = (p.range ?? o.range);
    }
    drawObjectShape(g, true);
  }
}
function drawArrowHead(x,y,ang,c){
  const s = 8/Math.max(view.scale,.4);
  ctx.save(); ctx.translate(x,y); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-s,-s*.55); ctx.lineTo(-s,s*.55); ctx.closePath();
  ctx.fillStyle = c; ctx.globalAlpha=.9; ctx.fill();
  ctx.restore();
}
