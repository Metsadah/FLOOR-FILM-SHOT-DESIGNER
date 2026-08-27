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
  // setups: after any JSON round-trip the active setup must SHARE the
  // s.objects reference again, or edits silently stop reaching the setup
  if(s.setups && s.setupId){
    const su = s.setups.find(x=>x.id === s.setupId);
    if(su) su.objects = s.objects;
  }
}
// ---------------------------------------------------------------- scene setups
// Lighting/blocking VARIANTS inside one scene (Setup A/B/…). Each setup owns
// an objects array; walls, stills, script and shots stay scene-level. Nothing
// materializes until a second setup is added, so old scenes stay untouched.
function activeSetupOf(s){
  return s.setups ? (s.setups.find(x=>x.id === s.setupId) || s.setups[0]) : null;
}
function addSetup(s){
  if(!s.setups){
    s.setups = [{id:uid(), name:'Setup A', objects:s.objects}];
    s.setupId = s.setups[0].id;
  }
  // the new setup starts as a copy of the CURRENT one — tweak from there
  const src = activeSetupOf(s);
  const copy = JSON.parse(JSON.stringify(s.objects));
  const map = {};
  copy.forEach(ob=>{ const nid = uid(); map[ob.id] = nid; ob.id = nid; });
  copy.forEach(ob=>{
    if(ob.mount && map[ob.mount.id]) ob.mount.id = map[ob.mount.id];
    if(ob.rail && map[ob.rail.id]) ob.rail.id = map[ob.rail.id];
  });
  const su = {id:uid(), name:'Setup ' + String.fromCharCode(65 + s.setups.length), objects:copy};
  s.setups.push(su);
  switchSetup(s, su.id);
}
function switchSetup(s, id){
  if(!s.setups) return;
  const su = s.setups.find(x=>x.id === id);
  if(!su || id === s.setupId) return;
  exitAllSubboards(); // the stack points into the outgoing objects array
  const cur = activeSetupOf(s);
  if(cur) cur.objects = s.objects; // store the working array back
  s.objects = su.objects;
  s.setupId = id;
  sel = null; drag = null;
  closeNoteEditor(true);
  markDirty(); render();
}
// ---------------------------------------------------------------- People registry
// One list per production; the Crew / Cast / Client cards on the production
// board are filtered live views of it — windows, not silos.
function normalizeProduction(){
  if(!project.production) project.production = {company:'', lead:'', notes:'', contacts:[], locations:[]};
  const p = project.production;
  if(!Array.isArray(p.people)) p.people = [];
  // org-panel era: fold its contacts into the registry once, tagged crew
  if(Array.isArray(p.contacts) && p.contacts.length){
    for(const c of p.contacts){
      p.people.push({id:uid(), name:c.name||'', role:c.role||'', phone:c.phone||'',
        email:c.email||'', tag:'crew', call:''});
    }
    p.contacts = [];
  }
  // P2 field-card backing: production contact fields + richer locations
  if(p.address === undefined) p.address = '';
  if(p.email === undefined) p.email = '';
  if(p.phone === undefined) p.phone = '';
  if(!Array.isArray(p.locations)) p.locations = [];
  p.locations.forEach(l=>{
    if(!l.id) l.id = uid();
    for(const k of ['name','address','street','town','country','parking','power','hospital','notes'])
      if(l[k] === undefined) l[k] = '';
    // pre-v0.24 single address line becomes the street (best effort)
    if(l.address && !l.street && !l.town){
      const parts = l.address.split(',').map(s=>s.trim());
      l.street = parts[0] || '';
      l.town = parts[1] || '';
      l.address = '';
    }
  });
}
// field-card value routing: prodinfo ↔ production/shootName, location ↔ locations[locId]
function fieldGet(o, key){
  normalizeProduction();
  const p = project.production;
  if(o.kind === 'prodinfo') return key === 'name' ? (project.shootName || '') : (p[key] || '');
  const loc = p.locations.find(l=>l.id===o.locId);
  return (loc && loc[key]) || '';
}
function fieldSet(o, key, v){
  normalizeProduction();
  const p = project.production;
  if(o.kind === 'prodinfo'){
    if(key === 'name') project.shootName = v;
    else p[key] = v;
    return;
  }
  let loc = p.locations.find(l=>l.id===o.locId);
  if(!loc){
    loc = {id:o.locId || uid(), name:'', address:'', parking:'', power:'', hospital:'', notes:''};
    o.locId = loc.id;
    p.locations.push(loc);
  }
  loc[key] = v;
}
function peopleReg(){ normalizeProduction(); return project.production.people; }
function cardPeople(o){
  const tag = (LIST_CARDS[o.kind] || LIST_CARDS.crew).tag;
  return peopleReg().filter(p=>p.tag===tag);
}
// reorder within one card's view: move a person to filtered position targetIdx,
// keeping people of other tags where they are
function moveListRow(o, personId, targetIdx){
  const people = peopleReg();
  const rows = cardPeople(o);
  const from = rows.findIndex(p=>p.id===personId);
  const to = clamp(targetIdx, 0, rows.length-1);
  if(from < 0 || from === to) return false;
  const person = rows[from];
  people.splice(people.indexOf(person), 1);
  const rest = cardPeople(o);
  const at = to >= rest.length
    ? (rest.length ? people.indexOf(rest[rest.length-1]) + 1 : people.length)
    : people.indexOf(rest[to]);
  people.splice(at, 0, person);
  return true;
}

// ---------------------------------------------------------------- day schedule model
// The schedule card owns an ORDERED item list: scene rows (auto-synced with
// project.scenes) plus free blocks (break / location change / prep). Times
// chain from the shooting call; a row's manual time PINS the chain there.
function schedItems(o){
  if(!o.items){
    // migrate the v0.24 shape (o.on include-map) into ordered rows
    o.items = project.scenes.map(s=>({id:uid(), type:'scene', sceneId:s.id,
      on: !(o.on && o.on[s.id] === false), label:'', time:'', dur:null}));
  }
  for(const s of project.scenes)
    if(!o.items.some(it=>it.sceneId === s.id))
      o.items.push({id:uid(), type:'scene', sceneId:s.id, on:true, label:'', time:'', dur:null});
  o.items = o.items.filter(it=>it.type !== 'scene' || project.scenes.some(s=>s.id === it.sceneId));
  return o.items;
}
function computeSchedule(o, day){
  const items = schedItems(o);
  let t = day ? (toMinutes(day.shootCall) ?? toMinutes(day.call) ?? 480) : 480;
  const rows = [];
  for(const it of items){
    const s = it.type === 'scene' ? project.scenes.find(x=>x.id === it.sceneId) : null;
    const pin = toMinutes(it.time);
    let start = null, dur, label = it.label;
    if(it.type === 'scene'){
      // scene length comes from the shot designer — unless overridden here
      dur = it.dur != null ? it.dur : ((s && s.duration) || 60);
      if(!label) label = s ? ((s.scene ? s.scene + ' · ' : '') + (s.sceneDesc || s.name)) : '?';
      if(it.on !== false){
        t += s ? (s.travelMin || 0) + (s.setupMin || 0) : 0;
        if(pin != null) t = pin;
        start = t; t += dur;
      }
    } else {
      dur = it.dur || 30;
      if(!label) label = it.type === 'break' ? 'Break' : it.type === 'move' ? 'Location change' : 'Prep / build';
      if(it.on !== false){
        if(pin != null) t = pin;
        start = t; t += dur;
      }
    }
    rows.push({it, s, start, dur, label});
  }
  return {rows, wrap: minToHHMM(t)};
}

// ---------------------------------------------------------------- shoot days
// Multi-day productions: several Day header cards live on the production
// board. Schedule and call sheet cards BIND to one via o.dayId (selection
// bar cycles it); unbound cards follow the first day, so single-day
// productions never notice any of this.
function boardDays(){
  const b = project && project.prodboard;
  if(!b) return [];
  return b.objects.filter(x=>x.cat === 'dayheader')
    .sort((a, c)=>String(a.date || '9999').localeCompare(String(c.date || '9999')));
}
function dayFor(o){
  const days = boardDays();
  return days.find(d=>d.id === o.dayId) || days[0] || null;
}
function dayNumber(day){ // "Shoot day N" — position in the date-sorted list
  return boardDays().indexOf(day) + 1;
}
// each day header owns an ORDERED location list (day.locIds) — first entry is
// where the day starts; the same location may appear on several days
function dayLocs(day){
  if(!day || !day.locIds || !day.locIds.length) return [];
  return day.locIds.map(id=>project.production.locations.find(l=>l.id === id)).filter(Boolean);
}

// ---------------------------------------------------------------- prop list model
// The prop list card watches every scene: props PLACED on its board and prop
// names MENTIONED in its script text (the breakdown fills sc.script) appear by
// themselves; manual rows live on the card per scene. o.hide dismisses an auto
// row, o.done ticks one off — both keyed 'sceneId|name' so they survive
// re-detection. Manual rows carry their own done flag.
const PROPLIST_SKIP = new Set(['road','crossing','bikelane','rails']); // infrastructure, not gatherable
function propDisplayName(ob){
  if(PROPS[ob.kind] && PROPS[ob.kind].name) return PROPS[ob.kind].name;
  if(ob.kind && ob.kind.startsWith('custom_')){
    const def = (project.customProps||[]).find(p=>'custom_'+p.id === ob.kind);
    if(def && def.name) return def.name;
  }
  return ob.label || null;
}
function scenePropMentions(s){
  const txt = s.script || '';
  if(s._pmSrc === txt) return s._pmCache || []; // memo — the scan is per-keystroke otherwise
  const found = [], lo = txt.toLowerCase();
  if(lo){
    for(const k in PROPS){
      const nm = PROPS[k].name;
      if(!nm || nm.length < 3 || PROPLIST_SKIP.has(k)) continue;
      if(new RegExp('\\b' + nm.toLowerCase() + 's?\\b').test(lo)) found.push(nm);
    }
  }
  s._pmSrc = txt; s._pmCache = found;
  return found;
}
function propListGroups(o){
  if(!o.props) o.props = {}; // {sceneId: [{id, name, done}]} — manual rows
  if(!o.hide) o.hide = {};
  if(!o.done) o.done = {};
  const groups = [];
  for(const s of project.scenes){
    const rows = [], seen = new Set();
    // 1 · props placed on the scene board (with counts)
    const counts = {};
    for(const ob of s.objects || []){
      if(ob.cat !== 'prop' || PROPLIST_SKIP.has(ob.kind)) continue;
      const nm = propDisplayName(ob);
      if(nm) counts[nm] = (counts[nm] || 0) + 1;
    }
    for(const nm in counts){
      const key = s.id + '|' + nm.toLowerCase();
      seen.add(nm.toLowerCase());
      if(!o.hide[key]) rows.push({key, sceneId:s.id, name:nm, count:counts[nm], auto:true, done:!!o.done[key]});
    }
    // 2 · prop names the script mentions (word-boundary, singular/plural)
    for(const nm of scenePropMentions(s)){
      const lo = nm.toLowerCase(), key = s.id + '|' + lo;
      if(seen.has(lo)) continue;
      seen.add(lo);
      if(!o.hide[key]) rows.push({key, sceneId:s.id, name:nm, count:0, auto:true, script:true, done:!!o.done[key]});
    }
    // 3 · manual rows (closeNoteEditor prunes the ones left nameless)
    for(const r of o.props[s.id] || [])
      rows.push({key:r.id, sceneId:s.id, rowId:r.id, name:r.name, count:0, auto:false, done:!!r.done});
    groups.push({s, rows});
  }
  return groups;
}
// ---------------------------------------------------------------- gear list model
// same card mechanics as the prop list, different detector: cameras + grip &
// light kinds, honoring fixture labels ("Aputure LS 600d ×2" beats "Fresnel ×2")
const GEAR_KINDS = new Set(['cstand','kino','ledpanel','fresnel','hmi','tube','astera',
  'bounce','negfill','flag','reflector','dolly','track','jib','technocrane','truss','monitor','camcart']);
function gearListGroups(o){
  if(!o.props) o.props = {};
  if(!o.hide) o.hide = {};
  if(!o.done) o.done = {};
  const groups = [];
  for(const s of project.scenes){
    const rows = [], counts = {};
    for(const ob of s.objects || []){
      let nm = null;
      if(ob.cat === 'camera') nm = ob.label || (CAMS[ob.kind] && CAMS[ob.kind].name) || 'Camera';
      else if(ob.cat === 'prop' && GEAR_KINDS.has(ob.kind))
        nm = ob.label || (PROPS[ob.kind] && PROPS[ob.kind].name) || ob.kind;
      if(nm) counts[nm] = (counts[nm] || 0) + 1;
    }
    for(const nm in counts){
      const key = s.id + '|' + nm.toLowerCase();
      if(!o.hide[key]) rows.push({key, sceneId:s.id, name:nm, count:counts[nm], auto:true, done:!!o.done[key]});
    }
    for(const r of o.props[s.id] || [])
      rows.push({key:r.id, sceneId:s.id, rowId:r.id, name:r.name, count:0, auto:false, done:!!r.done});
    groups.push({s, rows});
  }
  return groups;
}
function plSceneHead(s){
  return ('SC ' + (s.scene || (s.name || '?').replace(/^Scene\s*/i,'')) +
    (s.sceneDesc ? ' · ' + s.sceneDesc : '')).toUpperCase();
}

let activeTab = 'design'; // design | mood | script | story | org
const BOARD_TABS = new Set(['mood','org','write']);
// ---------------------------------------------------------------- sub-boards
// A sub-board is a CARD that contains a full board (o.board, shot-shaped).
// "Entering" one pushes its id onto boardStack; activeScene() then serves the
// inner board — so every existing tool (drawing, library drops, selection,
// even sub-boards inside sub-boards) works inside without knowing about any
// of this. The stack holds IDS and is re-resolved on every call, so undo or
// a co-editor's version can never leave us pointing at a dead object: a
// broken link simply prunes the stack back to the deepest level that exists.
let boardStack = []; // subboard object ids, outermost first
function rootBoard(){
  if(activeTab === 'mood' && project.moodboard) return project.moodboard;
  if(activeTab === 'org' && project.prodboard) return project.prodboard;
  if(activeTab === 'write' && project.scriptboard) return project.scriptboard;
  return project.scenes.find(s => s.id === project.activeSceneId) || project.scenes[0];
}
function subboardPath(){
  let host = rootBoard();
  const chain = [];
  for(const id of boardStack){
    const sub = host && (host.objects || []).find(o => o.id === id && o.cat === 'subboard');
    if(!sub || !sub.board) break;
    chain.push(sub);
    host = sub.board;
  }
  if(chain.length !== boardStack.length){
    boardStack = chain.map(s => s.id);
    updateCrumb();
  }
  return chain;
}
function activeScene(){
  const chain = subboardPath();
  return chain.length ? chain[chain.length - 1].board : rootBoard();
}
const activeShot = activeScene; // legacy alias — every existing call site keeps working
function enterSubboard(o){
  if(!o || o.cat !== 'subboard') return;
  if(!o.board) o.board = {id:uid(), name:'', objects:[], walls:[], stills:[], shots:[]};
  migrateShot(o.board);
  sel = null; drag = null; hoverWall = null;
  closeNoteEditor(true);
  boardStack.push(o.id);
  updateCrumb();
  if(typeof refreshSelBar === 'function') refreshSelBar();
  if(typeof zoomFit === 'function') zoomFit();
  render();
}
function exitSubboard(){
  if(!boardStack.length) return;
  const chain = subboardPath();
  const leaving = chain[chain.length - 1];
  if(leaving) leaving._pv = null; // contents may have changed — redo the thumbnail
  sel = null; drag = null; hoverWall = null;
  closeNoteEditor(true);
  boardStack.pop();
  updateCrumb();
  if(typeof refreshSelBar === 'function') refreshSelBar();
  if(typeof zoomFit === 'function') zoomFit();
  render();
}
function exitAllSubboards(){
  if(!boardStack.length) return;
  subboardPath().forEach(s => { s._pv = null; });
  boardStack = [];
  updateCrumb();
}
function updateCrumb(){
  let el = document.getElementById('boardCrumb');
  const chain = boardStack.length ? subboardPathNoPrune() : [];
  if(!chain.length){ if(el) el.remove(); return; }
  if(!el){
    el = document.createElement('div');
    el.id = 'boardCrumb';
    const host = document.getElementById('canvasWrap');
    if(!host) return;
    host.appendChild(el);
    el.addEventListener('click', ()=>exitSubboard());
  }
  el.style.cssText = 'position:absolute;top:12px;left:12px;z-index:60;display:flex;gap:6px;' +
    'align-items:center;background:#fff;border:1px solid #E5E3DE;border-radius:20px;' +
    'padding:5px 13px 5px 10px;font:600 12px -apple-system,Segoe UI,sans-serif;color:#33322E;' +
    'box-shadow:0 6px 20px rgba(40,38,32,.14);cursor:pointer;max-width:60%;overflow:hidden;' +
    'white-space:nowrap;text-overflow:ellipsis;';
  el.title = 'Inside a sub-board — click to go back up';
  const rootName = activeTab === 'mood' ? 'Mood & inspiration'
    : activeTab === 'org' ? 'Production'
    : activeTab === 'write' ? 'Script & Storyboard'
    : (rootBoard() ? rootBoard().name : 'Scene');
  el.innerHTML = '<span style="color:#4B6BFB">⬑</span>&nbsp;' + esc(rootName) +
    chain.map((s, i)=>' <span style="color:#B9B6AE">›</span> ' +
      (i === chain.length - 1
        ? '<b>' + esc(s.label || 'Sub-board') + '</b>'
        : esc(s.label || 'Sub-board'))).join('');
}
// crumb-safe path (no prune side effects while we're mid-update)
function subboardPathNoPrune(){
  let host = rootBoard();
  const chain = [];
  for(const id of boardStack){
    const sub = host && (host.objects || []).find(o => o.id === id && o.cat === 'subboard');
    if(!sub || !sub.board) break;
    chain.push(sub);
    host = sub.board;
  }
  return chain;
}
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
    // co-editing: assets touched while a shared production is open live with it
    window.__sharedCurrent = (window.FLOOR_SHARED && window.FLOOR_SHARED.has(currentProjectId))
      ? currentProjectId : null;
    const res = await window.storage.get('sd:project:' + currentProjectId).catch(()=>null);
    if(res && res.value){ project = JSON.parse(res.value); }
  }catch(e){ /* first run */ }
  normalizeLoadedProject();
}
// every freshly parsed project doc goes through here — first load AND the
// co-editing refresh pull (07-share.js) share one migration path
function normalizeLoadedProject(){
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
  normalizeProduction();
  if(!project.customProps) project.customProps = [];
  if(!project.exportPrefs) project.exportPrefs = {grid:true, stills:true};
  if(project.shootName===undefined) project.shootName='';
  project.scenes.forEach(migrateShot);
  if(!project.scenes.find(s=>s.id===project.activeSceneId)) project.activeSceneId = project.scenes[0].id;
}
let saveGen = 0, saveInFlight = false, saveRetryDelay = 0;
function saveStateMark(ok){
  const el = document.getElementById('saveState');
  if(!el) return;
  if(ok === true){
    el.textContent = '✓ Saved ' + new Date().toTimeString().slice(0, 5);
    el.style.color = '';
  } else if(ok === false){
    el.textContent = '⚠ Not saved';
    el.style.color = '#D14B3A';
  } else {
    el.textContent = 'Saving…';
    el.style.color = '';
  }
}
function markDirty(){
  dirty = true;
  saveGen++; // edits made during an in-flight save must not be marked clean
  saveStateMark(null);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveProject, 700);
}
async function saveProject(){
  if(!dirty || saveInFlight) return;
  saveInFlight = true;
  const gen = saveGen;
  try{
    await window.storage.set('sd:project:' + currentProjectId, JSON.stringify(project));
    // dirty clears ONLY after the write really landed — a failed save used
    // to mark itself clean, which silenced every safety net (v0.33 fix)
    if(gen === saveGen) dirty = false;
    saveRetryDelay = 0;
    saveStateMark(true);
    if(typeof saveBanner === 'function') saveBanner(null);
    // keep the production list in sync (name + freshness)
    try{
      const idx = (await loadProjectIndex()) || [];
      const e0 = idx.find(p=>p.id===currentProjectId);
      const nm = project.shootName || 'Untitled production';
      if(e0){ e0.name = nm; e0.updated = Date.now(); }
      else idx.push({id:currentProjectId, name:nm, updated:Date.now()});
      await saveProjectIndex(idx);
    }catch(e){}
    if(gen !== saveGen){ // edited while saving — go again shortly
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveProject, 400);
    }
  }catch(e){
    console.error('save error', e);
    saveStateMark(false);
    if(e && e.floorConflict){
      // someone else saved a newer version — the user picks a side
      if(typeof saveBanner === 'function') saveBanner('conflict');
    } else {
      if(typeof saveBanner === 'function') saveBanner('savefail');
      saveRetryDelay = saveRetryDelay ? Math.min(saveRetryDelay * 2, 30000) : 4000;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveProject, saveRetryDelay);
    }
  } finally {
    saveInFlight = false;
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
  if(project.production && project.production.logo === id) return true;
  const inObjs = objs => (objs||[]).some(o =>
    (o.cat==='image' && o.imgId===id) ||
    (o.cat==='avscript' && (o.rows||[]).some(r=>r.imgId===id || (r.imgs||[]).includes(id))) ||
    (o.cat==='subboard' && o.board &&
      (inObjs(o.board.objects) || (o.board.stills||[]).includes(id))));
  const inBoard = s => s && (s.stills.includes(id) || inObjs(s.objects) ||
    (s.setups||[]).some(su=>inObjs(su.objects)));
  return project.scenes.some(inBoard) ||
    inBoard(project.moodboard) || inBoard(project.prodboard) || inBoard(project.scriptboard);
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
// Tab switches change the layout (panels hide/show) WITHOUT a window resize,
// leaving the canvas bitmap stretched: visuals shift while hit-testing stays
// true — clicks near handles miss and fall through to panning. Watch the
// container itself so the canvas recalibrates on any layout change.
if(window.ResizeObserver){
  new ResizeObserver(()=>resize()).observe(wrap);
}

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

// Walls may bow: wall.mid is the ON-CURVE midpoint of a quadratic bend
// (null/undefined = straight). Same convention as line objects' o.mid.
function wallSamples(w){
  if(!w.mid) return [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
  const cx = 2*w.mid.x - (w.x1+w.x2)/2, cy = 2*w.mid.y - (w.y1+w.y2)/2;
  const pts = [];
  for(let i=0;i<=18;i++){
    const t=i/18, u=1-t;
    pts.push({x:u*u*w.x1 + 2*u*t*cx + t*t*w.x2, y:u*u*w.y1 + 2*u*t*cy + t*t*w.y2});
  }
  return pts;
}
function wallGeom(w){
  const smp = wallSamples(w);
  const cum = [0];
  for(let i=1;i<smp.length;i++) cum.push(cum[i-1] + dist(smp[i-1].x,smp[i-1].y,smp[i].x,smp[i].y));
  return {smp, cum, L:cum[cum.length-1]};
}
// point + tangent at arc distance d (geom passed in so callers can reuse it)
function wallPointAt(geom, d){
  const {smp, cum} = geom;
  const dd = clamp(d, 0, geom.L);
  let i = 1; while(i < cum.length-1 && cum[i] < dd) i++;
  const t = (dd - cum[i-1]) / Math.max(1e-6, cum[i] - cum[i-1]);
  return {x: smp[i-1].x + (smp[i].x-smp[i-1].x)*t,
          y: smp[i-1].y + (smp[i].y-smp[i-1].y)*t,
          ang: Math.atan2(smp[i].y-smp[i-1].y, smp[i].x-smp[i-1].x)};
}
function drawWalls(shot){
  const T = 11;
  for(const wall of shot.walls){
    const geom = wallGeom(wall);
    const {smp, cum, L} = geom;
    if(L < 1) continue;
    const ops = (wall.openings||[]).map(o => ({...o, c:o.t*L})).sort((a,b)=>a.c-b.c);
    let cur = 0;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = WALL_COLOR;
    ctx.lineWidth = T;
    const segs = [];
    for(const o of ops){
      if(o.type === 'outlet') continue; // outlets sit ON the wall — no hole
      const a = clamp(o.c-o.w/2, 0, L), b = clamp(o.c+o.w/2, 0, L);
      if(a > cur) segs.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if(cur < L) segs.push([cur, L]);
    for(const [a,b] of segs){
      ctx.beginPath();
      const pa = wallPointAt(geom, a);
      ctx.moveTo(pa.x, pa.y);
      for(let i=0;i<cum.length;i++) if(cum[i] > a && cum[i] < b) ctx.lineTo(smp[i].x, smp[i].y);
      const pb = wallPointAt(geom, b);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    for(const o of ops){
      const pc = wallPointAt(geom, o.c);
      const cx = pc.x, cy = pc.y;
      const ang = pc.ang;
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(ang);
      if(o.type === 'outlet'){
        // power socket marker — visual only (schuko-style symbol)
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#E8934C'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#E8934C';
        ctx.beginPath(); ctx.arc(-2.4, 0, 1.2, 0, 7); ctx.arc(2.4, 0, 1.2, 0, 7); ctx.fill();
      } else if(o.type === 'gap'){
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
        // flip = which side of the wall it swings to; hinge = which jamb it hangs on
        const s = o.flip ? -1 : 1;
        const hx = o.hinge ? o.w/2 : -o.w/2;
        ctx.strokeStyle = WALL_COLOR; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, -s*o.w); ctx.stroke();
        ctx.lineWidth = 1.3; ctx.setLineDash([4,4]);
        ctx.beginPath();
        if(o.hinge) ctx.arc(hx, 0, o.w, s>0 ? Math.PI : Math.PI/2, s>0 ? Math.PI*1.5 : Math.PI);
        else ctx.arc(hx, 0, o.w, s>0 ? -Math.PI/2 : 0, s>0 ? 0 : Math.PI/2);
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
    if(o.kind === 'dim'){
      // dimension line: tick ends + live length readout at the middle
      const ang = Math.atan2(p2.y-p1.y, p2.x-p1.x);
      const tick = 7;
      ctx.strokeStyle = o.color; ctx.lineWidth = o.weight || 2;
      for(const p of [p1, p2]){
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(0, -tick); ctx.lineTo(0, tick); ctx.stroke();
        ctx.restore();
      }
      const L = Math.round(dist(o.p1.x, o.p1.y, o.p2.x, o.p2.y));
      const txt = L >= 100 ? (L/100).toFixed(2).replace(/\.?0+$/,'') + ' m' : L + ' cm';
      const mx = (p1.x+p2.x)/2, my = (p1.y+p2.y)/2;
      ctx.font = '600 11px -apple-system,Segoe UI,sans-serif';
      const tw = ctx.measureText(txt).width;
      ctx.save(); ctx.translate(mx, my);
      let ta = ang;
      if(ta > Math.PI/2 || ta < -Math.PI/2) ta += Math.PI; // keep the number upright
      ctx.rotate(ta);
      ctx.fillStyle = '#fff'; ctx.globalAlpha = .85;
      ctx.fillRect(-tw/2 - 4, -16, tw + 8, 14);
      ctx.globalAlpha = 1;
      ctx.fillStyle = o.color;
      ctx.textAlign = 'center';
      ctx.fillText(txt, 0, -5);
      ctx.textAlign = 'left';
      ctx.restore();
    }
  } else if(o.cat === 'link'){
    // bookmark card: square preview on top, title + domain strip below
    const domain = (o.url || '').replace(/^https?:\/\//i,'').replace(/^www\./i,'').split(/[\/?#]/)[0];
    const disp = (o.label && o.label !== 'Link') ? o.label : (shortUrl(o.url) || 'Link');
    const stripH = 38;
    o.w = Math.max(o.w || 180, 140);
    o.h = o.w + stripH; // preview stays square
    const sq = o.w;
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.clip();
    const thumb = o.imgId ? imgCache[o.imgId] : null;
    if(thumb && thumb.complete && thumb.naturalWidth){
      // cover-fit into the square
      const ar = thumb.naturalWidth/thumb.naturalHeight;
      let dw = sq, dh = sq;
      if(ar > 1) dw = sq*ar; else dh = sq/ar;
      ctx.drawImage(thumb, -dw/2, -o.h/2 + (sq-dh)/2, dw, dh);
      // play badge (thumbs only exist for video links)
      ctx.beginPath(); ctx.arc(0, -o.h/2 + sq/2, 17, 0, 7);
      ctx.fillStyle = 'rgba(20,19,17,.55)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-5, -o.h/2 + sq/2 - 7); ctx.lineTo(9, -o.h/2 + sq/2);
      ctx.lineTo(-5, -o.h/2 + sq/2 + 7); ctx.closePath();
      ctx.fillStyle = '#fff'; ctx.fill();
    } else {
      if(o.imgId && !thumb) loadStill(o.imgId).then(()=>render());
      // placeholder: tinted square, big domain initial + link glyph
      ctx.fillStyle = o.color; ctx.globalAlpha = .12;
      ctx.fillRect(-o.w/2, -o.h/2, o.w, sq);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '800 ' + Math.round(sq*.34) + 'px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = o.color; ctx.globalAlpha = .35;
      ctx.fillText((domain[0] || '?').toUpperCase(), 0, -o.h/2 + sq/2 - 4);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = o.color; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      const gy = -o.h/2 + sq - 22, gr = 7;
      ctx.beginPath(); ctx.ellipse(-6, gy+3, gr, gr*.62, -Math.PI/4, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(6, gy-3, gr, gr*.62, -Math.PI/4, 0, 7); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    // text strip
    ctx.fillStyle = '#fff';
    ctx.fillRect(-o.w/2, o.h/2 - stripH, o.w, stripH);
    ctx.strokeStyle = '#EDEBE6'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-o.w/2, o.h/2 - stripH); ctx.lineTo(o.w/2, o.h/2 - stripH); ctx.stroke();
    ctx.textBaseline = 'middle';
    ctx.font = '600 11.5px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#33322E';
    ctx.fillText(trimText(ctx, disp + '  \u2197', o.w - 16), -o.w/2 + 8, o.h/2 - stripH + 13);
    if(domain && domain !== disp){
      ctx.font = '10px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = '#8A877F';
      ctx.fillText(trimText(ctx, domain, o.w - 16), -o.w/2 + 8, o.h/2 - 11);
    }
    ctx.restore();
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
    ctx.strokeStyle = '#D8D5CF'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
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
      // shared card chrome: tinted title strip like the other smart cards
      ctx.save();
      ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.clip();
      ctx.fillStyle = o.color; ctx.globalAlpha = .14;
      ctx.fillRect(-o.w/2, -o.h/2, o.w, 28);
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.font = '700 11px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = '#33322E';
      ctx.fillText(trimText(ctx, o.label.toUpperCase(), o.w-20), -o.w/2+pad, -o.h/2 + 15);
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
    const S = o.fs || 1; // corner-drag scale — everything grows together
    const headH = 30*S, rowH = 28*S;
    // columns size themselves to content
    const ws = [];
    for(let c=0;c<nC;c++){
      let mw = 90*S;
      for(let r=0;r<nR;r++){
        ctx.font = (r===0 ? '700 ' : '') + (12*S) + 'px -apple-system,Segoe UI,sans-serif';
        mw = Math.max(mw, ctx.measureText(o.cells[r][c]||'').width + 20*S);
      }
      ws.push(Math.min(280*S, mw));
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
          ctx.font = (r===0 ? '700 ' : '') + (12*S) + 'px -apple-system,Segoe UI,sans-serif';
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
  } else if(o.cat === 'listcard'){
    const spec = LIST_CARDS[o.kind] || LIST_CARDS.crew;
    const G = LIST_GEO;
    const rows = cardPeople(o);
    const selMe = sel && sel.type==='object' && sel.id===o.id && !ghost;
    // typed columns size themselves to content
    const ws = spec.cols.map(col=>{
      ctx.font = '700 9.5px -apple-system,Segoe UI,sans-serif';
      let mw = Math.max(col.min, ctx.measureText(col.label.toUpperCase()).width + 18);
      ctx.font = '12px -apple-system,Segoe UI,sans-serif';
      for(const p of rows) mw = Math.max(mw, ctx.measureText(p[col.key]||'').width + 18);
      return Math.min(240, mw);
    });
    o._colWs = ws;
    o.w = G.grip + ws.reduce((a,b)=>a+b, 0);
    o.h = G.titleH + G.headH + Math.max(1, rows.length)*G.rowH;
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.clip();
    ctx.fillStyle = o.color || spec.color; ctx.globalAlpha = .14;
    ctx.fillRect(-o.w/2, -o.h/2, o.w, G.titleH);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'middle';
    ctx.font = '700 11px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#33322E';
    ctx.fillText(spec.title, -o.w/2 + 10, -o.h/2 + G.titleH/2 + .5);
    if(rows.length){
      ctx.textAlign = 'right';
      ctx.font = '10.5px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = '#8A877F';
      ctx.fillText(String(rows.length), o.w/2 - 8, -o.h/2 + G.titleH/2 + .5);
      ctx.textAlign = 'left';
    }
    // column header row
    ctx.font = '700 9.5px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#8A877F';
    let hx0 = -o.w/2 + G.grip;
    for(let c=0;c<spec.cols.length;c++){
      ctx.fillText(spec.cols[c].label.toUpperCase(), hx0 + 8, -o.h/2 + G.titleH + G.headH/2 + .5);
      hx0 += ws[c];
    }
    // grid
    ctx.strokeStyle = '#E5E3DE'; ctx.lineWidth = 1;
    for(const y of [G.titleH, G.titleH + G.headH]){
      ctx.beginPath(); ctx.moveTo(-o.w/2, -o.h/2 + y); ctx.lineTo(o.w/2, -o.h/2 + y); ctx.stroke();
    }
    let cx1 = -o.w/2 + G.grip;
    for(let c=0;c<spec.cols.length-1;c++){
      cx1 += ws[c];
      ctx.beginPath(); ctx.moveTo(cx1, -o.h/2 + G.titleH); ctx.lineTo(cx1, o.h/2); ctx.stroke();
    }
    // rows
    o._rowRects = [];
    rows.forEach((p, r)=>{
      const yTop = -o.h/2 + G.titleH + G.headH + r*G.rowH;
      if(drag && drag.kind==='listrow' && drag.personId===p.id){
        ctx.fillStyle = 'rgba(75,107,251,.08)';
        ctx.fillRect(-o.w/2, yTop, o.w, G.rowH);
      }
      if(r){
        ctx.beginPath(); ctx.moveTo(-o.w/2, yTop); ctx.lineTo(o.w/2, yTop); ctx.stroke();
      }
      // drag grip (rows reorder by dragging it when the card is selected)
      ctx.fillStyle = selMe ? '#B9B6AE' : '#E5E3DE';
      for(const dy of [-4, 0, 4]) for(const dx of [-2, 2]){
        ctx.beginPath(); ctx.arc(-o.w/2 + G.grip/2 + dx, yTop + G.rowH/2 + dy, 1.1, 0, 7); ctx.fill();
      }
      ctx.font = '12px -apple-system,Segoe UI,sans-serif';
      let x0 = -o.w/2 + G.grip;
      for(let c=0;c<spec.cols.length;c++){
        if(!(noteEditor && noteEditor.id===o.id && noteEditor.field==='person:'+p.id+':'+spec.cols[c].key)){
          ctx.fillStyle = '#4A4636';
          ctx.fillText(trimText(ctx, p[spec.cols[c].key]||'', ws[c]-16), x0 + 8, yTop + G.rowH/2 + .5);
        }
        x0 += ws[c];
      }
      o._rowRects.push({personId:p.id, x:o.x - o.w/2, y:o.y + yTop, w:G.grip, h:G.rowH});
    });
    if(!rows.length){
      ctx.font = '12px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = 'rgba(74,70,54,.4)';
      ctx.fillText('No ' + spec.tag + ' yet — tap + to add', -o.w/2 + G.grip + 8,
        -o.h/2 + G.titleH + G.headH + G.rowH/2);
    }
    ctx.restore();
    ctx.strokeStyle = '#D8D5CF'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.stroke();
    // chips when selected: + adds a person, × per row removes one from the registry
    if(selMe){
      ctx.textAlign = 'center';
      ctx.font = '700 13px -apple-system,Segoe UI,sans-serif';
      ctx.beginPath(); ctx.arc(0, o.h/2+15, 10, 0, 7);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = '#B9B6AE'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = '#8A877F';
      ctx.fillText('+', 0, o.h/2+16);
      o._plusRow = {x:o.x, y:o.y + o.h/2 + 15, r:14};
      o._rowDels = [];
      ctx.font = '700 11px -apple-system,Segoe UI,sans-serif';
      rows.forEach((p, r)=>{
        const cy = -o.h/2 + G.titleH + G.headH + r*G.rowH + G.rowH/2;
        ctx.beginPath(); ctx.arc(o.w/2 + 14, cy, 8, 0, 7);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = '#B9B6AE'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = '#8A877F';
        ctx.fillText('×', o.w/2 + 14, cy + 1);
        o._rowDels.push({personId:p.id, x:o.x + o.w/2 + 14, y:o.y + cy, r:11});
      });
      ctx.textAlign = 'left';
    } else { o._plusRow = null; o._rowDels = null; }
    ctx.textBaseline = 'alphabetic';
  } else if(o.cat === 'fieldcard'){
    const spec = FIELD_CARDS[o.kind] || FIELD_CARDS.prodinfo;
    const G = FIELD_GEO;
    // label column + self-sizing value column
    ctx.font = '700 9.5px -apple-system,Segoe UI,sans-serif';
    let labW = 0;
    for(const r of spec.rows) labW = Math.max(labW, ctx.measureText(r.label.toUpperCase()).width);
    labW += 20;
    ctx.font = '12px -apple-system,Segoe UI,sans-serif';
    let valW = 170;
    for(const r of spec.rows)
      valW = Math.max(valW, ctx.measureText(fieldGet(o, r.key) || r.ph).width + 18);
    valW = Math.min(300, valW);
    o._labW = labW;
    o.w = labW + valW;
    o.h = G.titleH + spec.rows.length*G.rowH;
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.clip();
    ctx.fillStyle = spec.color; ctx.globalAlpha = .14;
    ctx.fillRect(-o.w/2, -o.h/2, o.w, G.titleH);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'middle';
    ctx.font = '700 11px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#33322E';
    ctx.fillText(spec.title, -o.w/2 + 10, -o.h/2 + G.titleH/2 + .5);
    ctx.strokeStyle = '#E5E3DE'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-o.w/2, -o.h/2 + G.titleH); ctx.lineTo(o.w/2, -o.h/2 + G.titleH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-o.w/2 + labW, -o.h/2 + G.titleH); ctx.lineTo(-o.w/2 + labW, o.h/2); ctx.stroke();
    spec.rows.forEach((r, i)=>{
      const yTop = -o.h/2 + G.titleH + i*G.rowH;
      if(i){ ctx.beginPath(); ctx.moveTo(-o.w/2, yTop); ctx.lineTo(o.w/2, yTop); ctx.stroke(); }
      ctx.font = '700 9.5px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = '#8A877F';
      ctx.fillText(r.label.toUpperCase(), -o.w/2 + 10, yTop + G.rowH/2 + .5);
      if(!(noteEditor && noteEditor.id===o.id && noteEditor.field==='fval:'+i)){
        const v = fieldGet(o, r.key);
        ctx.font = '12px -apple-system,Segoe UI,sans-serif';
        ctx.fillStyle = v ? '#4A4636' : 'rgba(74,70,54,.35)';
        ctx.fillText(trimText(ctx, v || r.ph, valW - 16), -o.w/2 + labW + 8, yTop + G.rowH/2 + .5);
      }
    });
    ctx.restore();
    ctx.strokeStyle = '#D8D5CF'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.stroke();
    ctx.textBaseline = 'alphabetic';
  } else if(o.cat === 'avscript'){
    const G = AVS;
    const S = o.fs || 1;                 // whole-script scale
    const SH = o.stillH || G.stillH;     // still thumb height (resizable)
    o.rows = (o.rows && o.rows.length) ? o.rows
      : [{id:uid(), no:'', time:'', audio:'', video:'', notes:'', imgs:[]}];
    o.rows.forEach(r=>{ if(!r.imgs) r.imgs = r.imgId ? [r.imgId] : []; }); // v0.50 migration
    o.cols = o.cols || {no:false, still:false, notes:false};
    const cols = avCols(o);
    o._avCols = cols;
    o.w = G.grip + cols.reduce((a,c)=>a+c[2], 0);
    const selMe = sel && sel.type==='object' && sel.id===o.id && !ghost;
    ctx.font = (G.fontPx*S) + 'px -apple-system,Segoe UI,sans-serif';
    const rowHs = o.rows.map(r=>{
      let lines = 1;
      for(const [key,,wd] of cols)
        if(!avSingle(key) && key !== 'still')
          lines = Math.max(lines, wrapCanvasText(ctx, r[key]||'', wd-16).length);
      let h = Math.max(G.minRowH*S, lines*G.lineH*S + G.rowPad*2);
      if(o.cols.still) h = Math.max(h, SH + 12);
      return h;
    });
    o._rowHs = rowHs;
    o.h = G.titleH + G.headH + rowHs.reduce((a,b)=>a+b, 0);
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.clip();
    ctx.fillStyle = o.color; ctx.globalAlpha = .14;
    ctx.fillRect(-o.w/2, -o.h/2, o.w, G.titleH);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'middle';
    // title + column headers read a step LARGER than the body text, and scale along
    ctx.font = '700 ' + (16*S) + 'px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#33322E';
    ctx.fillText(o.label || 'AV SCRIPT', -o.w/2 + 10, -o.h/2 + G.titleH/2 + .5);
    // column headers + separators
    ctx.font = '700 ' + (14*S) + 'px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#8A877F';
    o._colDels = selMe ? [] : null;
    let hx = -o.w/2 + G.grip;
    const headMid = -o.h/2 + G.titleH + G.headH/2 + .5;
    for(const [key,label,wd] of cols){
      ctx.fillStyle = '#8A877F';
      ctx.fillText(trimText(ctx, label, wd - 26), hx + 8, headMid);
      if(selMe && !['no','time','still','audio','video','notes'].includes(key)){
        // × in the header removes this custom column (dblclick the header renames)
        ctx.beginPath(); ctx.arc(hx + wd - 11, headMid - .5, 6, 0, 7);
        ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fill();
        ctx.strokeStyle = '#B9B6AE'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#8A877F'; ctx.textAlign = 'center';
        ctx.font = '700 9px -apple-system,Segoe UI,sans-serif';
        ctx.fillText('×', hx + wd - 11, headMid);
        ctx.textAlign = 'left';
        ctx.font = '700 ' + (14*S) + 'px -apple-system,Segoe UI,sans-serif';
        o._colDels.push({colId:key, x:o.x + hx + wd - 11, y:o.y + headMid, r:8});
      }
      hx += wd;
    }
    ctx.strokeStyle = '#E5E3DE'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-o.w/2, -o.h/2 + G.titleH); ctx.lineTo(o.w/2, -o.h/2 + G.titleH); ctx.stroke();
    let vx = -o.w/2 + G.grip;
    for(let c=0;c<cols.length-1;c++){
      vx += cols[c][2];
      ctx.beginPath(); ctx.moveTo(vx, -o.h/2 + G.titleH); ctx.lineTo(vx, o.h/2); ctx.stroke();
    }
    // rows
    o._rowRects = []; o._stillRects = []; o._stillDels = [];
    let yTop = -o.h/2 + G.titleH + G.headH;
    o.rows.forEach((r, i)=>{
      const rh = rowHs[i];
      ctx.strokeStyle = '#E5E3DE';
      ctx.beginPath(); ctx.moveTo(-o.w/2, yTop); ctx.lineTo(o.w/2, yTop); ctx.stroke();
      if(drag && drag.kind==='avrow' && drag.rowId===r.id){
        ctx.fillStyle = 'rgba(75,107,251,.08)';
        ctx.fillRect(-o.w/2, yTop, o.w, rh);
      }
      ctx.fillStyle = selMe ? '#B9B6AE' : '#E5E3DE';
      for(const dy of [-4, 0, 4]) for(const dx of [-2, 2]){
        ctx.beginPath(); ctx.arc(-o.w/2 + G.grip/2 + dx, yTop + rh/2 + dy, 1.1, 0, 7); ctx.fill();
      }
      let x0 = -o.w/2 + G.grip;
      for(const [key,,wd] of cols){
        const editing = noteEditor && noteEditor.id===o.id && noteEditor.field==='avr:'+r.id+':'+key;
        if(key === 'still'){
          // a little filmstrip: every still in the row, side by side, then a + slot
          const ih = SH, slot = Math.round(SH*16/9);
          let ix = x0 + 6;
          const iy = yTop + (rh - ih)/2;
          (r.imgs || []).forEach((id, ii)=>{
            const im = imgCache[id];
            if(im && im.complete && im.naturalWidth){
              ctx.save();
              ctx.beginPath(); ctx.roundRect(ix, iy, slot, ih, 2); ctx.clip();
              const ar = im.naturalWidth/im.naturalHeight, fr = slot/ih;
              let dw = slot, dh = ih;
              if(ar > fr) dw = ih*ar; else dh = slot/ar;
              ctx.drawImage(im, ix + (slot-dw)/2, iy + (ih-dh)/2, dw, dh);
              ctx.restore();
            } else {
              if(id && !im) loadStill(id).then(()=>render());
              ctx.fillStyle = '#F2F1EE';
              ctx.beginPath(); ctx.roundRect(ix, iy, slot, ih, 2); ctx.fill();
            }
            o._stillRects.push({rowId:r.id, idx:ii, x:o.x + ix, y:o.y + iy, w:slot, h:ih});
            if(selMe){ // × chip to pluck one still out
              ctx.beginPath(); ctx.arc(ix + slot - 7, iy + 7, 6.5, 0, 7);
              ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fill();
              ctx.strokeStyle = '#B9B6AE'; ctx.lineWidth = 1; ctx.stroke();
              ctx.fillStyle = '#8A877F'; ctx.textAlign = 'center';
              ctx.font = '700 9px -apple-system,Segoe UI,sans-serif';
              ctx.fillText('×', ix + slot - 7, iy + 7.5);
              ctx.textAlign = 'left';
              o._stillDels.push({rowId:r.id, idx:ii, x:o.x + ix + slot - 7, y:o.y + iy + 7, r:9});
            }
            ix += slot + 6;
          });
          // + slot (drop an image here or click) — always present
          const pw = (r.imgs && r.imgs.length) ? 18 : slot;
          ctx.strokeStyle = '#D8D5CF'; ctx.setLineDash([4,3]);
          ctx.beginPath(); ctx.roundRect(ix, iy, pw, ih, 2); ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = '11px -apple-system,Segoe UI,sans-serif';
          ctx.fillStyle = 'rgba(74,70,54,.4)';
          ctx.textAlign = 'center';
          ctx.fillText((r.imgs && r.imgs.length) ? '+' : '+ still', ix + pw/2, iy + ih/2);
          ctx.textAlign = 'left';
          o._stillRects.push({rowId:r.id, idx:'add', x:o.x + ix, y:o.y + iy, w:pw, h:ih});
        } else if(!editing){
          const multi = !avSingle(key);
          ctx.font = (G.fontPx*S) + 'px -apple-system,Segoe UI,sans-serif';
          const v = r[key] || '';
          if(multi){
            ctx.fillStyle = v ? (key==='audio' ? shade(o.color, .75) : '#4A4636') : 'rgba(74,70,54,.3)';
            const ph = key==='audio' ? 'lyrics / VO / sfx…' : key==='video' ? 'what we see…' : '…';
            const lines = wrapCanvasText(ctx, v || ph, wd - 16);
            ctx.textBaseline = 'alphabetic';
            lines.forEach((l, li)=> ctx.fillText(l, x0 + 8, yTop + G.rowPad + 12.5*S + li*G.lineH*S));
            ctx.textBaseline = 'middle';
          } else {
            ctx.fillStyle = v ? '#33322E' : 'rgba(74,70,54,.3)';
            ctx.font = '600 ' + (G.fontPx*S) + 'px -apple-system,Segoe UI,sans-serif';
            ctx.fillText(trimText(ctx, v || (key==='time' ? '0:00' : '#'), wd - 12), x0 + 8, yTop + rh/2 + .5);
          }
        }
        x0 += wd;
      }
      o._rowRects.push({rowId:r.id, x:o.x - o.w/2, y:o.y + yTop, w:G.grip, h:rh});
      yTop += rh;
    });
    ctx.restore();
    ctx.strokeStyle = '#D8D5CF'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.stroke();
    if(selMe){
      ctx.textAlign = 'center';
      ctx.font = '700 13px -apple-system,Segoe UI,sans-serif';
      ctx.beginPath(); ctx.arc(0, o.h/2+15, 10, 0, 7);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = '#B9B6AE'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = '#8A877F'; ctx.fillText('+', 0, o.h/2+16);
      o._plusRow = {x:o.x, y:o.y + o.h/2 + 15, r:14};
      o._rowDels = []; o._rowIns = [];
      ctx.font = '700 11px -apple-system,Segoe UI,sans-serif';
      let cy = -o.h/2 + G.titleH + G.headH;
      o.rows.forEach((r, i)=>{
        // small + ON the row's top boundary inserts a row right there
        ctx.beginPath(); ctx.arc(o.w/2 + 14, cy, 6, 0, 7);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = '#B9B6AE'; ctx.lineWidth = 1.1; ctx.stroke();
        ctx.fillStyle = '#8A877F';
        ctx.font = '700 10px -apple-system,Segoe UI,sans-serif';
        ctx.fillText('+', o.w/2 + 14, cy + .5);
        o._rowIns.push({idx:i, x:o.x + o.w/2 + 14, y:o.y + cy, r:8});
        const mid = cy + rowHs[i]/2;
        ctx.font = '700 11px -apple-system,Segoe UI,sans-serif';
        ctx.beginPath(); ctx.arc(o.w/2 + 14, mid, 8, 0, 7);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = '#B9B6AE'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = '#8A877F'; ctx.fillText('×', o.w/2 + 14, mid + 1);
        o._rowDels.push({rowId:r.id, x:o.x + o.w/2 + 14, y:o.y + mid, r:11});
        cy += rowHs[i];
      });
      ctx.textAlign = 'left';
    } else { o._plusRow = null; o._rowDels = null; o._rowIns = null; }
    ctx.textBaseline = 'alphabetic';
  } else if(o.cat === 'colcard'){
    // column card: title strip + free text, in the shared card chrome
    const titleH = 26, pad = 10, lineH = 16;
    ctx.font = '12.5px -apple-system,Segoe UI,sans-serif';
    const lines = wrapCanvasText(ctx, o.text || '', o.w - pad*2);
    o.h = Math.max(110, titleH + pad*2 + lines.length*lineH);
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.clip();
    ctx.fillStyle = o.color; ctx.globalAlpha = .14;
    ctx.fillRect(-o.w/2, -o.h/2, o.w, titleH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#E5E3DE'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-o.w/2, -o.h/2 + titleH); ctx.lineTo(o.w/2, -o.h/2 + titleH); ctx.stroke();
    ctx.textBaseline = 'middle';
    if(!(noteEditor && noteEditor.id===o.id && noteEditor.field==='cc:title')){
      ctx.font = '700 11px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = o.title ? '#33322E' : 'rgba(74,70,54,.35)';
      ctx.fillText(trimText(ctx, (o.title || 'TITLE…').toUpperCase(), o.w - 20), -o.w/2 + 10, -o.h/2 + titleH/2 + .5);
    }
    if(!(noteEditor && noteEditor.id===o.id && noteEditor.field==='cc:text')){
      ctx.font = '12.5px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = o.text ? '#4A4636' : 'rgba(74,70,54,.35)';
      ctx.textBaseline = 'alphabetic';
      const ls = o.text ? lines : ['Click to write…'];
      ls.forEach((l, i)=> ctx.fillText(l, -o.w/2 + pad, -o.h/2 + titleH + pad + 11 + i*lineH));
      ctx.textBaseline = 'middle';
    }
    ctx.restore();
    ctx.strokeStyle = '#D8D5CF'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.stroke();
    ctx.textBaseline = 'alphabetic';
  } else if(o.cat === 'schedule'){
    // the flexible day strip: scene rows + break/move/prep blocks, draggable
    // order, checkboxes, pinnable times, renamable rows. computeSchedule
    // owns the chaining; this draws it and lays out the edit zones.
    const titleH = 26, rowH = 24, pad = 10, grip = 14;
    const day = dayFor(o); // bound shoot day (first one when unbound)
    const {rows, wrap} = computeSchedule(o, day);
    const selMe = sel && sel.type==='object' && sel.id===o.id && !ghost;
    // width: longest row label (and the calls line) sets it; the right-edge
    // handle lets the user widen further (o.userW)
    ctx.font = '11.5px -apple-system,Segoe UI,sans-serif';
    let labMax = 130;
    for(const r of rows) labMax = Math.max(labMax, ctx.measureText(r.label).width);
    ctx.font = '600 11.5px -apple-system,Segoe UI,sans-serif';
    const callsW = ctx.measureText(day
      ? 'General call ' + (day.call || '–') + '   ·   shooting call ' + (day.shootCall || '–')
      : 'Drop a Day header for the call times…').width;
    const needW = Math.max(86 + labMax + 66, pad*2 + callsW + 4);
    o.w = clamp(Math.max(needW, o.userW || 344), 344, 900);
    o.h = titleH + pad + 20 + 6 + rows.length*rowH + 26 + pad;
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.clip();
    ctx.fillStyle = o.color; ctx.globalAlpha = .14;
    ctx.fillRect(-o.w/2, -o.h/2, o.w, titleH);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'middle';
    ctx.font = '700 11px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#33322E';
    ctx.fillText('DAY SCHEDULE', -o.w/2 + 10, -o.h/2 + titleH/2 + .5);
    if(day && day.date){
      const d = new Date(day.date + 'T12:00:00');
      ctx.textAlign = 'right';
      ctx.font = '600 10.5px -apple-system,Segoe UI,sans-serif';
      ctx.fillText(isNaN(d) ? day.date :
        d.toLocaleDateString('nl-NL', {weekday:'short', day:'numeric', month:'short'}),
        o.w/2 - 8, -o.h/2 + titleH/2 + .5);
      ctx.textAlign = 'left';
    }
    let y = -o.h/2 + titleH + pad + 9;
    ctx.font = '600 11.5px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = day ? '#33322E' : 'rgba(74,70,54,.35)';
    ctx.fillText(day
      ? 'General call ' + (day.call || '–') + '   ·   shooting call ' + (day.shootCall || '–')
      : 'Drop a Day header for the call times…', -o.w/2 + pad, y);
    y += 26;
    // column x layout (local): grip | checkbox | time | label | dur
    const cbX = -o.w/2 + grip + 2, tX = cbX + 24, lX = tX + 46, dX = o.w/2 - 52;
    o._checkRects = []; o._rowRects = []; o._timeRects = []; o._labelRects = [];
    o._durRects = []; o._delRects = [];
    rows.forEach((r)=>{
      const it = r.it;
      const on = it.on !== false;
      const cy = y + rowH/2 - 9;
      if(drag && drag.kind === 'schrow' && drag.itemId === it.id){
        ctx.fillStyle = 'rgba(75,107,251,.08)';
        ctx.fillRect(-o.w/2, cy - rowH/2, o.w, rowH);
      }
      // grip
      ctx.fillStyle = selMe ? '#B9B6AE' : '#E5E3DE';
      for(const dy of [-4, 0, 4]) for(const dx of [-2, 2]){
        ctx.beginPath(); ctx.arc(-o.w/2 + grip/2 + dx, cy + dy, 1.1, 0, 7); ctx.fill();
      }
      o._rowRects.push({itemId:it.id, x:o.x - o.w/2, y:o.y + cy - rowH/2, w:grip, h:rowH});
      // checkbox
      ctx.strokeStyle = on ? o.color : '#B9B6AE'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.roundRect(cbX, cy - 8, 16, 16, 2);
      if(on){
        ctx.fillStyle = o.color; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(cbX + 4, cy); ctx.lineTo(cbX + 7.2, cy + 3.6); ctx.lineTo(cbX + 12.4, cy - 3.8);
        ctx.stroke();
      } else ctx.stroke();
      o._checkRects.push({itemId:it.id, x:o.x + cbX - 4, y:o.y + cy - 12, w:24, h:24});
      // time (click to pin; pinned times show in the card color)
      if(!(noteEditor && noteEditor.id===o.id && noteEditor.field==='sch:'+it.id+':time')){
        ctx.font = '600 11.5px -apple-system,Segoe UI,sans-serif';
        ctx.fillStyle = !on ? 'rgba(74,70,54,.3)' : (toMinutes(it.time) != null ? shade(o.color,.75) : '#33322E');
        ctx.fillText(on && r.start != null ? minToHHMM(r.start) : '—', tX, cy);
      }
      o._timeRects.push({itemId:it.id, x:o.x + tX - 4, y:o.y + cy - 11, w:46, h:22});
      // label (click to rename — scenes keep their board name, this is display-only)
      if(!(noteEditor && noteEditor.id===o.id && noteEditor.field==='sch:'+it.id+':label')){
        ctx.font = (it.type === 'scene' ? '' : 'italic ') + '11.5px -apple-system,Segoe UI,sans-serif';
        ctx.fillStyle = on ? '#4A4636' : 'rgba(74,70,54,.3)';
        ctx.fillText(trimText(ctx, r.label, dX - lX - 8), lX, cy);
      }
      o._labelRects.push({itemId:it.id, x:o.x + lX - 4, y:o.y + cy - 11, w:dX - lX, h:22});
      // duration — always editable; scene overrides show in the card color
      if(!(noteEditor && noteEditor.id===o.id && noteEditor.field==='sch:'+it.id+':dur')){
        ctx.font = '10.5px -apple-system,Segoe UI,sans-serif';
        const overridden = it.type === 'scene' && it.dur != null;
        ctx.fillStyle = !on ? 'rgba(74,70,54,.25)' : (overridden ? shade(o.color,.75) : '#8A877F');
        ctx.textAlign = 'right';
        ctx.fillText(r.dur + 'm', o.w/2 - pad, cy);
        ctx.textAlign = 'left';
      }
      o._durRects.push({itemId:it.id, x:o.x + dX, y:o.y + cy - 11, w:52 - pad, h:22});
      y += rowH;
    });
    // wrap line
    ctx.strokeStyle = '#E5E3DE'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-o.w/2 + pad, y - 4); ctx.lineTo(o.w/2 - pad, y - 4); ctx.stroke();
    ctx.font = '600 11.5px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#33322E';
    ctx.fillText('Est. wrap ' + ((day && day.wrap) || wrap), -o.w/2 + pad, y + 9);
    ctx.restore();
    ctx.strokeStyle = '#D8D5CF'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.stroke();
    // × chips remove BLOCK rows (scenes only untick) when selected
    if(selMe){
      ctx.textAlign = 'center'; ctx.font = '700 11px -apple-system,Segoe UI,sans-serif';
      let cy2 = -o.h/2 + titleH + pad + 35 + rowH/2 - 9;
      rows.forEach((r)=>{
        if(r.it.type !== 'scene'){
          ctx.beginPath(); ctx.arc(o.w/2 + 14, cy2, 8, 0, 7);
          ctx.fillStyle = '#fff'; ctx.fill();
          ctx.strokeStyle = '#B9B6AE'; ctx.lineWidth = 1.2; ctx.stroke();
          ctx.fillStyle = '#8A877F'; ctx.fillText('×', o.w/2 + 14, cy2 + 1);
          o._delRects.push({itemId:r.it.id, x:o.x + o.w/2 + 14, y:o.y + cy2, r:11});
        }
        cy2 += rowH;
      });
      ctx.textAlign = 'left';
    }
    ctx.textBaseline = 'alphabetic';
  } else if(o.cat === 'proplist' || o.cat === 'gearlist'){
    // the prop master's / gaffer's list — auto-filled per scene, tick boxes,
    // dismissable auto rows, free manual rows. Same card, two detectors.
    const titleH = 26, rowH = 21, headH = 22, addH = 17, pad = 10;
    const groups = (o.cat === 'gearlist' ? gearListGroups : propListGroups)(o);
    const selMe = sel && sel.type==='object' && sel.id===o.id && !ghost;
    // width: longest scene header / prop name sets it; the right-edge handle widens
    let labMax = 120;
    ctx.font = '700 10px -apple-system,Segoe UI,sans-serif';
    for(const g of groups) labMax = Math.max(labMax, ctx.measureText(plSceneHead(g.s)).width - 22);
    ctx.font = '11.5px -apple-system,Segoe UI,sans-serif';
    for(const g of groups) for(const r of g.rows)
      labMax = Math.max(labMax, ctx.measureText(r.name + (r.count > 1 ? '  ×' + r.count : '')).width);
    o.w = clamp(Math.max(pad*2 + 22 + labMax + 14, o.userW || 280), 280, 900);
    let need = titleH + 8;
    for(const g of groups) need += headH + g.rows.length*rowH + addH;
    o.h = need + pad - 2;
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.clip();
    ctx.fillStyle = o.color; ctx.globalAlpha = .14;
    ctx.fillRect(-o.w/2, -o.h/2, o.w, titleH);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'middle';
    ctx.font = '700 11px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#33322E';
    ctx.fillText(o.cat === 'gearlist' ? 'GEAR LIST' : 'PROP LIST', -o.w/2 + 10, -o.h/2 + titleH/2 + .5);
    const total = groups.reduce((n,g)=>n + g.rows.length, 0);
    const got = groups.reduce((n,g)=>n + g.rows.filter(r=>r.done).length, 0);
    ctx.textAlign = 'right';
    ctx.font = '600 10.5px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#8A877F';
    ctx.fillText(total ? got + ' / ' + total : '', o.w/2 - 8, -o.h/2 + titleH/2 + .5);
    ctx.textAlign = 'left';
    o._plChecks = []; o._plNames = []; o._plAdds = []; o._plDels = [];
    const cbX = -o.w/2 + pad, nX = cbX + 22;
    let y = -o.h/2 + titleH + 8;
    for(const g of groups){
      // scene header
      ctx.font = '700 10px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = '#8A877F';
      ctx.fillText(trimText(ctx, plSceneHead(g.s), o.w - pad*2), cbX, y + headH/2 + 2);
      y += headH;
      for(const r of g.rows){
        const cy = y + rowH/2;
        // tick box
        ctx.strokeStyle = r.done ? o.color : '#B9B6AE'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(cbX, cy - 7, 14, 14, 2);
        if(r.done){
          ctx.fillStyle = o.color; ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cbX + 3.4, cy); ctx.lineTo(cbX + 6.2, cy + 3.2); ctx.lineTo(cbX + 10.8, cy - 3.4);
          ctx.stroke();
        } else ctx.stroke();
        o._plChecks.push({key:r.key, sceneId:r.sceneId, rowId:r.rowId || null,
          x:o.x + cbX - 4, y:o.y + cy - 11, w:22, h:22});
        // name — script mentions in italic, ticked rows struck through
        if(!(noteEditor && noteEditor.id===o.id && r.rowId && noteEditor.field==='pl:'+r.sceneId+':'+r.rowId)){
          ctx.font = (r.script ? 'italic ' : '') + '11.5px -apple-system,Segoe UI,sans-serif';
          ctx.fillStyle = r.done ? 'rgba(74,70,54,.4)' : '#4A4636';
          const txt = r.name + (r.count > 1 ? '  ×' + r.count : '');
          ctx.fillText(trimText(ctx, txt, o.w/2 - pad - nX), nX, cy);
          if(r.done){
            const tw = Math.min(ctx.measureText(txt).width, o.w/2 - pad - nX);
            ctx.strokeStyle = 'rgba(74,70,54,.4)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(nX, cy); ctx.lineTo(nX + tw, cy); ctx.stroke();
          }
        }
        o._plNames.push({key:r.key, sceneId:r.sceneId, rowId:r.rowId || null,
          x:o.x + nX - 4, y:o.y + cy - 10, w:o.w/2 - pad - nX + 8, h:20,
          lx:nX, ly:cy - 9, lw:o.w/2 - pad - nX});
        y += rowH;
      }
      // + prop
      ctx.font = '600 10.5px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = shade(o.color, .75);
      ctx.fillText('+ prop', nX, y + addH/2);
      o._plAdds.push({sceneId:g.s.id, x:o.x + cbX, y:o.y + y - 2, w:90, h:addH + 4});
      y += addH;
    }
    ctx.restore();
    ctx.strokeStyle = '#D8D5CF'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.stroke();
    // × chips: manual rows are removed, auto rows dismissed (they'd re-detect)
    if(selMe){
      ctx.textAlign = 'center'; ctx.font = '700 11px -apple-system,Segoe UI,sans-serif';
      let y2 = -o.h/2 + titleH + 8;
      for(const g of groups){
        y2 += headH;
        for(const r of g.rows){
          const cy = y2 + rowH/2;
          ctx.beginPath(); ctx.arc(o.w/2 + 14, cy, 8, 0, 7);
          ctx.fillStyle = '#fff'; ctx.fill();
          ctx.strokeStyle = '#B9B6AE'; ctx.lineWidth = 1.2; ctx.stroke();
          ctx.fillStyle = '#8A877F'; ctx.fillText('×', o.w/2 + 14, cy + 1);
          o._plDels.push({key:r.key, sceneId:r.sceneId, rowId:r.rowId || null,
            x:o.x + o.w/2 + 14, y:o.y + cy, r:11});
          y2 += rowH;
        }
        y2 += addH;
      }
      ctx.textAlign = 'left';
    }
    ctx.textBaseline = 'alphabetic';
  } else if(o.cat === 'callsheet'){
    // THE call sheet — a live composite of the other cards. Nothing here is
    // edited directly: day header, registry, location and weather feed it.
    normalizeProduction();
    if(!o.inc) o.inc = {location:true, schedule:true, props:true, crew:true, cast:true, client:true, weather:true};
    if(o.inc.schedule === undefined) o.inc.schedule = true;
    if(o.inc.props === undefined) o.inc.props = true;
    if(o.inc.gear === undefined) o.inc.gear = false; // opt-in — most sheets don't list gear
    const inc = o.inc;
    const b = project.prodboard;
    // one bound day (selection bar cycles) OR all days stacked on one sheet
    const allD = boardDays();
    const multi = !!o.allDays && allD.length > 1;
    const day = multi ? allD[0] : dayFor(o);
    const dayList = multi ? allD : [day];
    const wea = b && b.objects.find(x=>x.cat==='weather' && x.data && x.data.length);
    const ppl = t => peopleReg().filter(p=>p.tag===t);
    const titleH = 26, rowH = 17, secHead = 16, gap = 8, pad = 10;
    // width resolves AFTER the lines are built (auto-fit + manual handle)
    // build sections as [header, [lines, …]] — a line is [kind, text, segs?]
    // where segs mark LINKED substrings ({s,e,u}) → blue + underline on the
    // card and real Link annotations in the PDF export
    const seg = parts => {
      let txt = '', segs = [];
      for(const p of parts){
        if(!p || !p.t) continue;
        if(txt) txt += '   ';
        if(p.u) segs.push({s:txt.length, e:txt.length + p.t.length, u:p.u});
        txt += p.t;
      }
      return ['n', txt, segs];
    };
    const tel = p => p ? 'tel:' + String(p).replace(/[^\d+]/g, '') : null;
    const mailto = m => m ? 'mailto:' + m : null;
    const secs = [];
    for(const d of dayList){
      if(multi && d){
        // day banner: number, date, calls, sun
        const dl = d.date ? new Date(d.date + 'T12:00:00')
          .toLocaleDateString('nl-NL', {weekday:'long', day:'numeric', month:'long'}) : '';
        const banner = [['t', 'SHOOT DAY ' + dayNumber(d) + (dl ? ' — ' + dl.toUpperCase() : '')]];
        const calls = [d.call && 'CALL ' + d.call, d.shootCall && 'shoot ' + d.shootCall,
          d.wrap && 'wrap ' + d.wrap].filter(Boolean).join('  ·  ');
        if(calls) banner.push(['b', calls]);
        const dsun = d.date && d.lat != null ? sunTimes(d.date, d.lat, d.lon) : null;
        if(dsun && dsun.rise) banner.push(['n', 'Sunrise ' + dsun.rise + ' · sunset ' + dsun.set]);
        secs.push(['', banner]);
      }
      if(inc.location){
        const L = [];
        // the day's ASSIGNED locations in visiting order beat the full list
        const assigned = dayLocs(d);
        const locs = assigned.length ? assigned
          : project.production.locations.filter(l=>l.name || l.street || l.town || l.address);
        const numbered = assigned.length > 1;
        locs.forEach((loc, li)=>{
          if(li) L.push(['p', '']); // breathing room between locations
          if(loc.name) L.push(['b', (numbered ? (li+1) + ' · ' : '') + loc.name]);
          const addr = [loc.street, loc.town, loc.country].filter(Boolean).join(', ') || loc.address;
          if(addr) L.push(seg([{t:addr, u:'https://maps.google.com/?q=' + encodeURIComponent(addr)}]));
          for(const [k, lab] of [['parking','Parking'],['power','Power'],['hospital','Hospital'],['notes','Notes']])
            if(loc[k]) L.push(['n', lab + ': ' + loc[k]]);
        });
        secs.push([locs.length > 1 ? (numbered ? 'LOCATIONS · IN ORDER' : 'LOCATIONS') : 'LOCATION',
          L.length ? L : [['p','fill a Location card…']]]);
      }
      if(inc.schedule){
        // mirrors the Day schedule card BOUND TO THE SAME DAY (fallback: first)
        const scheds = (b ? b.objects.filter(x=>x.cat==='schedule') : []);
        const schd = scheds.find(x=>dayFor(x) === d) || (multi ? null : scheds[0]);
        const cs2 = computeSchedule(schd || {}, d);
        const L = [];
        if(schd) for(const r of cs2.rows){
          if(r.it.on === false || r.start == null) continue;
          L.push([r.it.type === 'scene' ? 'n' : 'p',
            minToHHMM(r.start) + '  ' + r.label +
            (r.it.type !== 'scene' ? ' (' + r.dur + 'm)' : '')]);
        }
        if(L.length) L.push(['b', 'Est. wrap ' + ((d && d.wrap) || cs2.wrap)]);
        if(L.length || !multi)
          secs.push(['SCHEDULE', L.length ? L : [['p','tick scenes on the Day schedule card…']]]);
      }
    }
    if(inc.props){
      // mirrors the Prop list card: its dismissals and manual rows travel along
      const plc = b && b.objects.find(x=>x.cat==='proplist');
      const L = [];
      for(const g of propListGroups(plc || {props:{}, hide:{}, done:{}})){
        if(!g.rows.length) continue;
        L.push(['b', plSceneHead(g.s)]);
        for(const r of g.rows)
          L.push(['n', '·  ' + r.name + (r.count > 1 ? '  ×' + r.count : '')]);
      }
      secs.push(['PROPS', L.length ? L : [['p','place props on the boards / drop a Prop list card…']]]);
    }
    if(inc.gear){
      // mirrors the Gear list card (fixture names, dismissals, manual rows)
      const glc = b && b.objects.find(x=>x.cat==='gearlist');
      const L = [];
      for(const g of gearListGroups(glc || {props:{}, hide:{}, done:{}})){
        if(!g.rows.length) continue;
        L.push(['b', plSceneHead(g.s)]);
        for(const r of g.rows)
          L.push(['n', '·  ' + r.name + (r.count > 1 ? '  ×' + r.count : '')]);
      }
      secs.push(['GEAR', L.length ? L : [['p','place cameras & lights on the scene boards…']]]);
    }
    if(inc.crew){
      const c = ppl('crew');
      secs.push(['CREW', c.length ? c.map(p=>seg([
        {t:p.call}, {t:p.role && p.role + ' —'}, {t:p.name},
        {t:p.phone, u:tel(p.phone)}, {t:p.email, u:mailto(p.email)},
      ])) : [['p','add people on the Crew card…']]]);
    }
    if(inc.cast){
      const c = ppl('cast');
      secs.push(['CAST', c.length ? c.map(p=>seg([
        {t:p.call}, {t:p.name}, {t:p.role && '(' + p.role + ')'},
        {t:p.phone, u:tel(p.phone)}, {t:p.email, u:mailto(p.email)},
      ])) : [['p','—']]]);
    }
    if(inc.client){
      const c = ppl('client');
      secs.push(['CLIENT', c.length ? c.map(p=>seg([
        {t:p.name}, {t:p.role && '— ' + p.role},
        {t:p.phone, u:tel(p.phone)}, {t:p.email, u:mailto(p.email)},
      ])) : [['p','—']]]);
    }
    if(inc.weather && !multi){ // per-day sun lives in the day banners on an all-days sheet
      const L = [];
      // auto forecast from the day header's place + date beats the manual card
      if(day && day.date && day.lat != null && typeof callsheetWeather === 'function')
        callsheetWeather(o, day);
      if(o.wx && o.wx.data){
        L.push(['b', (o.wx.place || 'Shoot location') + ' · ' + o.wx.date]);
        for(const [k, v] of o.wx.data) L.push(['n', k + ': ' + v]);
      } else if(wea){
        if(wea.place) L.push(['b', wea.place + (wea.date ? ' · ' + wea.date : '')]);
        for(const [k, v] of wea.data) L.push(['n', k + ': ' + v]);
      } else if(o.wx && o.wx.key){
        L.push(['p', 'forecast opens ~16 days before the shoot day']);
      }
      const sun = day && day.date && day.lat != null ? sunTimes(day.date, day.lat, day.lon) : null;
      if(sun && sun.rise) L.push(['n', 'Sunrise ' + sun.rise + ' · sunset ' + sun.set]);
      secs.push(['WEATHER & SUN', L.length ? L
        : [['p','needs the Day header: date + "Sun from location ↻"']]]);
    }
    // header block: production + company contact (clickable) + day/calls
    const head = [];
    head.push(['t', (project.shootName || 'Production').toUpperCase()]);
    const P = project.production;
    if(P.company || P.email || P.phone)
      head.push(seg([{t:P.company}, {t:P.email, u:mailto(P.email)}, {t:P.phone, u:tel(P.phone)}]));
    if(multi){
      head.push(['b', dayList.length + ' shoot days' +
        (dayList[0].date && dayList[dayList.length-1].date
          ? '  ·  ' + dayList[0].date + ' → ' + dayList[dayList.length-1].date : '')]);
    } else if(day){
      const d = day.date ? new Date(day.date + 'T12:00:00') : null;
      const ds = d && !isNaN(d) ? d.toLocaleDateString('nl-NL', {weekday:'long', day:'numeric', month:'long', year:'numeric'}) : '';
      const calls = [day.call && 'CALL ' + day.call, day.shootCall && 'shoot ' + day.shootCall,
        day.wrap && 'wrap ' + day.wrap].filter(Boolean).join('  ·  ');
      if(ds) head.push(['b', ds]);
      if(calls) head.push(['b', calls]);
    } else head.push(['p', 'drop a Day header card for date & calls…']);
    // width: fit the longest line, or the user's own width — whichever wins
    const fontFor = k => k === 't' ? '800 13px -apple-system,Segoe UI,sans-serif'
      : k === 'b' ? '600 11.5px -apple-system,Segoe UI,sans-serif'
      : k === 'p' ? 'italic 11px -apple-system,Segoe UI,sans-serif'
      : '11.5px -apple-system,Segoe UI,sans-serif';
    let needW = 380 - pad*2;
    for(const [k, txt] of head.concat(...secs.map(s2=>s2[1]))){
      ctx.font = fontFor(k);
      needW = Math.max(needW, ctx.measureText(txt).width);
    }
    o.w = clamp(Math.max(needW + pad*2 + 4, o.userW || 380), 380, 900);
    o.h = titleH + pad + head.length*rowH + gap +
      secs.reduce((a, s)=>a + secHead + s[1].length*rowH + gap, 0) + pad - gap + 6;
    // draw
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.clip();
    ctx.fillStyle = o.color; ctx.globalAlpha = .14;
    ctx.fillRect(-o.w/2, -o.h/2, o.w, titleH);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'middle';
    ctx.font = '700 11px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#33322E';
    ctx.fillText('CALL SHEET', -o.w/2 + 10, -o.h/2 + titleH/2 + .5);
    ctx.font = '10px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#8A877F';
    ctx.textAlign = 'right';
    ctx.fillText('live — edits happen on the source cards', o.w/2 - 8, -o.h/2 + titleH/2 + .5);
    ctx.textAlign = 'left';
    let y = -o.h/2 + titleH + pad + rowH/2;
    o._csLinks = []; // card-local link rects — the PDF export turns these into annotations
    const drawLine = (kind, txt, segs)=>{
      if(kind === 't'){ ctx.font = '800 13px -apple-system,Segoe UI,sans-serif'; ctx.fillStyle = '#33322E'; }
      else if(kind === 'b'){ ctx.font = '600 11.5px -apple-system,Segoe UI,sans-serif'; ctx.fillStyle = '#33322E'; }
      else if(kind === 'p'){ ctx.font = 'italic 11px -apple-system,Segoe UI,sans-serif'; ctx.fillStyle = 'rgba(74,70,54,.4)'; }
      else { ctx.font = '11.5px -apple-system,Segoe UI,sans-serif'; ctx.fillStyle = '#4A4636'; }
      const shown = trimText(ctx, txt, o.w - pad*2);
      ctx.fillText(shown, -o.w/2 + pad, y);
      if(segs) for(const sg of segs){
        if(sg.s >= shown.length || !sg.u) continue;
        const sub = shown.slice(sg.s, Math.min(sg.e, shown.length));
        const x0 = ctx.measureText(shown.slice(0, sg.s)).width;
        const sw = ctx.measureText(sub).width;
        ctx.fillStyle = '#3B5BDB';
        ctx.fillText(sub, -o.w/2 + pad + x0, y);
        ctx.strokeStyle = 'rgba(59,91,219,.45)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-o.w/2 + pad + x0, y + 6.5);
        ctx.lineTo(-o.w/2 + pad + x0 + sw, y + 6.5); ctx.stroke();
        ctx.fillStyle = '#4A4636';
        o._csLinks.push({u:sg.u, x:-o.w/2 + pad + x0, y:y - rowH/2, w:sw, h:rowH});
      }
      y += rowH;
    };
    for(const [k, t, sg] of head) drawLine(k, t, sg);
    // company logo — top-right of the head block (exports with the PDF)
    if(P.logo){
      const im = imgCache[P.logo];
      if(im && im.complete && im.naturalWidth){
        const k2 = Math.min(110 / im.naturalWidth, 36 / im.naturalHeight, 1);
        const lw = im.naturalWidth * k2, lh = im.naturalHeight * k2;
        ctx.drawImage(im, o.w/2 - pad - lw, -o.h/2 + titleH + 8, lw, lh);
      } else if(o._logoTried !== P.logo){
        o._logoTried = P.logo;
        loadStill(P.logo).then(()=>render());
      }
    }
    y += gap - rowH + rowH;
    for(const [name, lines] of secs){
      ctx.strokeStyle = '#E5E3DE'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-o.w/2 + pad, y - rowH/2 - 2); ctx.lineTo(o.w/2 - pad, y - rowH/2 - 2); ctx.stroke();
      ctx.font = '700 9.5px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = shade(o.color, .8);
      ctx.fillText(name, -o.w/2 + pad, y + 2);
      y += secHead;
      for(const [k, t, sg] of lines) drawLine(k, t, sg);
      y += gap;
    }
    ctx.restore();
    ctx.strokeStyle = '#D8D5CF'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.stroke();
    ctx.textBaseline = 'alphabetic';
  } else if(o.cat === 'subboard'){
    // a board inside the board: named card + live thumbnail of its contents
    const titleH = 26;
    o.w = Math.max(o.w || 260, 160);
    o.h = Math.max(o.h || 180, 120);
    const nObj = (o.board && o.board.objects || []).length;
    const nWall = (o.board && o.board.walls || []).length;
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.clip();
    ctx.fillStyle = o.color; ctx.globalAlpha = .14;
    ctx.fillRect(-o.w/2, -o.h/2, o.w, titleH);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'middle';
    ctx.font = '700 11px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#33322E';
    ctx.fillText('▣ ' + trimText(ctx, (o.label || 'SUB-BOARD').toUpperCase(), o.w - 70),
      -o.w/2 + 10, -o.h/2 + titleH/2 + .5);
    if(nObj + nWall){
      ctx.textAlign = 'right';
      ctx.font = '600 10px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = '#8A877F';
      ctx.fillText((nObj + nWall) + ' item' + (nObj + nWall === 1 ? '' : 's'),
        o.w/2 - 8, -o.h/2 + titleH/2 + .5);
      ctx.textAlign = 'left';
    }
    const pv = o._pv;
    if(pv && pv.width){
      // contain-fit the cached thumbnail into the body
      const bw = o.w - 12, bh = o.h - titleH - 12;
      const k = Math.min(bw / pv.width, bh / pv.height);
      const dw = pv.width * k, dh = pv.height * k;
      ctx.globalAlpha = .96;
      ctx.drawImage(pv, -dw/2, -o.h/2 + titleH + 6 + (bh - dh)/2, dw, dh);
      ctx.globalAlpha = 1;
    } else {
      ctx.font = 'italic 11px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = 'rgba(74,70,54,.4)';
      ctx.textAlign = 'center';
      ctx.fillText(nObj + nWall ? 'rendering preview…' : 'empty — double-click to open',
        0, -o.h/2 + titleH + (o.h - titleH)/2);
      ctx.textAlign = 'left';
      if((nObj + nWall) && !(pv && pv.width) && !o._pvGen && !ghost){
        o._pvGen = true; // deferred so thumbnail rendering never nests inside a draw
        setTimeout(()=>{
          try{ o._pv = renderShotPlan(o.board, 640, null, false); }
          catch(e){ console.warn('subboard thumb failed', e); }
          o._pvGen = false;
          render();
        }, 0);
      }
    }
    ctx.restore();
    ctx.strokeStyle = '#D8D5CF'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.stroke();
    ctx.textBaseline = 'alphabetic';
  } else if(o.cat === 'dayheader'){
    // the call-time block — echoes a Dutch call sheet header
    const G = DAYH;
    const dLocs = dayLocs(o);
    o.w = G.w;
    o.h = G.titleH + G.bigH + G.rowH*2 + (dLocs.length ? G.rowH : 0);
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.clip();
    ctx.fillStyle = o.color || '#E8604C'; ctx.globalAlpha = .14;
    ctx.fillRect(-o.w/2, -o.h/2, o.w, G.titleH);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'middle';
    ctx.font = '700 11px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#33322E';
    ctx.fillText('SHOOT DAY ' + dayNumber(o), -o.w/2 + 10, -o.h/2 + G.titleH/2 + .5);
    // date, right-aligned in the strip (Dutch long form)
    ctx.textAlign = 'right';
    ctx.font = '600 11px -apple-system,Segoe UI,sans-serif';
    if(o.date){
      const d = new Date(o.date + 'T12:00:00');
      ctx.fillStyle = '#33322E';
      ctx.fillText(isNaN(d) ? o.date :
        d.toLocaleDateString('nl-NL', {weekday:'short', day:'numeric', month:'long', year:'numeric'}),
        o.w/2 - 8, -o.h/2 + G.titleH/2 + .5);
    } else {
      ctx.fillStyle = 'rgba(74,70,54,.35)';
      ctx.fillText('pick a date (selection bar)', o.w/2 - 8, -o.h/2 + G.titleH/2 + .5);
    }
    ctx.textAlign = 'left';
    // big general call
    const bigY = -o.h/2 + G.titleH + G.bigH/2;
    if(!(noteEditor && noteEditor.id===o.id && noteEditor.field==='dh:call')){
      ctx.textAlign = 'center';
      ctx.font = '700 10px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = '#8A877F';
      ctx.fillText('GENERAL CALL', 0, bigY - 16);
      ctx.font = '800 26px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = o.call ? '#33322E' : 'rgba(74,70,54,.3)';
      ctx.fillText(o.call || '07:00', 0, bigY + 8);
      ctx.textAlign = 'left';
    }
    // shooting call | est. wrap
    const r1 = -o.h/2 + G.titleH + G.bigH;
    ctx.strokeStyle = '#E5E3DE'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-o.w/2, r1); ctx.lineTo(o.w/2, r1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, r1); ctx.lineTo(0, r1 + G.rowH); ctx.stroke();
    ctx.font = '700 9.5px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle = '#8A877F';
    ctx.fillText('SHOOTING CALL', -o.w/2 + 10, r1 + G.rowH/2 + .5);
    ctx.fillText('EST. WRAP', 10, r1 + G.rowH/2 + .5);
    ctx.font = '600 13px -apple-system,Segoe UI,sans-serif';
    if(!(noteEditor && noteEditor.id===o.id && noteEditor.field==='dh:shootCall')){
      ctx.fillStyle = o.shootCall ? '#33322E' : 'rgba(74,70,54,.3)';
      ctx.textAlign = 'right';
      ctx.fillText(o.shootCall || '–:–', -14, r1 + G.rowH/2 + .5);
      ctx.textAlign = 'left';
    }
    if(!(noteEditor && noteEditor.id===o.id && noteEditor.field==='dh:wrap')){
      ctx.fillStyle = o.wrap ? '#33322E' : 'rgba(74,70,54,.3)';
      ctx.textAlign = 'right';
      ctx.fillText(o.wrap || '–:–', o.w/2 - 14, r1 + G.rowH/2 + .5);
      ctx.textAlign = 'left';
    }
    // sunrise / sunset from the location card's place
    const r2 = r1 + G.rowH;
    ctx.beginPath(); ctx.moveTo(-o.w/2, r2); ctx.lineTo(o.w/2, r2); ctx.stroke();
    const sun = (o.date && o.lat !== undefined && o.lat !== null)
      ? sunTimes(o.date, o.lat, o.lon) : null;
    ctx.font = '600 12px -apple-system,Segoe UI,sans-serif';
    if(sun && sun.rise){
      ctx.fillStyle = '#C98A17';
      ctx.fillText('☀↑ ' + sun.rise + '   ☀↓ ' + sun.set, -o.w/2 + 10, r2 + G.rowH/2 + .5);
      if(o.place){
        ctx.textAlign = 'right';
        ctx.font = '11px -apple-system,Segoe UI,sans-serif';
        ctx.fillStyle = '#8A877F';
        ctx.fillText(trimText(ctx, o.place, o.w/2 - 90), o.w/2 - 8, r2 + G.rowH/2 + .5);
        ctx.textAlign = 'left';
      }
    } else {
      ctx.fillStyle = 'rgba(74,70,54,.35)';
      ctx.font = '11px -apple-system,Segoe UI,sans-serif';
      ctx.fillText('☀ sunrise/sunset — "Sun from location ↻" in the selection bar',
        -o.w/2 + 10, r2 + G.rowH/2 + .5);
    }
    // this day's locations, in visiting order (selection bar assigns them)
    if(dLocs.length){
      const r3 = r2 + G.rowH;
      ctx.strokeStyle = '#E5E3DE'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-o.w/2, r3); ctx.lineTo(o.w/2, r3); ctx.stroke();
      ctx.font = '600 11px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle = '#4A4636';
      const chain = dLocs.map((l, i)=>(dLocs.length > 1 ? (i+1) + ' ' : '') +
        (l.name || l.town || 'location')).join('  →  ');
      ctx.fillText('⚑ ' + trimText(ctx, chain, o.w - 30), -o.w/2 + 10, r3 + G.rowH/2 + .5);
    }
    ctx.restore();
    ctx.strokeStyle = '#D8D5CF'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-o.w/2,-o.h/2,o.w,o.h,3); ctx.stroke();
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
      ctx.restore(); // balance the outer save — an early return without this
      return;        // leaked the transform and broke every draw after it
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
    // + chip below when selected: chain the next shot row of this scene
    if(sel && sel.type==='object' && sel.id===o.id && !ghost){
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      ctx.font = '700 13px -apple-system,Segoe UI,sans-serif';
      ctx.beginPath(); ctx.arc(0, o.h/2+15, 10, 0, 7);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = '#B9B6AE'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = '#8A877F';
      ctx.fillText('+', 0, o.h/2+16);
      ctx.textAlign = 'left';
      o._plusRow = {x:o.x, y:o.y + o.h/2 + 15, r:14};
    } else o._plusRow = null;
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
      // only kick off a load when nothing is cached yet — a cached-but-broken
      // image must NOT reschedule render() forever (busy-loops the main thread)
      if(!imgCache[o.imgId] && !o._loading){
        o._loading = true;
        loadStill(o.imgId).then(()=>{ o._loading=false; render(); });
      }
    }
  } else {
    const def = o.kind.startsWith('custom:')
      ? (project.customProps.find(p=>p.id===o.kind.slice(7)) || {shape:'rect'})
      : null;
    // lights throw a beam / glow (under the icon); Beam toggle in selBar,
    // amber handles adjust spread + throw (stored as o.beamSpread/o.beamRange)
    const beam = (!def && o.beam !== false) ? LIGHT_BEAMS[o.kind] : null;
    if(beam && !ghost){
      const selMe = sel && sel.type==='object' && sel.id===o.id;
      ctx.save();
      // per-light color (RGB wins over kelvin — see beamTintFor) + diffusion softening
      const df = DIFF_F[o.diff] || null;
      let {tint, a: a0} = beamTintFor(o, beam);
      if(df) a0 *= df.a;
      if(beam.omni){
        const rg = o.beamRange || beam.omni;
        const g = ctx.createRadialGradient(0,0,6, 0,0,rg);
        g.addColorStop(0, 'rgba('+tint+','+a0+')');
        g.addColorStop(1, 'rgba('+tint+',0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0,0,rg,0,7); ctx.fill();
      } else {
        ctx.rotate(beam.axis || 0);
        const sp = (o.beamSpread || beam.spread) * (df ? df.sp : 1);
        const rg = o.beamRange || beam.range;
        const a = rad(sp/2);
        const g = ctx.createRadialGradient(0,0,8, 0,0,rg);
        g.addColorStop(0, 'rgba('+tint+','+a0+')');
        g.addColorStop(1, 'rgba('+tint+',0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0,0);
        ctx.arc(0,0,rg,-a,a);
        ctx.closePath(); ctx.fill();
        if(selMe){ // show the adjustable edges while selected
          ctx.strokeStyle = 'rgba(226,169,59,.6)'; ctx.lineWidth = 1.2; ctx.setLineDash([5,5]);
          ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(-a)*rg, Math.sin(-a)*rg);
          ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*rg, Math.sin(a)*rg);
          ctx.stroke(); ctx.setLineDash([]);
        }
      }
      ctx.restore();
    }
    if(['kitchen','kitchen_l','kitchen_corner'].includes(o.kind)){
      // kitchens carry their own sink/hob positions (undefined = defaults, null = hidden)
      (o.kind === 'kitchen_corner' ? kitchenCornerBody : kitchenBody)(ctx, o.w, o.h, o.color);
      kitchenFixtures(ctx, o.kind, o.w, o.h, o.color,
        o.sink === null ? null : (o.sink ?? .22),
        o.hob === null ? null : (o.hob ?? .72));
    } else
    (def ? PROPS.custom.draw : (PROPS[o.kind]||PROPS.custom).draw)(ctx, o.w, o.h, o.color, def);
  }
  ctx.restore();
  // todo + avscript already show their label in the title strip — no floating chip
  const chipText = !ghost && !['note','text','link','todo','avscript'].includes(o.cat)
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
