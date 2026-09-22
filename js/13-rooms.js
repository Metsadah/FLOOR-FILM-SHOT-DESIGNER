// Floorboard — 13-rooms.js · the room library
// Rooms you scouted, drawn by hand or scanned (LiDAR / AR, via the Scout app
// later) live in ONE library per account, independent of productions. From
// the Shot designer: "Save this scene as a room" and "Insert room…".
//
// STORAGE: window.storage keys 'sd:room:<id>' (JSON string) — per browser in
// local mode, per user in the cloud (kv table), so the Scout app writes the
// very same rows. Format (ROOMS.md has the full spec), units = cm, y down:
//   {v:1, id, name, location, source:'manual'|'roomplan'|'arkit', createdAt,
//    updatedAt, walls:[{x1,y1,x2,y2, openings:[{t,w,type,flip}]}],
//    props:[{kind,x,y,rot,w,h,label}], notes, thumb, bbox:{w,h}}
// Coordinates are normalised so the room's bounding-box centre is (0,0).
'use strict';
const ROOM_PREFIX = 'sd:room:';
const ROOM_SOURCES = {manual:'Drawn', roomplan:'LiDAR scan', arkit:'AR scan', import:'Imported'};
let _rooms = null; // cache: [{...room}] newest first

function roomBBox(room){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y)=>{ x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for(const w of room.walls || []){ add(w.x1, w.y1); add(w.x2, w.y2); }
  for(const p of room.props || []){ const r = Math.max(p.w || 40, p.h || 40) / 2; add(p.x - r, p.y - r); add(p.x + r, p.y + r); }
  if(x0 === Infinity) return {x0:0, y0:0, x1:0, y1:0, w:0, h:0};
  return {x0, y0, x1, y1, w:x1 - x0, h:y1 - y0};
}
// ---------------------------------------------------------------- square up
// Scans come in a degree or two off, and dragging glued corners can leave a
// wall at 91°. squareUp: rotate everything so the dominant wall direction is
// horizontal, snap each wall that is within 12° of an axis onto it (around
// its midpoint), then re-glue corners that drifted apart. Works on a room
// (walls + props) and on the app's own walls/objects (same shapes).
function squareUpWalls(walls, objs, opts){
  const o = opts || {};
  if(!walls || !walls.length) return 0;
  const norm2 = a=>{ while(a > Math.PI/4) a -= Math.PI/2; while(a < -Math.PI/4) a += Math.PI/2; return a; };
  // dominant direction (mod 90°), length-weighted
  let sx = 0, sy = 0;
  for(const w of walls){ const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1); const a = Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 4; sx += Math.cos(a) * L; sy += Math.sin(a) * L; }
  const theta = Math.atan2(sy, sx) / 4; // in (-45°, 45°]
  let cx = 0, cy = 0, n = 0;
  for(const w of walls){ cx += w.x1 + w.x2; cy += w.y1 + w.y2; n += 2; }
  cx /= n; cy /= n;
  const rot = (p, a)=>{ const c = Math.cos(a), s2 = Math.sin(a); const dx = p.x - cx, dy = p.y - cy; return {x:cx + dx * c - dy * s2, y:cy + dx * s2 + dy * c}; };
  const apply = a=>{
    for(const w of walls){ const p1 = rot({x:w.x1, y:w.y1}, a), p2 = rot({x:w.x2, y:w.y2}, a); w.x1 = p1.x; w.y1 = p1.y; w.x2 = p2.x; w.y2 = p2.y; if(w.mid){ w.mid = rot(w.mid, a); } }
    for(const ob of (objs || [])){ const p = rot({x:ob.x, y:ob.y}, a); ob.x = p.x; ob.y = p.y; ob.rot = (ob.rot || 0) + a; if(ob.pts) ob.pts = ob.pts.map(q=>Object.assign({}, q, rot(q, a))); if(ob.path) ob.path = ob.path.map(q=>Object.assign({}, q, rot(q, a), q.rot != null ? {rot:q.rot + a} : {})); if(ob.p1) ob.p1 = rot(ob.p1, a); if(ob.p2) ob.p2 = rot(ob.p2, a); }
  };
  if(o.rotateAll !== false && Math.abs(theta) > 0.002) apply(-theta);
  let snapped = 0;
  for(const w of walls){
    if(w.mid) continue; // curved walls stay as drawn
    const a = Math.atan2(w.y2 - w.y1, w.x2 - w.x1), d = norm2(a);
    if(Math.abs(d) < 0.001 || Math.abs(d) > (o.tolerance || 12) * Math.PI / 180) continue;
    const q = a - d, L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1), mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
    w.x1 = mx - Math.cos(q) * L / 2; w.y1 = my - Math.sin(q) * L / 2; w.x2 = mx + Math.cos(q) * L / 2; w.y2 = my + Math.sin(q) * L / 2;
    snapped++;
  }
  // re-glue corners: endpoints that were together (within 30 cm) meet again
  const ends = []; for(const w of walls){ ends.push({w, k:'1'}); ends.push({w, k:'2'}); }
  const P = e=>({x:e.w['x' + e.k], y:e.w['y' + e.k]});
  const seen = new Set();
  for(let i = 0; i < ends.length; i++){
    if(seen.has(i)) continue;
    const grp = [i];
    for(let j = i + 1; j < ends.length; j++){ if(seen.has(j) || ends[j].w === ends[i].w) continue; const a = P(ends[i]), b = P(ends[j]); if(Math.hypot(a.x - b.x, a.y - b.y) <= 30) grp.push(j); }
    if(grp.length > 1){
      // meet at the corner an axis-aligned pair would make; otherwise the average
      let gx = 0, gy = 0; for(const g of grp){ const p = P(ends[g]); gx += p.x; gy += p.y; }
      gx /= grp.length; gy /= grp.length;
      for(const g of grp){ const e = ends[g]; const other = e.k === '1' ? {x:e.w.x2, y:e.w.y2} : {x:e.w.x1, y:e.w.y1}; const horiz = Math.abs(other.y - P(e).y) < Math.abs(other.x - P(e).x); if(horiz){ e.w['x' + e.k] = gx; e.w['y' + e.k] = other.y; } else { e.w['x' + e.k] = other.x; e.w['y' + e.k] = gy; } seen.add(g); }
    }
  }
  return snapped;
}
function roomNormalise(room){
  if(room.source === 'roomplan' || room.source === 'arkit') squareUpWalls(room.walls, room.props); // scans come in a little off
  const b = roomBBox(room);
  const cx = b.x0 + b.w / 2, cy = b.y0 + b.h / 2;
  for(const w of room.walls || []){ w.x1 -= cx; w.y1 -= cy; w.x2 -= cx; w.y2 -= cy; }
  for(const p of room.props || []){ p.x -= cx; p.y -= cy; }
  room.bbox = {w:Math.round(b.w), h:Math.round(b.h)};
  return room;
}
// the room drawn in this scene (walls + furniture; cameras, cast and light stay out)
function roomFromScene(s, name, location){
  const isFurniture = o=>o.cat === 'prop' && !(typeof GEAR_KINDS !== 'undefined' && GEAR_KINDS.has(o.kind)) &&
    !(typeof PROPLIST_SKIP !== 'undefined' && PROPLIST_SKIP.has(o.kind));
  const room = {
    v:1, id:uid(), name:(name || s.sceneDesc || s.name || 'Room').trim(), location:(location || '').trim(), source:'manual',
    createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
    walls:(s.walls || []).map(w=>({x1:w.x1, y1:w.y1, x2:w.x2, y2:w.y2,
      openings:(w.openings || []).filter(o=>o.type !== 'outlet').map(o=>({t:o.t, w:o.w, type:o.type, flip:!!o.flip}))})),
    props:(s.objects || []).filter(isFurniture).map(o=>({kind:o.kind, x:o.x, y:o.y, rot:o.rot || 0, w:o.w, h:o.h, label:o.label || ''})),
    notes:''
  };
  roomNormalise(room);
  room.thumb = roomThumb(room);
  return room;
}
// small light-theme plan: walls via the real renderer, furniture as soft blocks
function roomThumb(room, size){
  const S = size || 220;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const b = roomBBox(room);
  const k = Math.min((S - 24) / Math.max(b.w, 1), (S - 24) / Math.max(b.h, 1), 1.5);
  const run = ()=>{
    const prevCtx = ctx, prevView = Object.assign({}, view);
    ctx = c.getContext('2d');
    try{
      ctx.fillStyle = THEME.card; ctx.fillRect(0, 0, S, S);
      ctx.setTransform(k, 0, 0, k, S / 2 - (b.x0 + b.w / 2) * k, S / 2 - (b.y0 + b.h / 2) * k);
      view.scale = k;
      for(const p of room.props || []){
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
        ctx.fillStyle = THEME.soft; ctx.strokeStyle = THEME.line2; ctx.lineWidth = 1.5 / k;
        ctx.beginPath(); ctx.roundRect(-(p.w || 40) / 2, -(p.h || 40) / 2, p.w || 40, p.h || 40, 4 / k); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      const fake = {walls:(room.walls || []).map(w=>({id:'t', x1:w.x1, y1:w.y1, x2:w.x2, y2:w.y2, openings:(w.openings || []).map(o=>({id:'o', t:o.t, w:o.w, type:o.type, flip:o.flip}))}))};
      if(typeof drawWalls === 'function') drawWalls(fake);
    } finally { ctx = prevCtx; Object.assign(view, prevView); }
  };
  if(typeof withLightTheme === 'function') withLightTheme(run); else run();
  return c.toDataURL('image/jpeg', .82);
}
// ---------------------------------------------------------------- storage
async function roomsList(force){
  if(_rooms && !force) return _rooms;
  const out = [];
  try{
    const {keys} = await window.storage.list(ROOM_PREFIX);
    const rows = await Promise.all((keys || []).map(k=>window.storage.get(k).catch(()=>null)));
    for(const r of rows){
      if(!r || !r.value) continue;
      try{ const room = typeof r.value === 'string' ? JSON.parse(r.value) : r.value; if(room && room.walls) out.push(room); }catch(_){}
    }
  }catch(e){ console.warn('rooms list failed', e); }
  out.sort((a, b)=>String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  _rooms = out;
  return out;
}
async function roomSave(room){
  room.updatedAt = new Date().toISOString();
  await window.storage.set(ROOM_PREFIX + room.id, JSON.stringify(room));
  _rooms = null;
}
async function roomDelete(id){
  await window.storage.delete(ROOM_PREFIX + id);
  _rooms = null;
}
// ---------------------------------------------------------------- insert into the active scene
function insertRoomIntoScene(room, opts){
  const s = activeScene();
  const o = opts || {};
  if(o.replace){ s.walls = []; s.objects = (s.objects || []).filter(ob=>!(ob.cat === 'prop' && ob._fromRoom)); }
  const c = toWorld(cv.clientWidth / 2, cv.clientHeight / 2);
  const cx = Math.round(c.x / 10) * 10, cy = Math.round(c.y / 10) * 10;
  for(const w of room.walls || []){
    s.walls.push({id:uid(), x1:w.x1 + cx, y1:w.y1 + cy, x2:w.x2 + cx, y2:w.y2 + cy, locked:false,
      openings:(w.openings || []).map(op=>({id:uid(), t:op.t, w:op.w, type:op.type || 'door', flip:!!op.flip}))});
  }
  const col = (typeof TYPE_COLOR !== 'undefined' && TYPE_COLOR.prop) || PAL.sand;
  for(const p of room.props || []){
    if(!p.kind) continue;
    s.objects.push({id:uid(), cat:'prop', kind:p.kind, x:p.x + cx, y:p.y + cy, rot:p.rot || 0, w:p.w || 40, h:p.h || 40,
      color:col, label:p.label || '', path:[], _fromRoom:room.id});
  }
  sel = null;
  markDirty();
  if(typeof zoomFit === 'function') zoomFit();
  render(); refreshSelBar();
  toast('"' + room.name + '" placed — ' + (room.walls || []).length + ' walls, ' + (room.props || []).length + ' pieces');
}
// ---------------------------------------------------------------- overlay
async function roomLibraryOverlay(){
  const el = document.createElement('div');
  el.className = 'fb-ov';
  el.innerHTML = '<div class="fb-ov-box" style="width:760px"><div class="fb-ov-title">Room library</div>' +
    '<div class="fb-ov-sub">Every room you scouted, in one place across productions. Save the room drawn in this scene, or drop a saved one onto the board. Scans from the Floorboard Scout app (LiDAR on Pro devices, AR on the rest) land here too.</div>' +
    '<div class="fb-row" style="margin-bottom:10px;flex-wrap:wrap"><button class="btn primary" id="rmSave">Save this scene as a room…</button>' +
    (scanPlugin() ? '<button class="btn" id="rmScan">Scan a room…</button>' : '<span class="fb-dim" style="flex:none" title="Scanning needs the camera — it lives in the iPad app and the Scout app">Scan: iPad / Scout app</span>') +
    '<input id="rmFilter" class="fb-inp" placeholder="Filter by name or location" style="flex:1;min-width:180px"><span id="rmCount" class="fb-dim" style="flex:none"></span></div>' +
    '<div id="rmSaveForm" class="fb-row" style="display:none;gap:8px;margin-bottom:10px;flex-wrap:wrap"><input id="rmName" class="fb-inp" placeholder="Room name (Kitchen, Studio 2…)" style="flex:1;min-width:160px">' +
    '<input id="rmLoc" class="fb-inp" placeholder="Location (address or place)" style="flex:1;min-width:160px"><button class="btn primary" id="rmSaveGo">Save</button><button class="btn" id="rmSaveNo">Cancel</button></div>' +
    '<div id="rmGrid" class="rm-groups"><p class="fb-dim">Loading…</p></div>' +
    '<div class="fb-ov-actions"><span class="fb-dim">Insert puts the room at the middle of your view; furniture comes as props you can move.</span><span style="flex:1"></span><button class="btn" id="rmClose">Close</button></div></div>';
  document.body.appendChild(el);
  el.addEventListener('keydown', e=>e.stopPropagation());
  el.querySelector('#rmClose').addEventListener('click', ()=>el.remove());
  el.addEventListener('click', e=>{ if(e.target === el) el.remove(); });
  const onDesign = activeTab === 'design';
  const s = onDesign ? activeScene() : (project.scenes.find(x=>x.id === project.activeSceneId) || project.scenes[0]);
  const hasRoom = onDesign && (s.walls || []).length > 0;
  const saveBtn = el.querySelector('#rmSave'), form = el.querySelector('#rmSaveForm');
  saveBtn.disabled = !hasRoom;
  saveBtn.title = onDesign ? (hasRoom ? '' : 'Draw walls in this scene first (Wall / Room tools)') : 'Saving works from the Shot designer (2nd floor) — the scene you are in becomes the room';
  saveBtn.addEventListener('click', ()=>{ form.style.display = 'flex'; el.querySelector('#rmName').value = s.sceneDesc || ''; el.querySelector('#rmName').focus(); });
  el.querySelector('#rmSaveNo').addEventListener('click', ()=>{ form.style.display = 'none'; });
  const scanBtn = el.querySelector('#rmScan');
  if(scanBtn) scanBtn.addEventListener('click', ()=>{ el.remove(); scanRoomOverlay(); });
  el.querySelector('#rmSaveGo').addEventListener('click', async ()=>{
    const room = roomFromScene(s, el.querySelector('#rmName').value, el.querySelector('#rmLoc').value);
    await roomSave(room);
    form.style.display = 'none';
    toast('"' + room.name + '" saved to your room library');
    draw();
  });
  const grid = el.querySelector('#rmGrid');
  let rooms = [];
  const collapsed = new Set(); try{ JSON.parse(localStorage.floorRoomGroupsClosed || '[]').forEach(x=>collapsed.add(x)); }catch(_){}
  const remember = ()=>{ try{ localStorage.floorRoomGroupsClosed = JSON.stringify([...collapsed]); }catch(_){} };
  const draw = async ()=>{
    rooms = await roomsList(true);
    const q = el.querySelector('#rmFilter').value.trim().toLowerCase();
    const list = rooms.filter(r=>!q || (r.name + ' ' + r.location).toLowerCase().includes(q));
    el.querySelector('#rmCount').textContent = list.length + ' room' + (list.length === 1 ? '' : 's');
    if(!list.length){
      grid.innerHTML = '<p class="fb-dim" style="grid-column:1/-1;padding:18px 4px">' + (rooms.length ? 'Nothing matches.' :
        'No rooms yet. Draw a room in a scene and save it here — or scan one with Floor Scanner on your iPhone.') + '</p>';
      return;
    }
    // grouped by location — a scouting trip stays together; groups fold away
    const groups = [];
    for(const r of list){ const key = (r.location || '').trim() || 'No location'; let g = groups.find(x=>x.key === key); if(!g){ g = {key, rooms:[], newest:''}; groups.push(g); } g.rooms.push(r); if((r.updatedAt || '') > g.newest) g.newest = r.updatedAt || ''; }
    groups.sort((x, y)=> (x.key === 'No location') - (y.key === 'No location') || y.newest.localeCompare(x.newest));
    const card = r=>`
      <div class="rm-card" data-id="${r.id}">
        <div class="rm-thumb">${r.thumb ? '<img src="' + r.thumb + '" alt="">' : ''}</div>
        <div class="rm-meta"><b>${esc(r.name || 'Room')}</b><span>${esc(r.location || '')}</span>
          <small>${r.bbox ? (r.bbox.w / 100).toFixed(1) + ' × ' + (r.bbox.h / 100).toFixed(1) + ' m · ' : ''}${(r.walls || []).length} walls · ${(r.props || []).length} pieces</small>
          <i class="rm-src rm-${esc(r.source || 'manual')}">${ROOM_SOURCES[r.source] || 'Drawn'}</i></div>
        <div class="rm-actions"><button class="btn primary" data-act="insert">Insert</button><button class="btn" data-act="rename" title="Rename / relocate">✎</button><button class="btn" data-act="del" title="Delete from the library">×</button></div>
      </div>`;
    grid.innerHTML = groups.map(g=>{
      const open = q ? true : !collapsed.has(g.key);
      return '<div class="rm-group' + (open ? '' : ' closed') + '" data-key="' + esc(g.key) + '"><button class="rm-group-head"><span class="arr">▾</span><b>' + esc(g.key) + '</b><span>' + g.rooms.length + ' room' + (g.rooms.length === 1 ? '' : 's') + '</span></button>' +
        '<div class="rm-group-body">' + (open ? g.rooms.map(card).join('') : '') + '</div></div>';
    }).join('');
    grid.querySelectorAll('.rm-group-head').forEach(h=>h.addEventListener('click', ()=>{ const k = h.parentElement.dataset.key; if(collapsed.has(k)) collapsed.delete(k); else collapsed.add(k); remember(); draw(); }));
  };
  el.querySelector('#rmFilter').addEventListener('input', draw);
  grid.addEventListener('click', async e=>{
    const btn = e.target.closest('button[data-act]'); if(!btn) return;
    const card = btn.closest('.rm-card'); const room = rooms.find(r=>r.id === card.dataset.id); if(!room) return;
    if(btn.dataset.act === 'insert'){
      if(!onDesign){ switchTab('design'); }
      let replace = false;
      if((activeScene().walls || []).length) replace = confirm('This scene already has walls.\n\nOK = replace them with "' + room.name + '"\nCancel = add the room next to them');
      insertRoomIntoScene(room, {replace});
      el.remove();
    } else if(btn.dataset.act === 'rename'){
      const name = prompt('Room name', room.name || ''); if(name === null) return;
      const loc = prompt('Location', room.location || ''); if(loc === null) return;
      room.name = name.trim() || room.name; room.location = loc.trim();
      await roomSave(room); draw();
    } else if(btn.dataset.act === 'del'){
      if(!confirm('Delete "' + room.name + '" from your room library?')) return;
      await roomDelete(room.id); draw();
    }
  });
  draw();
}
(function(){
  const b = document.getElementById('roomLibBtn');
  if(b) b.addEventListener('click', ()=>roomLibraryOverlay());
})();

// ---------------------------------------------------------------- scanning (native plugin)
// Two methods, always both on screen so nobody wonders where LiDAR went:
//   LiDAR (RoomPlan) — Pro iPhones / iPads only; walls, openings AND furniture
//   Camera (ARKit)   — every device; tap the floor corners, then doors / windows
function scanPlugin(){
  const C = window.Capacitor;
  if(!C || !(C.isNativePlatform ? C.isNativePlatform() : C.isNative)) return null;
  return (C.Plugins && C.Plugins.FloorboardScan) || null;
}
async function scanRoomOverlay(){
  const P = scanPlugin();
  if(!P){ toast('Scanning needs the camera — use the iPad app or the Scout app'); return; }
  let cap = {lidar:false, ar:true};
  try{ cap = await P.capabilities(); }catch(_){}
  const el = document.createElement('div');
  el.className = 'fb-ov';
  el.innerHTML = '<div class="fb-ov-box" style="width:560px"><div class="fb-ov-title">Scan a room</div>' +
    '<div class="fb-ov-sub">Give the room a name, pick a method. Both give you walls with doors and windows you can edit afterwards; LiDAR also finds the furniture.</div>' +
    '<div class="fb-row" style="gap:8px;margin-bottom:12px;flex-wrap:wrap"><input id="scName" class="fb-inp" placeholder="Room name (Kitchen, Studio 2…)" style="flex:1;min-width:160px"><input id="scLoc" class="fb-inp" placeholder="Location" style="flex:1;min-width:140px"></div>' +
    '<div class="rm-methods">' +
      '<button class="rm-method' + (cap.lidar ? '' : ' off') + '" data-m="lidar"><b>LiDAR scan</b><span>Walk around the room with the camera. Walls, doors, windows and furniture come out measured — the most precise option.</span>' +
        '<i>' + (cap.lidar ? 'Available on this device' : 'Needs a Pro iPhone or iPad with a LiDAR sensor — not on this device') + '</i></button>' +
      '<button class="rm-method' + (cap.ar ? '' : ' off') + '" data-m="camera"><b>Measure with camera</b><span>Point at the floor and tap each corner of the room, close it, then tap the start and end of every door or window. Works on every device; a little less precise.</span>' +
        '<i>' + (cap.ar ? 'Available on this device' : 'This device cannot run AR') + '</i></button>' +
    '</div>' +
    '<div class="fb-ov-actions"><span class="fb-dim">Tip: clear the floor corners of clutter and move slowly — good light helps both methods.</span><span style="flex:1"></span><button class="btn" id="scNo">Cancel</button></div></div>';
  document.body.appendChild(el);
  el.addEventListener('keydown', e=>e.stopPropagation());
  el.querySelector('#scNo').addEventListener('click', ()=>el.remove());
  el.addEventListener('click', e=>{ if(e.target === el) el.remove(); });
  el.querySelectorAll('.rm-method').forEach(b=>b.addEventListener('click', async ()=>{
    if(b.classList.contains('off')) { toast(b.querySelector('i').textContent); return; }
    const name = el.querySelector('#scName').value.trim() || 'Scanned room';
    const location = el.querySelector('#scLoc').value.trim();
    el.remove();
    try{
      const res = b.dataset.m === 'lidar' ? await P.scanLidar({name}) : await P.scanCamera({name});
      const room = res && res.room;
      if(!room || !room.walls || !room.walls.length){ toast('The scan came back empty — try again with the whole room in view'); return; }
      room.v = 1; room.id = uid(); room.name = name; room.location = location;
      room.source = room.source || (b.dataset.m === 'lidar' ? 'roomplan' : 'arkit');
      room.createdAt = room.updatedAt = new Date().toISOString();
      room.props = room.props || []; room.notes = room.notes || '';
      roomNormalise(room);
      room.thumb = roomThumb(room);
      await roomSave(room);
      toast('"' + name + '" saved — ' + room.walls.length + ' walls, ' + room.props.length + ' pieces (' + (ROOM_SOURCES[room.source] || room.source) + ')');
      roomLibraryOverlay();
    }catch(e){
      const code = e && (e.code || (e.data && e.data.code));
      if(code === 'cancelled' || /cancel/i.test(e && e.message || '')) { roomLibraryOverlay(); return; }
      toast('Scan failed: ' + (e && e.message || e));
      console.warn('[scan]', e);
    }
  }));
}
