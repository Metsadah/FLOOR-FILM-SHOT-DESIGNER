// FLOOR — 06-tabs.js
// The app shell: Moodboard · Script · Storyboard · Shot designer · Production.
// Moodboard reuses the whole canvas engine on a project-level board.

// ---------------------------------------------------------------- tab switching
function switchTab(t){
  if(activeTab === t) return;
  closeNoteEditor(true);
  togglePlay(false);
  sel = null; drag = null;
  activeTab = t;
  document.body.className = document.body.className.replace(/\btab-\w+\b/g, '').trim();
  document.body.classList.add('tab-' + t);
  document.querySelectorAll('#tabbar button').forEach(b =>
    b.classList.toggle('on', b.dataset.tab === t));
  if(t === 'mood'){
    ensureMoodboard();
    buildLibrary();
    refreshSelBar();
    ensureShotImages(activeScene(), false).then(()=>{ zoomFitIfEmptyView(); render(); });
  } else if(t === 'write'){
    ensureScriptBoard();
    buildLibrary();
    refreshSelBar();
    ensureShotImages(activeScene(), false).then(()=>{ zoomFitIfEmptyView(); render(); });
  } else if(t === 'design'){
    buildLibrary(); buildShotList(); buildInfo(); buildStills();
    refreshSelBar();
    ensureShotImages(activeScene(), false).then(render);
  } else if(t === 'org'){
    ensureProdBoard();
    buildLibrary();
    buildOrgPanel();
    refreshSelBar();
    ensureShotImages(activeScene(), false).then(()=>{ zoomFitIfEmptyView(); render(); });
  }
  render();
}
let _fitOnceDone = {};
function zoomFitIfEmptyView(){
  if(_fitOnceDone[activeTab]) return;
  _fitOnceDone[activeTab] = true;
  zoomFit();
}
document.querySelectorAll('#tabbar button').forEach(b =>
  b.addEventListener('click', ()=>switchTab(b.dataset.tab)));

// ---------------------------------------------------------------- moodboard
function ensureMoodboard(){
  if(!project.moodboard){
    const m = newShot(0);
    m.name = 'Moodboard';
    project.moodboard = m;
    markDirty();
  }
  migrateShot(project.moodboard);
}
function ensureScriptBoard(){
  if(!project.scriptboard){
    const b = newShot(0);
    b.name = 'Script & storyboard';
    project.scriptboard = b;
    // starter layout: one film script block, ready to type into
    b.objects.push({id:uid(), cat:'script', kind:'script', x:-260, y:0, rot:0,
      w:430, h:300, mode:'film', text:'', textR:'', fontSize:12.5,
      color:'#5B6472', label:'', path:[]});
    project.scriptboard = b;
    markDirty();
  }
  migrateShot(project.scriptboard);
}
// library section for the Script & Storyboard board
function buildWriteLibSection(lib){
  const h = document.createElement('div');
  h.className = 'side-head';
  h.style.marginTop = '10px';
  h.textContent = 'Script & storyboard';
  lib.appendChild(h);
  const grid = document.createElement('div');
  grid.className = 'lib-grid';
  const tile = (name, drawFn, spec)=>{
    const el = document.createElement('div');
    el.className = 'lib-item';
    el.appendChild(tileCanvas(drawFn, 100, 100, '#5B6472'));
    el.insertAdjacentHTML('beforeend', '<span>' + esc(name) + '</span>');
    el.addEventListener('pointerdown', e => startLibDrag(e, spec));
    grid.appendChild(el);
  };
  tile('Film script', (tc,w2,h2,c2)=>{
    tc.strokeStyle=c2; tc.lineWidth=2.5;
    tc.strokeRect(-w2*.34,-h2*.4,w2*.68,h2*.8);
    tc.globalAlpha=.6;
    for(let i=0;i<5;i++){ tc.beginPath(); tc.moveTo(-w2*.24,-h2*.26+i*h2*.13); tc.lineTo(w2*.24,-h2*.26+i*h2*.13); tc.stroke(); }
    tc.globalAlpha=1;
  }, {cat:'script', kind:'script', mode:'film'});
  tile('AV script', (tc,w2,h2,c2)=>{
    tc.strokeStyle=c2; tc.lineWidth=2.5;
    tc.strokeRect(-w2*.38,-h2*.4,w2*.76,h2*.8);
    tc.beginPath(); tc.moveTo(0,-h2*.4); tc.lineTo(0,h2*.4); tc.stroke();
    tc.globalAlpha=.6;
    for(let i=0;i<4;i++){
      tc.beginPath(); tc.moveTo(-w2*.3,-h2*.24+i*h2*.14); tc.lineTo(-w2*.08,-h2*.24+i*h2*.14);
      tc.moveTo(w2*.08,-h2*.24+i*h2*.14); tc.lineTo(w2*.3,-h2*.24+i*h2*.14); tc.stroke();
    }
    tc.globalAlpha=1;
  }, {cat:'script', kind:'script', mode:'av'});
  tile('Storyboard row', (tc,w2,h2,c2)=>{
    tc.strokeStyle=c2; tc.lineWidth=2.5;
    tc.strokeRect(-w2*.42,-h2*.18,w2*.84,h2*.36);
    tc.beginPath();
    tc.moveTo(-w2*.16,-h2*.18); tc.lineTo(-w2*.16,h2*.18);
    tc.moveTo(w2*.1,-h2*.18); tc.lineTo(w2*.1,h2*.18);
    tc.stroke();
    tc.globalAlpha=.5; tc.fillStyle=c2;
    tc.fillRect(-w2*.13,-h2*.12,w2*.2,h2*.24);
    tc.globalAlpha=1;
  }, {cat:'sbrow', kind:'sbrow'});
  lib.appendChild(grid);
  const tip = document.createElement('div');
  tip.style.cssText = 'font-size:10px;color:var(--ink2);padding:4px 14px 8px;line-height:1.5;';
  tip.textContent = 'Write in a script block, then select it and hit "Break down" — FLOOR creates a storyboard row and a scene board per detected scene, with every camera on that board mapping to a shot.';
  lib.appendChild(tip);
}
function ensureProdBoard(){
  if(!project.prodboard){
    const b = newShot(0);
    b.name = 'Production board';
    project.prodboard = b;
    markDirty();
  }
  migrateShot(project.prodboard);
}

// ---- production card library (templated notes — drag onto the board) ----
const PROD_CARDS = [
  ['Call sheet', '#4B6BFB', 280, 360, 'CALL SHEET',
   'Production: \nDate: \nCrew call: \nOn set: \nLunch: \nWrap: \n\nLocation: \nAddress: \nParking: \nNearest hospital: \n\nWeather: \nSunrise / sunset: \n\nNotes: '],
  ['Day schedule', '#E8934C', 250, 300, 'SCHEDULE',
   '07:00  Crew call\n07:30  Build & light\n09:00  Shot 1\n11:00  Shot 2\n13:00  Lunch\n14:00  Shot 3\n17:30  Last looks\n18:00  Wrap'],
  ['Contact card', '#5B6472', 230, 170, 'CONTACT',
   'Role: \nName: \nPhone: \nEmail: \nCall time: '],
  ['Location card', '#3E9B6E', 250, 250, 'LOCATION',
   'Name: \nAddress: \nParking: \nPower: \nToilets: \nAccess / keys: \nNotes: '],
  ['Checklist', '#8B5CF6', 230, 260, 'CHECKLIST',
   '\u2610 Camera batteries\n\u2610 Media cards\n\u2610 Release forms\n\u2610 Catering confirmed\n\u2610 Parking arranged\n\u2610 Backup drive'],
  ['Weather card', '#4CA6E8', 230, 200, 'WEATHER',
   'Date: \nForecast: \nTemp: \nWind: \nRain chance: \nSunrise: \nSunset: '],
];
function buildProdLibSection(lib){
  const h = document.createElement('div');
  h.className = 'side-head';
  h.style.marginTop = '10px';
  h.textContent = 'Production cards';
  lib.appendChild(h);
  const grid = document.createElement('div');
  grid.className = 'lib-grid';
  for(const [name, color, w, hh, label, text] of PROD_CARDS){
    const el = document.createElement('div');
    el.className = 'lib-item';
    el.appendChild(tileCanvas((tc,w2,h2)=>{
      drawNoteShape(tc, {w:w2, h:h2, color, text:''}, true);
      tc.fillStyle = color;
      tc.fillRect(-w2*.32, -h2*.3, w2*.64, 4);
      tc.globalAlpha = .5;
      for(const y2 of [-h2*.08, h2*.1, h2*.28]) tc.fillRect(-w2*.32, y2, w2*.64, 2.5);
      tc.globalAlpha = 1;
    }, 100, 100, color));
    el.insertAdjacentHTML('beforeend', '<span>' + esc(name) + '</span>');
    el.addEventListener('pointerdown', e => startLibDrag(e, {cat:'note', kind:'note', color,
      props:{label, text, w, h:hh, color}}));
    grid.appendChild(el);
  }
  lib.appendChild(grid);
  const tip = document.createElement('div');
  tip.style.cssText = 'font-size:10px;color:var(--ink2);padding:4px 14px 10px;line-height:1.5;';
  tip.textContent = 'Tip: drop a map screenshot or location photo straight onto the board (or paste with Cmd+V) — the Underlay toggle works here too.';
  lib.appendChild(tip);
}

// --- rule-based screenplay parsing (the AI pass lands in Phase 1) ---
const SCENE_HEADING_RE = /^\s*(?:\d+[.\s]+)?(INT\.?\/EXT\.?|EXT\.?\/INT\.?|I\/E\.?|INT\.?|EXT\.?)\s+(.+?)\s*$/i;
const TRANSITION_RE = /^(CUT TO|FADE (IN|OUT|TO)|DISSOLVE TO|SMASH CUT|MATCH CUT|CONTINUED)\b/i;
function parseScreenplay(text){
  const lines = text.split(/\r?\n/);
  const scenes = [];
  let cur = null;
  for(let i=0;i<lines.length;i++){
    const line = lines[i];
    const m = line.match(SCENE_HEADING_RE);
    if(m){
      if(cur) scenes.push(cur);
      const dn = (line.match(/\b(DAY|NIGHT|DAWN|DUSK|MORNING|EVENING|AFTERNOON)\b/i)||[])[1] || '';
      cur = {heading: line.trim(), intExt: m[1].toUpperCase().replace(/\.+$/,''),
             dayNight: dn.toUpperCase(), body: [], characters: new Set()};
      continue;
    }
    if(!cur) continue;
    cur.body.push(line);
    // character cue: an UPPERCASE line, not a transition, followed by dialogue
    const t = line.trim().replace(/\s*\((?:V\.?O\.?|O\.?S\.?|CONT'?D|O\.?C\.?)\.?\)\s*$/i,'');
    if(t && t === t.toUpperCase() && /^[A-Z][A-Z0-9 .'\-]{0,29}$/.test(t) &&
       !TRANSITION_RE.test(t) && !SCENE_HEADING_RE.test(t)){
      const next = (lines[i+1]||'').trim();
      if(next && !SCENE_HEADING_RE.test(next) && next !== next.toUpperCase()){
        cur.characters.add(t);
      }
    }
  }
  if(cur) scenes.push(cur);
  return scenes.map(s=>({...s, characters:[...s.characters], body:s.body.join('\n').trim()}));
}
function parseAV(text){
  // v1: each blank-line-separated paragraph becomes a scene
  return text.split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean).map((p,i)=>({
    heading: 'Scene ' + (i+1) + ' — ' + p.split('\n')[0].slice(0,60),
    intExt:'', dayNight:'', body:p, characters:[],
  }));
}
function createScenesFromBreakdown(parsed){
  const made = [];
  const startN = project.scenes.length;
  parsed.forEach((s, i)=>{
    const sc = newShot(startN + i + 1);
    sc.name = 'Sc ' + (startN + i + 1);
    sc.scene = String(startN + i + 1);
    sc.sceneDesc = s.heading.replace(SCENE_HEADING_RE, (m0,p1,p2)=>p1 + ' ' + p2) || s.heading;
    sc.script = s.body;
    // place detected cast as actor icons, fanned out in the middle
    s.characters.slice(0, 8).forEach((name, ci)=>{
      sc.objects.push({id:uid(), cat:'actor', kind: ci===0 ? 'actor' : 'actor_ant',
        x: -140 + (ci%4)*95, y: -60 + Math.floor(ci/4)*110, rot: 0,
        w:34, h:34, color: COLORS[ci % COLORS.length], label: name, path:[]});
    });
    project.scenes.push(sc);
    made.push(sc);
  });
  if(!project.activeSceneId && project.scenes.length) project.activeSceneId = project.scenes[0].id;
  markDirty();
  buildShotList(); buildInfo();
  return made;
}

// breakdown from a script block ON the canvas: scenes + a storyboard column
function breakDownScriptBlock(o){
  const parsed = o.mode === 'av'
    ? parseAV(o.text || '')
    : parseScreenplay(o.text || '');
  if(!parsed.length){
    toast(o.mode === 'av'
      ? 'No scenes found — AV blocks split on blank lines in the VIDEO column'
      : 'No scenes found — use headings like INT. KITCHEN \u2014 DAY');
    return;
  }
  const scenes = createScenesFromBreakdown(parsed);
  const board = activeScene();
  const x0 = o.x + o.w/2 + 340;
  let y = o.y - o.h/2 + 60;
  scenes.forEach((sc, i)=>{
    board.objects.push({id:uid(), cat:'sbrow', kind:'sbrow',
      x:x0, y:y + i*140, rot:0, w:560, h:120,
      title:(sc.scene ? 'Scene ' + sc.scene : sc.name) + (sc.sceneDesc ? ' \u2014 ' + sc.sceneDesc : ''),
      desc:'', imgId:null, sceneId:sc.id,
      color:COLORS[i % COLORS.length], label:'', path:[]});
  });
  markDirty(); render(); refreshSelBar();
  toast(scenes.length + ' scenes broken down \u2014 storyboard rows added to the right');
}
function pickSbImage(o){
  const fi = document.createElement('input');
  fi.type = 'file'; fi.accept = 'image/*';
  fi.addEventListener('change', async ()=>{
    if(!fi.files || !fi.files[0]) return;
    try{
      o.imgId = await storeImageFile(fi.files[0]);
      await loadStill(o.imgId);
      markDirty(); render(); refreshSelBar();
    }catch(e){ toast('Could not store that image \u2014 try a smaller one'); }
  });
  fi.click();
}
// file objects (docs / pdfs) on any board
function pickBoardFile(){
  const fi = document.createElement('input');
  fi.type = 'file';
  fi.addEventListener('change', async ()=>{
    const file = fi.files && fi.files[0];
    if(!file) return;
    if(file.size > 4.5*1024*1024){ toast('Files up to ~4 MB \u2014 this one is too large'); return; }
    try{
      const dataURL = await new Promise((ok, bad)=>{
        const r = new FileReader();
        r.onload = ()=>ok(r.result); r.onerror = ()=>bad(r.error);
        r.readAsDataURL(file);
      });
      const id = uid();
      await window.storage.set('sd:file:' + id, dataURL);
      const c = toWorld(wrap.clientWidth/2, wrap.clientHeight/2);
      activeScene().objects.push({id:uid(), cat:'file', kind:'file',
        x:c.x, y:c.y, rot:0, w:230, h:64,
        fileId:id, name:file.name, size:file.size, mime:file.type,
        color:'#5B6472', label:'', path:[]});
      markDirty(); render();
      toast('File added \u2014 select it to download');
    }catch(e){ toast('Could not store that file'); }
  });
  fi.click();
}

// ---------------------------------------------------------------- production panel (right side of the board)
function buildOrgPanel(){
  project.production = project.production || {company:'', lead:'', notes:'', contacts:[], locations:[]};
  const p = project.production;
  const host = document.getElementById('orgContent');
  host.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'org-grid';
  grid.style.gridTemplateColumns = '1fr'; // single column inside the panel
  grid.style.padding = '12px';
  host.appendChild(grid);

  const card = title=>{
    const c = document.createElement('div');
    c.className = 'org-card';
    c.innerHTML = '<h3>' + title + '</h3>';
    grid.appendChild(c);
    return c;
  };
  const field = (parent, label, get, set, textarea)=>{
    const l = document.createElement('label'); l.textContent = label; parent.appendChild(l);
    const i = document.createElement(textarea ? 'textarea' : 'input');
    if(textarea) i.rows = 3;
    i.value = get() || '';
    i.addEventListener('input', ()=>{ set(i.value); markDirty(); });
    parent.appendChild(i);
  };

  const c1 = card('Production info');
  field(c1, 'Company', ()=>p.company, v=>p.company=v);
  field(c1, 'Production lead', ()=>p.lead, v=>p.lead=v);
  field(c1, 'Notes (parking, power, catering…)', ()=>p.notes, v=>p.notes=v, true);

  const c2 = card('Crew & cast contacts');
  const contactsHost = document.createElement('div'); c2.appendChild(contactsHost);
  const renderContacts = ()=>{
    contactsHost.innerHTML = '';
    p.contacts.forEach((ct, i)=>{
      const row = document.createElement('div'); row.className = 'org-row';
      for(const [k, ph] of [['role','Role'],['name','Name'],['phone','Phone'],['email','Email']]){
        const inp = document.createElement('input');
        inp.placeholder = ph; inp.value = ct[k] || '';
        inp.addEventListener('input', ()=>{ ct[k] = inp.value; markDirty(); });
        row.appendChild(inp);
      }
      const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '×';
      rm.addEventListener('click', ()=>{ p.contacts.splice(i,1); markDirty(); renderContacts(); });
      row.appendChild(rm);
      contactsHost.appendChild(row);
    });
  };
  renderContacts();
  const addC = document.createElement('button');
  addC.className = 'btn org-add'; addC.textContent = '+ Add contact';
  addC.addEventListener('click', ()=>{ p.contacts.push({role:'',name:'',phone:'',email:''}); markDirty(); renderContacts(); });
  c2.appendChild(addC);

  const c3 = card('Locations');
  const locHost = document.createElement('div'); c3.appendChild(locHost);
  const renderLocs = ()=>{
    locHost.innerHTML = '';
    p.locations.forEach((lc, i)=>{
      const row = document.createElement('div'); row.className = 'org-row';
      for(const [k, ph] of [['name','Name'],['address','Address'],['parking','Parking'],['notes','Notes']]){
        const inp = document.createElement('input');
        inp.placeholder = ph; inp.value = lc[k] || '';
        inp.addEventListener('input', ()=>{ lc[k] = inp.value; markDirty(); });
        row.appendChild(inp);
      }
      const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '×';
      rm.addEventListener('click', ()=>{ p.locations.splice(i,1); markDirty(); renderLocs(); });
      row.appendChild(rm);
      locHost.appendChild(row);
    });
  };
  renderLocs();
  const addL = document.createElement('button');
  addL.className = 'btn org-add'; addL.textContent = '+ Add location';
  addL.addEventListener('click', ()=>{ p.locations.push({name:'',address:'',parking:'',notes:''}); markDirty(); renderLocs(); });
  c3.appendChild(addL);
}


// single-board PDF (moodboard / production board) — A4 landscape, image fitted
async function exportBoardPDF(){
  const board = activeScene();
  await ensureShotImages(board, false);
  const plan = renderShotPlan(board, 1800, null, false);
  const jpeg = atob(plan.toDataURL('image/jpeg', .82).split(',')[1]);
  const PW = 842, PH = 595, M = 28;
  const maxW = PW - M*2, maxH = PH - M*2 - 20;
  const k = Math.min(maxW/plan.width, maxH/plan.height);
  const iw = plan.width*k, ih = plan.height*k;
  const ix = (PW - iw)/2, iy = (PH - 20 - ih)/2;
  const title = ((project.shootName ? project.shootName + ' \u2014 ' : '') + board.name)
    .replace(/[()\\]/g, '');
  const content = 'q ' + iw.toFixed(2) + ' 0 0 ' + ih.toFixed(2) + ' ' + ix.toFixed(2) + ' ' + iy.toFixed(2) +
    ' cm /Im1 Do Q\nBT /F1 13 Tf ' + M + ' ' + (PH - M + 6) + ' Td (' + title + ') Tj ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] ' +
      '/Resources << /XObject << /Im1 5 0 R >> /Font << /F1 6 0 R >> >> /Contents 4 0 R >>',
    '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream',
    '<< /Type /XObject /Subtype /Image /Width ' + plan.width + ' /Height ' + plan.height +
      ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length +
      ' >>\nstream\n' + jpeg + '\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objs.forEach((o, i)=>{
    offsets.push(pdf.length);
    pdf += (i+1) + ' 0 obj\n' + o + '\nendobj\n';
  });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objs.length+1) + '\n0000000000 65535 f \n';
  for(let i=1;i<=objs.length;i++) pdf += String(offsets[i]).padStart(10,'0') + ' 00000 n \n';
  pdf += 'trailer\n<< /Size ' + (objs.length+1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  const bytes = new Uint8Array(pdf.length);
  for(let i=0;i<pdf.length;i++) bytes[i] = pdf.charCodeAt(i) & 0xFF;
  const a = document.createElement('a');
  a.download = (board.name.replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'_') || 'board') + '.pdf';
  a.href = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'}));
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
}

// ---------------------------------------------------------------- paste images onto boards
// Copy a still anywhere (ShotDeck, Frameset, a browser tab) and Cmd/Ctrl+V it in.
document.addEventListener('paste', async e=>{
  if(activeTab === 'script' || activeTab === 'story') return;
  const tag = document.activeElement && document.activeElement.tagName;
  if(tag === 'INPUT' || tag === 'TEXTAREA') return;
  const items = [...(e.clipboardData && e.clipboardData.items || [])]
    .filter(i=>i.type.startsWith('image/'));
  if(!items.length) return;
  e.preventDefault();
  const c = toWorld(wrap.clientWidth/2, wrap.clientHeight/2);
  let off = 0;
  for(const it of items){
    const file = it.getAsFile();
    if(!file) continue;
    try{
      await addBoardImage(file, c.x + off, c.y + off);
      off += 34;
    }catch(err){ toast('Could not store that image — try a smaller one'); }
  }
  if(off) toast('Pasted onto the board');
});


// ---------------------------------------------------------------- trash can (drop to delete)
const trashEl = document.createElement('div');
trashEl.id = 'trashCan';
trashEl.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg>';
document.body.appendChild(trashEl);
function overTrash(x, y){
  const r = trashEl.getBoundingClientRect();
  return x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12;
}
document.addEventListener('pointermove', e=>{
  const dragging = drag && drag.kind === 'move' && drag.o && !drag.o.locked;
  trashEl.classList.toggle('show', !!dragging);
  if(dragging) trashEl.classList.toggle('hot', overTrash(e.clientX, e.clientY));
});
document.addEventListener('pointerup', e=>{
  if(drag && drag.kind === 'move' && drag.o && !drag.o.locked && overTrash(e.clientX, e.clientY)){
    const o = drag.o;
    const sc = activeScene();
    sc.objects = sc.objects.filter(x=>x.id !== o.id);
    sc.objects.forEach(c=>{
      if(c.mount && c.mount.id === o.id) c.mount = null;
      if(c.rail && c.rail.id === o.id){ c.rail = null; c.path = []; }
    });
    sel = null; drag = null;
    trashEl.classList.remove('show', 'hot');
    markDirty(); if(histPushed) histSettle();
    refreshSelBar(); render();
    toast('Deleted \u2014 Cmd/Ctrl+Z to undo');
    e.stopPropagation();
  } else {
    trashEl.classList.remove('show', 'hot');
  }
}, {capture:true});

// ---------------------------------------------------------------- productions: save / switch / new
async function flushSave(){ dirty = true; await saveProject(); }
async function openProjectPop(){
  const pop = document.getElementById('projPop');
  if(pop.classList.contains('show')){ pop.classList.remove('show'); return; }
  const idx = (await loadProjectIndex()) || [];
  idx.sort((a,b)=>(b.updated||0)-(a.updated||0));
  pop.innerHTML = '<div class="xp-title">Productions</div>';
  idx.forEach(p=>{
    const row = document.createElement('button');
    row.className = 'proj-row' + (p.id === currentProjectId ? ' on' : '');
    row.textContent = p.name || 'Untitled production';
    row.addEventListener('click', async ()=>{
      if(p.id === currentProjectId){ pop.classList.remove('show'); return; }
      await flushSave();
      await window.storage.set('sd:current', p.id);
      location.reload();
    });
    pop.appendChild(row);
  });
  const nw = document.createElement('button');
  nw.className = 'btn primary';
  nw.style.cssText = 'width:100%;margin-top:8px;';
  nw.textContent = '+ New production';
  nw.addEventListener('click', async ()=>{
    await flushSave();
    const id = uid();
    const fresh = {v:4, scenes:[newShot(1)], activeSceneId:null, customProps:[], shootName:''};
    fresh.activeSceneId = fresh.scenes[0].id;
    await window.storage.set('sd:project:' + id, JSON.stringify(fresh));
    const idx2 = (await loadProjectIndex()) || [];
    idx2.push({id, name:'Untitled production', updated:Date.now()});
    await saveProjectIndex(idx2);
    await window.storage.set('sd:current', id);
    location.reload();
  });
  pop.appendChild(nw);
  if(idx.length > 1){
    const del = document.createElement('button');
    del.className = 'btn';
    del.style.cssText = 'width:100%;margin-top:6px;color:#C0392B;';
    del.textContent = 'Delete current production\u2026';
    del.addEventListener('click', async ()=>{
      if(!confirm('Delete "' + (project.shootName || 'Untitled production') + '" permanently? This cannot be undone.')) return;
      const idx2 = ((await loadProjectIndex()) || []).filter(p=>p.id !== currentProjectId);
      await saveProjectIndex(idx2);
      await window.storage.delete('sd:project:' + currentProjectId).catch(()=>{});
      await window.storage.set('sd:current', idx2[0].id);
      location.reload();
    });
    pop.appendChild(del);
  }
  pop.classList.add('show');
}
document.getElementById('projBtn').addEventListener('click', openProjectPop);
document.addEventListener('pointerdown', e=>{
  const pop = document.getElementById('projPop');
  if(pop.classList.contains('show') && !pop.contains(e.target) &&
     e.target.id !== 'projBtn' && !document.getElementById('projBtn').contains(e.target)){
    pop.classList.remove('show');
  }
});
function syncProjBtn(){
  const b = document.getElementById('projBtn');
  if(b && project) b.textContent = (project.shootName || 'Untitled production') + ' \u25be';
}
setInterval(syncProjBtn, 1500);
setTimeout(syncProjBtn, 400);
