// FLOOR — 03-input.js
// Extracted from the original single-file build. All files share global scope
// (loaded as classic scripts, in order). True ES modules come with the build step later.
'use strict';
// ---------------------------------------------------------------- toast
function toast(msg){
  let t = document.getElementById('toast');
  if(!t){ t = document.createElement('div'); t.id='toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.remove('show'), 3200);
}

// ---------------------------------------------------------------- history (undo / redo)
let undoStack = [], redoStack = [];
let histBase = null, histPushed = false, histTimer = null;
function snapshotState(){
  return JSON.stringify({scenes:project.scenes, activeSceneId:project.activeSceneId,
    customProps:project.customProps, shootName:project.shootName||'',
    moodboard:project.moodboard||null, prodboard:project.prodboard||null,
    script:project.script||null, production:project.production||null});
}
function updateHistBtns(){
  const u = document.getElementById('undoBtn'), r = document.getElementById('redoBtn');
  if(u) u.disabled = !undoStack.length;
  if(r) r.disabled = !redoStack.length;
}
function histSettle(){
  histBase = snapshotState();
  histPushed = false;
  clearTimeout(histTimer); histTimer = null;
  updateHistBtns();
}
const persistOnly = markDirty; // original save-only version
markDirty = function(){
  if(histBase !== null && !histPushed){
    undoStack.push(histBase);
    if(undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
    histPushed = true;
    updateHistBtns();
  }
  clearTimeout(histTimer);
  histTimer = setTimeout(histSettle, 750);
  persistOnly();
};
function applyState(s){
  const p = JSON.parse(s);
  project.scenes = p.scenes || p.shots; // tolerate pre-rename snapshots
  project.activeSceneId = p.activeSceneId ?? p.activeShotId;
  if(p.moodboard !== undefined) project.moodboard = p.moodboard;
  if(p.prodboard !== undefined) project.prodboard = p.prodboard;
  if(p.script !== undefined && p.script !== null) project.script = p.script;
  if(p.production !== undefined && p.production !== null) project.production = p.production;
  project.customProps = p.customProps || [];
  project.shootName = p.shootName || '';
  if(!project.scenes.length){ project.scenes = [newShot(1)]; }
  if(!project.scenes.find(x=>x.id===project.activeSceneId)) project.activeSceneId = project.scenes[0].id;
  project.scenes.forEach(migrateShot);
  sel = null; drag = null; hoverWall = null;
  togglePlay(false);
  closeNoteEditor(false);
  buildShotList(); buildLibrary(); syncTitle(); buildStills(); buildInfo(); refreshSelBar(); syncSunBtn();
  ensureShotImages(activeShot(), false).then(render);
  render();
  histSettle();
  persistOnly();
}
function undo(){
  if(!undoStack.length) return;
  redoStack.push(snapshotState());
  applyState(undoStack.pop());
}
function redo(){
  if(!redoStack.length) return;
  undoStack.push(snapshotState());
  applyState(redoStack.pop());
}
document.getElementById('undoBtn').addEventListener('click', undo);
document.getElementById('redoBtn').addEventListener('click', redo);

// ---------------------------------------------------------------- jib / crane articulation & camera mounts
function isCrane(o){ return o && (o.kind === 'jib' || o.kind === 'technocrane'); }
function armLen(o){ return Math.max(60, o.w - 0.72*o.h); }
function trackSamplesWithLen(t){
  const smp = samplePath(t.pts, false, 10);
  const cum = [0];
  for(let i=1;i<smp.length;i++) cum.push(cum[i-1] + dist(smp[i-1].x,smp[i-1].y,smp[i].x,smp[i].y));
  return {smp, cum, total:cum[cum.length-1]};
}
function sampleAtDist(smp, cum, d){
  if(d <= 0) return smp[0];
  if(d >= cum[cum.length-1]) return smp[smp.length-1];
  let i = 1;
  while(cum[i] < d) i++;
  const t = (d - cum[i-1]) / Math.max(1e-6, cum[i] - cum[i-1]);
  return {x: smp[i-1].x + (smp[i].x - smp[i-1].x)*t,
          y: smp[i-1].y + (smp[i].y - smp[i-1].y)*t};
}
// keeps a rail-mounted crane's base on its track at rail.d, recomputes the
// center from the current arm rotation/length, and rebuilds the auto-path
// (remaining travel toward the far end) so ghosts show the planned ride.
function updateJibRail(jib, shot){
  if(!jib.rail) return;
  const t = shot.objects.find(x=>x.id===jib.rail.id && x.kind==='track');
  if(!t || !t.pts || t.pts.length < 2){ jib.rail = null; return; }
  const {smp, cum, total} = trackSamplesWithLen(t);
  jib.rail.d = clamp(jib.rail.d, 0, total);
  const base = sampleAtDist(smp, cum, jib.rail.d);
  const lx = -jib.w/2 + jib.h*.5;
  jib.x = base.x - lx*Math.cos(jib.rot);
  jib.y = base.y - lx*Math.sin(jib.rot);
  // auto movement path along the remaining track
  const dir = jib.rail.dir || 1;
  const target = dir > 0 ? total : 0;
  const path = [];
  const span = Math.abs(target - jib.rail.d);
  if(span > 40){
    const step = 90;
    for(let d = jib.rail.d + dir*step; dir>0 ? d < target : d > target; d += dir*step){
      const p = sampleAtDist(smp, cum, d);
      path.push({x:p.x, y:p.y, rot:jib.rot, len:armLen(jib)});
    }
    const pe = sampleAtDist(smp, cum, target);
    path.push({x:pe.x, y:pe.y, rot:jib.rot, len:armLen(jib)});
  }
  jib.path = path;
  jib.pathStraight = false;
  syncMounts(shot);
}
function updateRails(shot){
  for(const o of shot.objects) if(isCrane(o) && o.rail) updateJibRail(o, shot);
}
function jibBasePos(o){
  const lx = -o.w/2 + o.h*.5, c = Math.cos(o.rot), s = Math.sin(o.rot);
  return {x:o.x + lx*c, y:o.y + lx*s};
}
function jibHeadPos(o){
  const lx = o.w/2 - o.h*.22, c = Math.cos(o.rot), s = Math.sin(o.rot);
  return {x:o.x + lx*c, y:o.y + lx*s};
}
function syncMounts(shot){
  for(const cam of shot.objects){
    if(cam.cat !== 'camera' || !cam.mount) continue;
    const jib = shot.objects.find(j => j.id === cam.mount.id && isCrane(j));
    if(!jib){ cam.mount = null; continue; }
    const hp = jibHeadPos(jib);
    cam.x = hp.x; cam.y = hp.y;
    // camera keeps its aim relative to the arm, so swinging the arm pans the shot
    cam.rot = norm(jib.rot + (cam.mount.relRot || 0));
  }
}

// ---------------------------------------------------------------- hit testing
function hitHandle(wx, wy){
  const r = (H_R+4)/view.scale;
  for(const h of handleList()) if(dist(wx,wy,h.x,h.y) <= r) return h;
  return null;
}
function linePts(o){
  if(!o.mid) return [o.p1, o.p2];
  const cx=2*o.mid.x-(o.p1.x+o.p2.x)/2, cy=2*o.mid.y-(o.p1.y+o.p2.y)/2;
  const pts=[];
  for(let i=0;i<=12;i++){
    const t=i/12, u=1-t;
    pts.push({x:u*u*o.p1.x+2*u*t*cx+t*t*o.p2.x, y:u*u*o.p1.y+2*u*t*cy+t*t*o.p2.y});
  }
  return pts;
}
function hitObject(shot, wx, wy){
  for(let i = shot.objects.length-1; i >= 0; i--){
    const o = shot.objects[i];
    if(o.kind === 'track') continue;
    if(o.cat === 'line'){
      const thr = Math.max(10/view.scale, (o.weight||3)/2 + 6);
      const lp = linePts(o);
      for(let j=0;j<lp.length-1;j++)
        if(ptSeg(wx,wy,lp[j].x,lp[j].y,lp[j+1].x,lp[j+1].y).d <= thr) return o;
      continue;
    }
    const c = Math.cos(-o.rot), s = Math.sin(-o.rot);
    const dx = wx-o.x, dy = wy-o.y;
    const lx = dx*c - dy*s, ly = dx*s + dy*c;
    const pad = 6/view.scale;
    if(Math.abs(lx) <= o.w/2+pad && Math.abs(ly) <= o.h/2+pad) return o;
  }
  return null;
}
function hitTrack(shot, wx, wy){
  const thr = Math.max(16, 12/view.scale);
  for(let i = shot.objects.length-1; i >= 0; i--){
    const o = shot.objects[i];
    if(o.kind !== 'track' || !o.pts || o.pts.length < 2) continue;
    const smp = samplePath(o.pts, false, 18);
    for(let j=1;j<smp.length;j++){
      if(ptSeg(wx,wy, smp[j-1].x,smp[j-1].y, smp[j].x,smp[j].y).d <= thr) return o;
    }
  }
  return null;
}
function hitSun(shot, wx, wy){
  const s = shot.sun;
  return (s && s.on && dist(wx,wy,s.x,s.y) <= Math.max(26, 22/view.scale)) ? s : null;
}
let wallGroupDrag = false; // when true, dragging a wall moves its whole connected structure
function wallComponent(shot, start){
  const EPS = 2;
  const touches = (a,b)=>
    (Math.abs(a.x1-b.x1)<EPS && Math.abs(a.y1-b.y1)<EPS) ||
    (Math.abs(a.x1-b.x2)<EPS && Math.abs(a.y1-b.y2)<EPS) ||
    (Math.abs(a.x2-b.x1)<EPS && Math.abs(a.y2-b.y1)<EPS) ||
    (Math.abs(a.x2-b.x2)<EPS && Math.abs(a.y2-b.y2)<EPS);
  const comp = [start];
  const seen = new Set([start.id]);
  let grew = true;
  while(grew){
    grew = false;
    for(const w of shot.walls){
      if(seen.has(w.id)) continue;
      if(comp.some(c=>touches(w,c))){ comp.push(w); seen.add(w.id); grew = true; }
    }
  }
  return comp;
}
function hitWall(shot, wx, wy){
  const thr = Math.max(9/view.scale, 8);
  let best = null;
  for(const w of shot.walls){
    const r = ptSeg(wx,wy,w.x1,w.y1,w.x2,w.y2);
    if(r.d <= thr && (!best || r.d < best.d)) best = {wall:w, ...r};
  }
  return best;
}
function hitOpening(shot, wx, wy){
  const thr = Math.max(12/view.scale, 10);
  for(const w of shot.walls){
    for(let i=0;i<(w.openings||[]).length;i++){
      const op = w.openings[i];
      const cx = w.x1 + (w.x2-w.x1)*op.t, cy = w.y1 + (w.y2-w.y1)*op.t;
      if(dist(wx,wy,cx,cy) <= Math.max(op.w/2, thr)) return {wallId:w.id, index:i};
    }
  }
  return null;
}

// ---------------------------------------------------------------- snapping
function snapWallPoint(shot, wx, wy, excludeWallId){
  const thr = 14/view.scale;
  for(const w of shot.walls){
    if(w.id === excludeWallId) continue;
    if(dist(wx,wy,w.x1,w.y1) < thr) return {x:w.x1, y:w.y1};
    if(dist(wx,wy,w.x2,w.y2) < thr) return {x:w.x2, y:w.y2};
  }
  return {x: Math.round(wx/25)*25, y: Math.round(wy/25)*25};
}
function snapWallAngle(x1,y1,x2,y2,free){
  if(free) return {x:x2, y:y2};
  const dx = x2-x1, dy = y2-y1;
  const L = Math.hypot(dx,dy); if(L < 4) return {x:x2,y:y2};
  const a = Math.atan2(dy,dx);
  const q45 = Math.round(a/(Math.PI/4))*(Math.PI/4);
  const q90 = Math.round(a/(Math.PI/2))*(Math.PI/2);
  let target = null;
  if(Math.abs(norm(a - q90)) < rad(14)) target = q90;
  else if(Math.abs(norm(a - q45)) < rad(8)) target = q45;
  if(target === null) return {x:x2, y:y2};
  return {x: x1 + Math.cos(target)*L, y: y1 + Math.sin(target)*L};
}
function hourFromVec(ux, uy, nA){ // vector from sun disc toward the dragged handle = toward the sun
  if(nA === undefined || nA === null) nA = -Math.PI/2;
  const nx = Math.cos(nA), ny = Math.sin(nA);
  // clockwise angle from north to the drag vector
  let az = deg(Math.atan2(nx*uy - ny*ux, nx*ux + ny*uy));
  az = (az + 360) % 360;
  let h = 6 + (az - 90)/15;
  if(h < 0) h += 24;
  h = Math.round(h*4)/4; // 15-min steps
  return clamp(h, 4, 22);
}

// ---------------------------------------------------------------- input
const ptrs = new Map();
let pinch = null, postPinch = false;
function closeDrawers(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('rightPanel').classList.remove('open');
}
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointercancel', e => {
  ptrs.delete(e.pointerId);
  if(ptrs.size < 2) pinch = null;
  if(ptrs.size === 0) postPinch = false;
  drag = null; cv.classList.remove('panning');
});

cv.addEventListener('wheel', e => {
  e.preventDefault();
  const {sx, sy} = evtPos(e);
  const before = toWorld(sx, sy);
  const f = Math.exp(-e.deltaY * 0.0016);
  view.scale = clamp(view.scale * f, 0.04, 8);
  const after = toWorld(sx, sy);
  view.x += before.x - after.x;
  view.y += before.y - after.y;
  updateZoomPct();
  render();
}, {passive:false});

cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  hideCustomPop();
  closeDrawers();
  if(typeof hideExportPop === 'function') hideExportPop();
  ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(ptrs.size === 2){
    const [a,b] = [...ptrs.values()];
    const r = cv.getBoundingClientRect();
    const mid = {x:(a.x+b.x)/2 - r.left, y:(a.y+b.y)/2 - r.top};
    pinch = {d0: Math.max(1, Math.hypot(a.x-b.x, a.y-b.y)),
             scale0: view.scale, wm: toWorld(mid.x, mid.y)};
    drag = null; cv.classList.remove('panning');
    closeNoteEditor(true);
    return;
  }
  if(ptrs.size > 2 || postPinch) return;
  const {sx, sy} = evtPos(e);
  const {x:wx, y:wy} = toWorld(sx, sy);
  const shot = activeShot();

  if(e.button === 1 || spaceDown){
    drag = {kind:'pan', sx, sy, vx:view.x, vy:view.y};
    cv.classList.add('panning');
    return;
  }
  if(e.button === 2) return;

  if(tool === 'crop'){
    drag = {kind:'crop', x1:wx, y1:wy, x2:wx, y2:wy};
    return;
  }
  if(tool === 'draw'){
    drag = {kind:'ink', pts:[{x:wx, y:wy}]};
    return;
  }
  if(tool === 'poly'){
    if(!polyDraw) return;
    polyDraw.pts.push({x:wx, y:wy});
    polyDraw.mouse = {x:wx, y:wy};
    render();
    return;
  }
  if(tool === 'wall'){
    const p = snapWallPoint(shot, wx, wy);
    drag = {kind:'drawWall', x1:p.x, y1:p.y, x2:p.x, y2:p.y};
    return;
  }
  if(tool === 'room'){
    const p = snapWallPoint(shot, wx, wy);
    drag = {kind:'drawRoom', x1:p.x, y1:p.y, x2:p.x, y2:p.y};
    return;
  }
  if(tool === 'door' || tool === 'window' || tool === 'gap'){
    const h = hitWall(shot, wx, wy);
    if(h){
      const L = dist(h.wall.x1,h.wall.y1,h.wall.x2,h.wall.y2);
      const w = tool==='door' ? 72 : tool==='gap' ? 90 : 100;
      const t = clamp(h.t, (w/2+6)/L, 1-(w/2+6)/L);
      h.wall.openings = h.wall.openings || [];
      h.wall.openings.push({id:uid(), t, w:Math.min(w, L*.8), type:tool, flip:false});
      sel = {type:'opening', wallId:h.wall.id, index:h.wall.openings.length-1};
      setTool('select');
      markDirty(); render(); refreshSelBar();
    }
    return;
  }

  // ---- select tool ----
  const h = hitHandle(wx, wy);
  if(h && sel){
    if(sel.type === 'sun'){
      if(h.id === 'sunH') drag = {kind:'sunRot', su:shot.sun};
      else if(h.id === 'sunN') drag = {kind:'sunNorth', su:shot.sun};
      return;
    }
    if(sel.type === 'object'){
      const o = shot.objects.find(x=>x.id===sel.id);
      if(h.id === 'rotate') drag = {kind:'rotate', o, craneBase: isCrane(o) ? jibBasePos(o) : null};
      else if(h.id === 'resize') drag = {kind:'resize', o, ratio:o.h/o.w};
      else if(h.id === 'jibHead') drag = {kind:'jibHead', o, B:jibBasePos(o)};
      else if(h.id.startsWith('fov')) drag = {kind:'fov', o};
      else if(h.id === 'l1' || h.id === 'l2') drag = {kind:'lineEnd', o, end:h.id};
      else if(h.id === 'lm') drag = {kind:'lineMid', o};
      else if(h.id.startsWith('tp')) drag = {kind:'trackPt', o, i:+h.id.slice(2)};
      else if(h.id.startsWith('ch')) drag = {kind:'craneKey', o, i:+h.id.slice(2)};
      else if(h.id.startsWith('pf')) drag = {kind:'ptfov', o, i:+h.id.slice(3)};
      else if(h.id.startsWith('pr')) drag = {kind:'ptrot', o, i:+h.id.slice(2)};
      else if(h.id.startsWith('pt')) drag = {kind:'point', o, i:+h.id.slice(2)};
    } else if(sel.type === 'wall'){
      const w = shot.walls.find(x=>x.id===sel.id);
      drag = {kind:'wallEnd', w, end:h.id};
    }
    return;
  }

  // drag a selected object's label chip to reposition it
  if(sel && sel.type === 'object'){
    const so = shot.objects.find(x=>x.id===sel.id);
    if(so && so._labelRect && !so.locked &&
       wx >= so._labelRect.x && wx <= so._labelRect.x + so._labelRect.w &&
       wy >= so._labelRect.y && wy <= so._labelRect.y + so._labelRect.h){
      drag = {kind:'label', o:so, sx:wx, sy:wy, dx0:so.labelDX||0, dy0:so.labelDY||0};
      return;
    }
    if(so && so._frameRect && !so.locked &&
       wx >= so._frameRect.x && wx <= so._frameRect.x + so._frameRect.w &&
       wy >= so._frameRect.y && wy <= so._frameRect.y + so._frameRect.h){
      drag = {kind:'frame', o:so, sx:wx, sy:wy, dx0:so.frameDX ?? 70, dy0:so.frameDY ?? -85};
      return;
    }
  }
  const su = hitSun(shot, wx, wy);
  if(su){
    sel = {type:'sun'};
    drag = {kind:'sunMove', su, ox:su.x-wx, oy:su.y-wy};
    refreshSelBar(); render();
    return;
  }
  const obj = hitObject(shot, wx, wy);
  if(obj){
    sel = {type:'object', id:obj.id};
    if(obj.locked){ drag = null; refreshSelBar(); render(); return; }
    if(obj.cat === 'camera') obj.mount = null; // picking a camera up releases it from a jib
    drag = {kind:'move', o:obj, ox:obj.x-wx, oy:obj.y-wy};
    if(obj.cat === 'line'){ drag.wx=wx; drag.wy=wy; drag.p1o={...obj.p1}; drag.p2o={...obj.p2}; drag.mido=obj.mid?{...obj.mid}:null; }
    if(obj.cat === 'ink'){ drag.wx=wx; drag.wy=wy; drag.ptso=obj.pts.map(p=>({...p})); drag.xc=obj.x; drag.yc=obj.y; }
    if(obj.cat === 'link'){ drag.linkX0=obj.x; drag.linkY0=obj.y; }
    if(obj.cat === 'todo'){ drag.tapX0=obj.x; drag.tapY0=obj.y; }
    refreshSelBar(); render();
    return;
  }
  const trk = hitTrack(shot, wx, wy);
  if(trk){
    sel = {type:'object', id:trk.id};
    if(trk.locked){ refreshSelBar(); render(); return; }
    drag = {kind:'trackMove', o:trk, wx, wy, orig:trk.pts.map(p=>({...p}))};
    refreshSelBar(); render();
    return;
  }
  const op = hitOpening(shot, wx, wy);
  if(op){
    sel = {type:'opening', wallId:op.wallId, index:op.index};
    const wall = shot.walls.find(w=>w.id===op.wallId);
    drag = {kind:'moveOpening', wall, index:op.index};
    refreshSelBar(); render();
    return;
  }
  const wl = hitWall(shot, wx, wy);
  if(wl){
    sel = {type:'wall', id:wl.wall.id};
    if(wl.wall.locked){ refreshSelBar(); render(); return; }
    drag = {kind:'moveWall', w:wl.wall, wx, wy, x1:wl.wall.x1, y1:wl.wall.y1, x2:wl.wall.x2, y2:wl.wall.y2};
    if(wallGroupDrag){
      // whole connected structure moves rigidly
      drag.group = wallComponent(shot, wl.wall).map(w=>({w, x1:w.x1, y1:w.y1, x2:w.x2, y2:w.y2}));
    } else {
      // corners stay glued: endpoints of other walls that touch this wall's ends follow along
      const EPS = 2;
      drag.attach = [];
      for(const w2 of shot.walls){
        if(w2.id === wl.wall.id) continue;
        for(const end of [1,2]){
          const ex = w2['x'+end], ey = w2['y'+end];
          if((Math.abs(ex-wl.wall.x1)<EPS && Math.abs(ey-wl.wall.y1)<EPS) ||
             (Math.abs(ex-wl.wall.x2)<EPS && Math.abs(ey-wl.wall.y2)<EPS)){
            drag.attach.push({w:w2, end, ox:ex, oy:ey});
          }
        }
      }
    }
    refreshSelBar(); render();
    return;
  }
  sel = null; refreshSelBar();
  drag = {kind:'pan', sx, sy, vx:view.x, vy:view.y};
  cv.classList.add('panning');
  render();
});

cv.addEventListener('pointermove', e => {
  if(ptrs.has(e.pointerId)) ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(pinch){
    if(ptrs.size >= 2){
      const [a,b] = [...ptrs.values()];
      const r = cv.getBoundingClientRect();
      const mid = {x:(a.x+b.x)/2 - r.left, y:(a.y+b.y)/2 - r.top};
      const d = Math.max(1, Math.hypot(a.x-b.x, a.y-b.y));
      view.scale = clamp(pinch.scale0 * d/pinch.d0, .04, 8);
      view.x = pinch.wm.x - mid.x/view.scale;
      view.y = pinch.wm.y - mid.y/view.scale;
      updateZoomPct(); render();
    }
    return;
  }
  if(postPinch) return;
  const {sx, sy} = evtPos(e);
  const {x:wx, y:wy} = toWorld(sx, sy);
  const shot = activeShot();

  if(tool==='door' || tool==='window' || tool==='gap'){
    const h = hitWall(shot, wx, wy);
    hoverWall = h ? {wall:h.wall, t:h.t} : null;
    render();
  }
  if(tool==='poly' && polyDraw){
    polyDraw.mouse = {x:wx, y:wy};
    render();
  }
  if(!drag) return;

  switch(drag.kind){
    case 'pan':
      view.x = drag.vx - (sx - drag.sx)/view.scale;
      view.y = drag.vy - (sy - drag.sy)/view.scale;
      break;
    case 'crop':
      drag.x2 = wx; drag.y2 = wy;
      break;
    case 'ink': {
      const lp = drag.pts[drag.pts.length-1];
      if(dist(lp.x, lp.y, wx, wy) > 2.5/Math.max(view.scale,.3)) drag.pts.push({x:wx, y:wy});
      break;
    }
    case 'lineEnd': {
      const o = drag.o;
      o[drag.end==='l1' ? 'p1' : 'p2'] = {x:wx, y:wy};
      o.x = (o.p1.x+o.p2.x)/2; o.y = (o.p1.y+o.p2.y)/2;
      o.w = Math.max(14, dist(o.p1.x,o.p1.y,o.p2.x,o.p2.y));
      o.h = Math.max(14, (o.weight||3)*3);
      markDirty();
      break;
    }
    case 'lineMid': {
      const o = drag.o;
      const sm = {x:(o.p1.x+o.p2.x)/2, y:(o.p1.y+o.p2.y)/2};
      o.mid = (dist(wx,wy,sm.x,sm.y) < 8/Math.max(view.scale,.3)) ? null : {x:wx, y:wy};
      markDirty();
      break;
    }
    case 'label':
      drag.o.labelDX = drag.dx0 + (wx - drag.sx);
      drag.o.labelDY = drag.dy0 + (wy - drag.sy);
      markDirty();
      break;
    case 'frame':
      drag.o.frameDX = drag.dx0 + (wx - drag.sx);
      drag.o.frameDY = drag.dy0 + (wy - drag.sy);
      markDirty();
      break;
    case 'drawWall': {
      const p = snapWallPoint(shot, wx, wy);
      const q = snapWallAngle(drag.x1, drag.y1, p.x, p.y, e.shiftKey);
      drag.x2 = q.x; drag.y2 = q.y;
      break;
    }
    case 'drawRoom': {
      const p = snapWallPoint(shot, wx, wy);
      drag.x2 = p.x; drag.y2 = p.y;
      break;
    }
    case 'move': {
      const o = drag.o;
      if(o.cat === 'line' && drag.p1o){
        const dx = wx - drag.wx, dy = wy - drag.wy;
        o.p1 = {x:drag.p1o.x+dx, y:drag.p1o.y+dy};
        o.p2 = {x:drag.p2o.x+dx, y:drag.p2o.y+dy};
        if(drag.mido) o.mid = {x:drag.mido.x+dx, y:drag.mido.y+dy};
        o.x = (o.p1.x+o.p2.x)/2; o.y = (o.p1.y+o.p2.y)/2;
        markDirty(); break;
      }
      if(o.cat === 'ink' && drag.ptso){
        const dx = wx - drag.wx, dy = wy - drag.wy;
        o.pts = drag.ptso.map(p=>({x:p.x+dx, y:p.y+dy}));
        o.x = drag.xc + dx; o.y = drag.yc + dy;
        markDirty(); break;
      }
      if(isCrane(o) && o.rail){
        const t = shot.objects.find(x=>x.id===o.rail.id && x.kind==='track');
        if(t && t.pts && t.pts.length > 1){
          const {smp, cum} = trackSamplesWithLen(t);
          let bi = 0, bd = Infinity;
          for(let i=0;i<smp.length;i++){
            const dd = dist(wx, wy, smp[i].x, smp[i].y);
            if(dd < bd){ bd = dd; bi = i; }
          }
          if(bd > 110){ // pulled well clear of the rails → release
            o.rail = null; o.path = [];
            toast('Crane released from the track');
          } else {
            o.rail.d = cum[bi];
            updateJibRail(o, shot);
            markDirty();
            break;
          }
        } else o.rail = null;
      }
      o.x = wx + drag.ox; o.y = wy + drag.oy;
      if(e.shiftKey){ o.x = Math.round(o.x/25)*25; o.y = Math.round(o.y/25)*25; }
      markDirty();
      break;
    }
    case 'rotate': {
      let a;
      if(drag.craneBase){
        // cranes swing around their BASE, not the icon center
        a = Math.atan2(wy - drag.craneBase.y, wx - drag.craneBase.x);
      } else {
        a = Math.atan2(wy - drag.o.y, wx - drag.o.x) + Math.PI/2;
      }
      if(!e.shiftKey){
        const q = Math.round(a/rad(15))*rad(15);
        if(Math.abs(norm(a-q)) < rad(4)) a = q;
      }
      drag.o.rot = norm(a);
      if(drag.craneBase && !drag.o.rail){
        const lx = -drag.o.w/2 + drag.o.h*.5;
        drag.o.x = drag.craneBase.x - lx*Math.cos(drag.o.rot);
        drag.o.y = drag.craneBase.y - lx*Math.sin(drag.o.rot);
      }
      if(drag.o.cat === 'camera' && drag.o.mount){
        const j = shot.objects.find(x=>x.id===drag.o.mount.id);
        if(j) drag.o.mount.relRot = norm(drag.o.rot - j.rot);
      }
      if(isCrane(drag.o) && drag.o.rail) updateJibRail(drag.o, shot); // pivot stays on the rails
      markDirty();
      break;
    }
    case 'resize': {
      const o = drag.o;
      const c = Math.cos(-o.rot), s = Math.sin(-o.rot);
      const lx = (wx-o.x)*c - (wy-o.y)*s, ly = (wx-o.x)*s + (wy-o.y)*c;
      if(o.cat === 'image'){
        o.w = clamp(Math.abs(lx)*2, 24, 4000);
        o.h = o.w * drag.ratio;
      } else {
        o.w = clamp(Math.abs(lx)*2, 10, 6000);
        o.h = clamp(Math.abs(ly)*2, 10, 6000);
        const def = PROPS[o.kind];
        if((o.cat === 'actor' && !o.kind.startsWith('animal')) || (def && def.round)){
          const m = Math.max(o.w, o.h); o.w = m; o.h = m;
        }
      }
      markDirty();
      break;
    }
    case 'fov': {
      const o = drag.o;
      const a = Math.atan2(wy-o.y, wx-o.x);
      o.fov = clamp(Math.abs(deg(norm(a - o.rot)))*2, 4, 175);
      o.range = clamp(dist(wx,wy,o.x,o.y), 40, 8000);
      o.lens = null;
      markDirty();
      break;
    }
    case 'point':
      drag.o.path[drag.i].x = wx; drag.o.path[drag.i].y = wy; markDirty();
      break;
    case 'craneKey': {
      const o = drag.o, p = o.path[drag.i];
      const maxL = o.kind === 'technocrane' ? 1600 : 900;
      p.len = clamp(dist(wx, wy, p.x, p.y), 120, maxL);
      p.rot = Math.atan2(wy - p.y, wx - p.x);
      markDirty();
      break;
    }
    case 'ptrot': {
      const p = drag.o.path[drag.i];
      let a = Math.atan2(wy - p.y, wx - p.x) + Math.PI/2;
      if(!e.shiftKey){
        const q = Math.round(a/rad(15))*rad(15);
        if(Math.abs(norm(a-q)) < rad(4)) a = q;
      }
      p.rot = norm(a); markDirty();
      break;
    }
    case 'ptfov': {
      const o = drag.o, p = o.path[drag.i];
      const pr = prot(o, drag.i);
      const a = Math.atan2(wy-p.y, wx-p.x);
      p.fov = clamp(Math.abs(deg(norm(a - pr)))*2, 4, 175);
      p.range = clamp(dist(wx,wy,p.x,p.y), 40, 8000);
      markDirty();
      break;
    }
    case 'trackPt':
      drag.o.pts[drag.i].x = wx; drag.o.pts[drag.i].y = wy;
      trackCentroid(drag.o); updateRails(shot); markDirty();
      break;
    case 'trackMove': {
      const dx = wx - drag.wx, dy = wy - drag.wy;
      drag.o.pts.forEach((p,i)=>{ p.x = drag.orig[i].x + dx; p.y = drag.orig[i].y + dy; });
      trackCentroid(drag.o); updateRails(shot); markDirty();
      break;
    }
    case 'sunMove':
      drag.su.x = wx + drag.ox; drag.su.y = wy + drag.oy; markDirty();
      break;
    case 'sunRot':
      drag.su.hour = hourFromVec(wx - drag.su.x, wy - drag.su.y, northAngle(drag.su));
      markDirty(); refreshSelBar();
      break;
    case 'sunNorth':
      drag.su.north = Math.atan2(wy - drag.su.y, wx - drag.su.x);
      markDirty(); refreshSelBar();
      break;
    case 'jibHead': {
      const o = drag.o, B = drag.B;
      const maxL = o.kind === 'technocrane' ? 1600 : 900;
      const L = clamp(dist(wx, wy, B.x, B.y), 120, maxL);
      const rot = Math.atan2(wy - B.y, wx - B.x);
      o.rot = rot;
      o.w = L + 0.72*o.h;
      const lx = -o.w/2 + o.h*.5;
      o.x = B.x - lx*Math.cos(rot);
      o.y = B.y - lx*Math.sin(rot);
      if(o.rail) updateJibRail(o, shot); // arm changed → rebuild the ride path offsets
      markDirty();
      break;
    }
    case 'wallEnd': {
      const p = snapWallPoint(shot, wx, wy, drag.w.id);
      const other = drag.end==='w1' ? {x:drag.w.x2,y:drag.w.y2} : {x:drag.w.x1,y:drag.w.y1};
      const q = snapWallAngle(other.x, other.y, p.x, p.y, e.shiftKey);
      if(drag.end === 'w1'){ drag.w.x1 = q.x; drag.w.y1 = q.y; }
      else { drag.w.x2 = q.x; drag.w.y2 = q.y; }
      markDirty();
      break;
    }
    case 'moveWall': {
      const dx0 = wx - drag.wx, dy0 = wy - drag.wy;
      drag.w.x1 = drag.x1+dx0; drag.w.y1 = drag.y1+dy0;
      drag.w.x2 = drag.x2+dx0; drag.w.y2 = drag.y2+dy0;
      if(e.shiftKey){
        const gx = Math.round(drag.w.x1/25)*25 - drag.w.x1, gy = Math.round(drag.w.y1/25)*25 - drag.w.y1;
        drag.w.x1+=gx; drag.w.y1+=gy; drag.w.x2+=gx; drag.w.y2+=gy;
      }
      const dx = drag.w.x1 - drag.x1, dy = drag.w.y1 - drag.y1; // final delta after snap
      if(drag.group){
        for(const g of drag.group){
          if(g.w.id === drag.w.id) continue;
          g.w.x1 = g.x1+dx; g.w.y1 = g.y1+dy;
          g.w.x2 = g.x2+dx; g.w.y2 = g.y2+dy;
        }
      } else if(drag.attach){
        for(const a of drag.attach){
          a.w['x'+a.end] = a.ox+dx;
          a.w['y'+a.end] = a.oy+dy;
        }
      }
      markDirty();
      break;
    }
    case 'moveOpening': {
      const w = drag.wall;
      const r = ptSeg(wx,wy,w.x1,w.y1,w.x2,w.y2);
      const L = dist(w.x1,w.y1,w.x2,w.y2);
      const op = w.openings[drag.index];
      op.t = clamp(r.t, (op.w/2)/L, 1-(op.w/2)/L);
      markDirty();
      break;
    }
  }
  if(drag && drag.o && isCrane(drag.o) &&
     (drag.kind==='move' || drag.kind==='rotate' || drag.kind==='resize' || drag.kind==='jibHead')){
    syncMounts(shot);
  }
  render();
});

cv.addEventListener('pointerup', e => {
  ptrs.delete(e.pointerId);
  if(pinch){
    if(ptrs.size < 2){ pinch = null; postPinch = ptrs.size > 0; }
    drag = null; cv.classList.remove('panning');
    return;
  }
  if(postPinch){
    if(ptrs.size === 0) postPinch = false;
    return;
  }
  if(!drag) return;
  const shot = activeShot();
  if(drag.kind === 'crop'){
    const x1=Math.min(drag.x1,drag.x2), x2=Math.max(drag.x1,drag.x2);
    const y1=Math.min(drag.y1,drag.y2), y2=Math.max(drag.y1,drag.y2);
    const cropB = (x2-x1 > 40 && y2-y1 > 40) ? {minX:x1, minY:y1, maxX:x2, maxY:y2} : null;
    drag = null;
    setTool('select');
    if(cropB) doPNGExport(cropB);
    else toast('Crop area too small — export cancelled');
    render();
    return;
  }
  if(drag.kind === 'ink'){
    if(drag.pts.length > 2){
      let mnx=Infinity,mny=Infinity,mxx=-Infinity,mxy=-Infinity;
      drag.pts.forEach(p=>{mnx=Math.min(mnx,p.x);mny=Math.min(mny,p.y);mxx=Math.max(mxx,p.x);mxy=Math.max(mxy,p.y);});
      const o = {id:uid(), cat:'ink', kind:'ink', pts:drag.pts,
        x:(mnx+mxx)/2, y:(mny+mxy)/2, w:Math.max(20,mxx-mnx), h:Math.max(20,mxy-mny),
        rot:0, color:inkColor, weight:inkWeight, label:'', path:[]};
      shot.objects.push(o);
      sel = {type:'object', id:o.id};
      markDirty(); refreshSelBar();
    }
    drag = null;
    if(histPushed) histSettle();
    render();
    return; // stay in draw tool for the next stroke
  }
  // a clean tap on a link (no real movement) opens it in a new tab
  if(drag.kind === 'move' && drag.o && drag.o.cat === 'link' && drag.linkX0 !== undefined){
    if(dist(drag.o.x, drag.o.y, drag.linkX0, drag.linkY0) < 4/Math.max(view.scale,.3) && drag.o.url){
      window.open(/^https?:\/\//i.test(drag.o.url) ? drag.o.url : 'https://' + drag.o.url, '_blank');
    }
  }
  // a clean tap on a to-do item toggles its checkbox
  if(drag.kind === 'move' && drag.o && drag.o.cat === 'todo' && drag.tapX0 !== undefined){
    if(dist(drag.o.x, drag.o.y, drag.tapX0, drag.tapY0) < 4/Math.max(view.scale,.3)){
      const o = drag.o;
      const lh = 24, top = o.label ? 30 : 10;
      const ly = wy - o.y + o.h/2;
      const i = Math.floor((ly - top)/lh);
      if(o.items && i >= 0 && i < o.items.length){
        o.items[i].done = !o.items[i].done;
        markDirty(); render();
      }
    }
  }
  if(drag.kind === 'drawWall'){
    if(dist(drag.x1,drag.y1,drag.x2,drag.y2) > 12){
      const w = {id:uid(), x1:drag.x1, y1:drag.y1, x2:drag.x2, y2:drag.y2, openings:[], locked:true};
      shot.walls.push(w);
      sel = {type:'wall', id:w.id};
      markDirty();
    }
  }
  if(drag.kind === 'drawRoom'){
    const x1=Math.min(drag.x1,drag.x2), x2=Math.max(drag.x1,drag.x2);
    const y1=Math.min(drag.y1,drag.y2), y2=Math.max(drag.y1,drag.y2);
    if(x2-x1 > 20 && y2-y1 > 20){
      shot.walls.push(
        {id:uid(), x1, y1, x2, y2:y1, openings:[], locked:true},
        {id:uid(), x1:x2, y1, x2, y2, openings:[], locked:true},
        {id:uid(), x1:x2, y1:y2, x2:x1, y2, openings:[], locked:true},
        {id:uid(), x1, y1:y2, x2:x1, y2:y1, openings:[], locked:true},
      );
      markDirty();
      setTool('select');
    }
  }
  // camera dropped on a jib head → mount it (it follows the arm)
  let mounted = false;
  if(drag.kind === 'move' && drag.o.cat === 'camera'){
    const cam = drag.o;
    for(const j of shot.objects){
      if(!isCrane(j)) continue;
      const hp = jibHeadPos(j);
      if(dist(cam.x, cam.y, hp.x, hp.y) < 50){
        cam.mount = {type:'jib', id:j.id, relRot: norm(cam.rot - j.rot)};
        cam.x = hp.x; cam.y = hp.y;
        toast('Camera mounted on the ' + (j.kind==='technocrane'?'technocrane':'jib') + ' head — it follows the arm');
        markDirty(); refreshSelBar();
        mounted = true;
        break;
      }
    }
  }
  // crane base dropped on a dolly track → it clips on and stays railed
  if(drag.kind === 'move' && isCrane(drag.o) && !drag.o.rail){
    const jib = drag.o;
    const base = jibBasePos(jib);
    for(const t of shot.objects){
      if(t.kind !== 'track' || !t.pts || t.pts.length < 2) continue;
      const {smp, cum, total} = trackSamplesWithLen(t);
      let bi = 0, bd = Infinity;
      for(let i=0;i<smp.length;i++){
        const dd = dist(base.x, base.y, smp[i].x, smp[i].y);
        if(dd < bd){ bd = dd; bi = i; }
      }
      if(bd < 55){
        jib.rail = {id:t.id, d:cum[bi], dir: cum[bi] < total/2 ? 1 : -1};
        updateJibRail(jib, shot);
        toast((jib.kind==='technocrane'?'Technocrane':'Jib') + ' clipped onto the track — drag it to slide along the rails');
        markDirty(); refreshSelBar();
        break;
      }
    }
  }
  // camera dropped near a dolly track end → snap on and inherit its path
  if(!mounted && drag.kind === 'move' && drag.o.cat === 'camera'){
    const cam = drag.o;
    outer:
    for(const t of shot.objects){
      if(t.kind !== 'track' || !t.pts || t.pts.length < 2) continue;
      const ends = [
        {p:t.pts[0], rest:t.pts.slice(1)},
        {p:t.pts[t.pts.length-1], rest:t.pts.slice(0,-1).reverse()},
      ];
      for(const end of ends){
        if(dist(cam.x, cam.y, end.p.x, end.p.y) < 60){
          cam.x = end.p.x; cam.y = end.p.y;
          cam.path = end.rest.map(p=>({x:p.x, y:p.y}));
          cam.pathStraight = t.pts.length < 3;
          toast('Camera snapped to dolly track — it now rides the full track');
          markDirty(); refreshSelBar();
          break outer;
        }
      }
    }
  }
  cv.classList.remove('panning');
  drag = null;
  if(histPushed) histSettle();
  render(); refreshSelBar();
});

cv.addEventListener('dblclick', e => {
  if(tool === 'poly'){ finishPoly(); return; }
  const {sx,sy} = evtPos(e);
  const {x:wx,y:wy} = toWorld(sx,sy);
  const o = hitObject(activeShot(), wx, wy);
  if(o){
    sel = {type:'object', id:o.id};
    refreshSelBar(); render();
    if(o.cat === 'note' || o.cat === 'text'){ openNoteEditor(o); return; }
    if(o.cat === 'todo'){ openNoteEditor(o, 'todo'); return; }
    if(o.cat === 'script'){
      const pad = 18, headH = o.mode==='av' ? 30 : 12;
      const lx = wx - o.x; // local (rot=0 for these blocks)
      if(o.mode === 'av'){
        const half = o.w/2 - pad*1.5;
        if(lx < 0) openNoteEditor(o, 'text', {x:-o.w/2+pad, y:-o.h/2+headH, w:half, h:o.h-headH-pad}, o.fontSize||12.5);
        else openNoteEditor(o, 'textR', {x:pad/2, y:-o.h/2+headH, w:half, h:o.h-headH-pad}, o.fontSize||12.5);
      } else {
        openNoteEditor(o, 'text', {x:-o.w/2+pad, y:-o.h/2+headH, w:o.w-pad*2, h:o.h-headH-pad}, o.fontSize||12.5);
      }
      return;
    }
    if(o.cat === 'sbrow'){
      const lx = wx - o.x;
      const z1 = o.w*.28, z2 = o.w*.30;
      if(lx < -o.w/2 + z1){
        openNoteEditor(o, 'title', {x:-o.w/2+12, y:-o.h/2+8, w:z1-22, h:40}, 13);
      } else if(lx < -o.w/2 + z1 + z2){
        pickSbImage(o);
      } else {
        openNoteEditor(o, 'desc', {x:-o.w/2+z1+z2+10, y:-o.h/2+8, w:o.w-z1-z2-20, h:o.h-16}, 12);
      }
      return;
    }
    if(o.cat === 'table'){
      const nR = o.cells.length, nC = o.cells[0].length;
      const headH = 30, rowH = 28, colW = o.w/nC;
      const lx = wx - o.x + o.w/2, ly = wy - o.y + o.h/2;
      const c = clamp(Math.floor(lx/colW), 0, nC-1);
      const r = ly < headH ? 0 : clamp(1 + Math.floor((ly-headH)/rowH), 0, nR-1);
      const cy = r===0 ? 0 : headH + (r-1)*rowH;
      openNoteEditor(o, 'cell:'+r+':'+c,
        {x:-o.w/2 + c*colW + 3, y:-o.h/2 + cy + 3, w:colW-6, h:(r===0?headH:rowH)-6}, 12);
      return;
    }
    if(o.cat === 'link'){
      if(o.url){ window.open(/^https?:\/\//i.test(o.url) ? o.url : 'https://'+o.url, '_blank'); }
      else toast('Add a URL in the selection bar first');
      return;
    }
    const inp = document.querySelector('#selBar input.lbl');
    if(inp){ inp.focus(); inp.select(); }
  }
});

// OS drag & drop of image files → pinned to the board
cv.addEventListener('dragover', e => e.preventDefault());
cv.addEventListener('drop', async e => {
  e.preventDefault();
  const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
  if(!files.length) return;
  const {sx, sy} = evtPos(e);
  let {x, y} = toWorld(sx, sy);
  for(const f of files){
    await addBoardImage(f, x, y);
    x += 60; y += 60;
  }
});

document.addEventListener('keydown', e => {
  const tag = document.activeElement && document.activeElement.tagName;
  if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'){
    if(e.key === 'Escape') document.activeElement.blur();
    return;
  }
  if((e.key === 'z' || e.key === 'Z') && (e.metaKey||e.ctrlKey)){
    e.preventDefault();
    e.shiftKey ? redo() : undo();
    return;
  }
  if((e.key === 'y' || e.key === 'Y') && (e.metaKey||e.ctrlKey)){ e.preventDefault(); redo(); return; }
  if((e.key === 'd' || e.key === 'D') && (e.metaKey||e.ctrlKey)){ e.preventDefault(); duplicateSelection(); return; }
  if(e.key === ' '){ spaceDown = true; e.preventDefault(); }
  if(e.key === 'Enter' && tool === 'poly'){ finishPoly(); return; }
  if(e.key === 'Escape'){
    if(tool === 'poly'){ polyDraw = null; setTool('select'); render(); return; }
    drag = null; cv.classList.remove('panning'); sel = null; setTool('select'); refreshSelBar(); render();
  }
  if(e.key === 'Delete' || e.key === 'Backspace'){ deleteSelection(); }
  if(e.key === 'v' || e.key === 'V') setTool('select');
  if(e.key === 'w' || e.key === 'W') setTool('wall');
  if(e.key === 'r' || e.key === 'R') setTool('room');
  if(e.key === 'd' || e.key === 'D') setTool('door');
  if(e.key === 'n' || e.key === 'N') addNoteAtCenter();
  if(e.key === 't' || e.key === 'T') addTextAtCenter();
  if(e.key === 'p' || e.key === 'P') togglePlay();
  if(e.key === 'f' || e.key === 'F') zoomFit();
  if(e.key === '?') toggleHelp(true);
});
document.addEventListener('keyup', e => { if(e.key === ' ') spaceDown = false; });

function deleteSelection(){
  if(!sel) return;
  const shot = activeShot();
  if(sel.type === 'sun'){
    if(shot.sun) shot.sun.on = false;
    sel = null; markDirty(); syncSunBtn(); render(); refreshSelBar();
    return;
  }
  if(sel.type === 'object'){
    const o = shot.objects.find(x=>x.id===sel.id);
    if(o && o.locked){ toast('Locked — unlock it in the selection bar first'); return; }
    shot.objects = shot.objects.filter(x=>x.id!==sel.id);
    if(o) shot.objects.forEach(c=>{
      if(c.mount && c.mount.id===o.id) c.mount=null;
      if(c.rail && c.rail.id===o.id){ c.rail=null; c.path=[]; }
    });
    if(o && noteEditor && noteEditor.id===o.id) closeNoteEditor(false);
    // note: stored images are kept so undo can restore board stills
  }
  else if(sel.type === 'wall'){
    const w = shot.walls.find(w=>w.id===sel.id);
    if(w && w.locked){ toast('Locked — unlock it in the selection bar first'); return; }
    shot.walls = shot.walls.filter(w=>w.id!==sel.id);
  }
  else if(sel.type === 'opening'){
    const w = shot.walls.find(w=>w.id===sel.wallId);
    if(w) w.openings.splice(sel.index,1);
  }
  sel = null; markDirty(); render(); refreshSelBar();
}
function duplicateSelection(){
  if(!sel || sel.type !== 'object') return;
  const shot = activeShot();
  const o = shot.objects.find(x=>x.id===sel.id); if(!o) return;
  const n = JSON.parse(JSON.stringify(o));
  n.id = uid(); n.x += 40; n.y += 40;
  if(n.path) n.path = n.path.map(p=>({...p, x:p.x+40, y:p.y+40}));
  if(n.pts) n.pts = n.pts.map(p=>({x:p.x+40, y:p.y+40}));
  n.rail = null; n.mount = null;
  shot.objects.push(n);
  sel = {type:'object', id:n.id};
  markDirty(); render(); refreshSelBar();
}
// ---------------------------------------------------------------- pen options
function buildInkBar(){
  const bar = document.getElementById('inkBar');
  bar.innerHTML = '';
  const weights = [2, 3, 5, 8, 12];
  for(const w of weights){
    const b = document.createElement('div');
    b.className = 'ink-w' + (inkWeight === w ? ' on' : '');
    b.title = w + 'px stroke';
    const dot = document.createElement('i');
    const d = Math.min(18, 4 + w*1.15);
    dot.style.width = d + 'px'; dot.style.height = d + 'px';
    b.appendChild(dot);
    b.addEventListener('click', ()=>{ inkWeight = w; buildInkBar(); });
    bar.appendChild(b);
  }
  bar.insertAdjacentHTML('beforeend', '<div class="ink-sep"></div>');
  for(const c of COLORS){
    const s = document.createElement('div');
    s.className = 'ink-c' + (inkColor === c ? ' on' : '');
    s.style.background = c;
    s.addEventListener('click', ()=>{ inkColor = c; buildInkBar(); });
    bar.appendChild(s);
  }
}
function addTextAtCenter(){
  const c = toWorld(wrap.clientWidth/2, wrap.clientHeight/2);
  const o = {id:uid(), cat:'text', kind:'text', x:c.x, y:c.y, rot:0, w:240, h:40,
    fontSize:18, bold:false, italic:false, text:'', color:'#5B6472', label:'', path:[]};
  activeShot().objects.push(o);
  sel = {type:'object', id:o.id};
  setTool('select');
  markDirty(); render(); refreshSelBar();
  openNoteEditor(o);
}
function addNoteAtCenter(){
  const c = toWorld(wrap.clientWidth/2, wrap.clientHeight/2);
  const o = {id:uid(), cat:'note', kind:'note', x:c.x, y:c.y, rot:0, w:170, h:150, color:'#E2A93B', text:'', path:[]};
  activeShot().objects.push(o);
  sel = {type:'object', id:o.id};
  setTool('select');
  markDirty(); render(); refreshSelBar();
  openNoteEditor(o);
}

// ---------------------------------------------------------------- tools UI, zoom
function setTool(t){
  tool = t;
  hoverWall = null;
  if(t !== 'poly') polyDraw = null;
  document.querySelectorAll('#toolbar button[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool===t));
  cv.className = 'tool-' + (t==='poly' || t==='draw' || t==='crop' ? 'wall' : t);
  const inkBar = document.getElementById('inkBar');
  if(t === 'draw'){ buildInkBar(); inkBar.classList.add('show'); }
  else inkBar.classList.remove('show');
  const hints = {
    select:'Drag objects to move · handles rotate / resize · drag empty space to pan · scroll to zoom · ? for help',
    wall:'Drag to draw a wall — snaps to 90° and wall ends · Shift = free angle · keeps drawing until Esc',
    room:'Drag a rectangle to create four walls at once',
    door:'Click on a wall to place a door · then drag it along the wall',
    window:'Click on a wall to place a window · then drag it along the wall',
    poly:'Click to add outline points · double-click or Enter to close the shape · Esc cancels',
    draw:'Draw freehand — great with a pen / Apple Pencil · strokes become selectable objects · Esc to stop',
    gap:'Click a wall to cut a gap in it — select the gap to widen or remove it',
    crop:'Drag a rectangle around the area you want to export',
  };
  document.getElementById('hint').textContent = hints[t] || '';
  render();
}
document.querySelectorAll('#toolbar button[data-tool]').forEach(b =>
  b.addEventListener('click', () => setTool(b.dataset.tool)));
document.getElementById('fitBtn').addEventListener('click', zoomFit);
document.getElementById('noteBtn').addEventListener('click', addNoteAtCenter);

function syncSunBtn(){
  const s = activeShot().sun;
  document.getElementById('sunBtn').classList.toggle('on', !!(s && s.on));
}
document.getElementById('sunBtn').addEventListener('click', ()=>{
  const shot = activeShot();
  if(shot.sun && shot.sun.on){
    shot.sun.on = false;
    if(sel && sel.type==='sun') sel = null;
  } else {
    const c = toWorld(wrap.clientWidth*.5, wrap.clientHeight*.22);
    shot.sun = {on:true, x:(shot.sun&&shot.sun.x)||c.x, y:(shot.sun&&shot.sun.y)||c.y, hour:(shot.sun&&shot.sun.hour)||14};
    sel = {type:'sun'};
  }
  markDirty(); syncSunBtn(); render(); refreshSelBar();
});

function updateZoomPct(){ document.getElementById('zoomPct').textContent = Math.round(view.scale*100)+'%'; }
function zoomAtCenter(f){
  const cx = wrap.clientWidth/2, cy = wrap.clientHeight/2;
  const before = toWorld(cx,cy);
  view.scale = clamp(view.scale*f, .04, 8);
  const after = toWorld(cx,cy);
  view.x += before.x-after.x; view.y += before.y-after.y;
  updateZoomPct(); render();
}
document.getElementById('zoomIn').addEventListener('click', ()=>zoomAtCenter(1.25));
document.getElementById('zoomOut').addEventListener('click', ()=>zoomAtCenter(1/1.25));
document.getElementById('zoomPct').addEventListener('click', ()=>{ view.scale = 1; updateZoomPct(); render(); });

// ---------------------------------------------------------------- playback
const anim = {playing:false, t0:0, dur:5000};
function togglePlay(force){
  const on = force !== undefined ? force : !anim.playing;
  anim.playing = on;
  const b = document.getElementById('playBtn');
  if(b) b.classList.toggle('on', on);
  if(on){ anim.t0 = performance.now(); requestAnimationFrame(animFrame); }
  else render();
}
function animFrame(){
  if(!anim.playing) return;
  render();
  requestAnimationFrame(animFrame);
}
function animProgress(){
  const cycle = anim.dur + 1000; // hold a beat at the end positions
  const e = (performance.now() - anim.t0) % cycle;
  return clamp(e/anim.dur, 0, 1);
}
const lerp = (a,b,t)=>a+(b-a)*t;
const lerpAng = (a,b,t)=>norm(a + norm(b-a)*t);
let framePoses = {};
function poseOf(o, shot, t){
  if(framePoses[o.id]) return framePoses[o.id];
  let g = o;
  if(o.cat === 'camera' && o.mount){
    const j = shot.objects.find(x=>x.id===o.mount.id && isCrane(x));
    if(j){
      const pj = poseOf(j, shot, t);
      const hp = jibHeadPos(pj);
      g = {...o, x:hp.x, y:hp.y, rot:norm(pj.rot + (o.mount.relRot||0))};
    }
  } else if(o.path && o.path.length && o.kind !== 'track'){
    if(isCrane(o)){
      const b0 = jibBasePos(o);
      const keys = [{x:b0.x, y:b0.y, rot:o.rot, len:armLen(o)},
        ...o.path.map(p=>({x:p.x, y:p.y, rot:p.rot ?? o.rot, len:p.len ?? armLen(o)}))];
      const n = keys.length - 1;
      const f = clamp(t*n, 0, n - 1e-6);
      const i = Math.floor(f), lt = f - i;
      const a = keys[i], b = keys[i+1];
      const rot = lerpAng(a.rot, b.rot, lt);
      const len = lerp(a.len, b.len, lt);
      const bx = lerp(a.x, b.x, lt), by = lerp(a.y, b.y, lt);
      const w = len + 0.72*o.h, lx = -w/2 + o.h*.5;
      g = {...o, w, rot, x:bx - lx*Math.cos(rot), y:by - lx*Math.sin(rot), path:[], rail:null};
    } else {
      const pts = pathPoints(o);
      const smp = samplePath(pts, o.pathStraight, 10);
      const cum = [0];
      for(let i=1;i<smp.length;i++) cum.push(cum[i-1]+dist(smp[i-1].x,smp[i-1].y,smp[i].x,smp[i].y));
      const total = cum[cum.length-1] || 1;
      const pos = sampleAtDist(smp, cum, t*total);
      // keyframe timing by straight-line spacing; rot / framing interpolate per segment
      const cumK = [0];
      for(let i=1;i<pts.length;i++) cumK.push(cumK[i-1]+Math.max(1,dist(pts[i-1].x,pts[i-1].y,pts[i].x,pts[i].y)));
      const totK = cumK[cumK.length-1] || 1;
      const dK = t*totK;
      let i = 0;
      while(i < pts.length-2 && cumK[i+1] < dK) i++;
      const lt = clamp((dK - cumK[i]) / Math.max(1, cumK[i+1]-cumK[i]), 0, 1);
      const rA = i===0 ? o.rot : prot(o, i-1);
      const rB = prot(o, i);
      g = {...o, x:pos.x, y:pos.y, rot:lerpAng(rA, rB, lt), path:[]};
      if(o.cat === 'camera'){
        const fA = i===0 ? o.fov : (o.path[i-1].fov ?? o.fov);
        const fB = o.path[i].fov ?? o.fov;
        const gA = i===0 ? o.range : (o.path[i-1].range ?? o.range);
        const gB = o.path[i].range ?? o.range;
        g.fov = lerp(fA, fB, lt);
        g.range = lerp(gA, gB, lt);
      }
    }
  }
  framePoses[o.id] = g;
  return g;
}
document.getElementById('playBtn').addEventListener('click', ()=>togglePlay());

function frameExtents(o){
  if(o.cat !== 'camera' || !o.imgId) return null;
  const fx = o.x + (o.frameDX ?? 70), fy = o.y + (o.frameDY ?? -85);
  return {minX:fx-75, minY:fy-48, maxX:fx+75, maxY:fy+48};
}
function contentBounds(shot){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const add=(x,y)=>{minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);};
  for(const w of shot.walls){ add(w.x1,w.y1); add(w.x2,w.y2); }
  for(const o of shot.objects){
    if(o.kind === 'track'){
      (o.pts||[]).forEach(p=>{ add(p.x-40,p.y-40); add(p.x+40,p.y+40); });
      continue;
    }
    const r = Math.max(o.w,o.h)/2 + (o.cat==='camera' ? o.range : 0);
    add(o.x-r,o.y-r); add(o.x+r,o.y+r);
    const fe = frameExtents(o);
    if(fe){ add(fe.minX, fe.minY); add(fe.maxX, fe.maxY); }
    if(o.path) for(const p of o.path){
      const pr = (o.cat==='camera' ? (p.range ?? o.range) : 0) + 60;
      add(p.x-pr,p.y-pr); add(p.x+pr,p.y+pr);
    }
  }
  if(shot.sun && shot.sun.on){ add(shot.sun.x-90, shot.sun.y-90); add(shot.sun.x+90, shot.sun.y+90); }
  if(minX===Infinity) return null;
  return {minX,minY,maxX,maxY};
}
function zoomFit(){
  const b = contentBounds(activeShot());
  if(!b){ view.x=-wrap.clientWidth/2; view.y=-wrap.clientHeight/2; view.scale=1; updateZoomPct(); render(); return; }
  const pad = 90;
  const w = b.maxX-b.minX+pad*2, h = b.maxY-b.minY+pad*2;
  view.scale = clamp(Math.min(wrap.clientWidth/w, wrap.clientHeight/h), .04, 3);
  view.x = b.minX-pad - (wrap.clientWidth/view.scale - w)/2;
  view.y = b.minY-pad - (wrap.clientHeight/view.scale - h)/2;
  updateZoomPct(); render();
}
