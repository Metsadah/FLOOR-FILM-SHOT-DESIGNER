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
  } else if(t === 'design'){
    buildLibrary(); buildShotList(); buildInfo(); buildStills();
    refreshSelBar();
    ensureShotImages(activeScene(), false).then(render);
  } else if(t === 'script'){
    buildScriptTab();
  } else if(t === 'story'){
    buildStoryTab();
  } else if(t === 'org'){
    buildOrgTab();
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

// ---------------------------------------------------------------- script tab
function buildScriptTab(){
  const ta = document.getElementById('scriptText');
  const type = document.getElementById('scriptType');
  project.script = project.script || {text:'', type:'film'};
  ta.value = project.script.text || '';
  type.value = project.script.type || 'film';
}
document.getElementById('scriptText').addEventListener('input', function(){
  project.script = project.script || {type:'film'};
  project.script.text = this.value;
  markDirty();
});
document.getElementById('scriptType').addEventListener('change', function(){
  project.script = project.script || {text:''};
  project.script.type = this.value;
  markDirty();
});
document.getElementById('scriptImportBtn').addEventListener('click', ()=>
  document.getElementById('scriptFileInput').click());
document.getElementById('scriptFileInput').addEventListener('change', async function(){
  const f = this.files && this.files[0];
  if(!f) return;
  let text = await f.text();
  if(f.name.toLowerCase().endsWith('.fdx')){
    // Final Draft XML: pull the paragraph text out
    try{
      const doc = new DOMParser().parseFromString(text, 'text/xml');
      const paras = [...doc.querySelectorAll('Paragraph')];
      text = paras.map(p=>{
        const t = [...p.querySelectorAll('Text')].map(x=>x.textContent).join('');
        const kind = p.getAttribute('Type') || '';
        return (kind === 'Scene Heading') ? t.toUpperCase() : t;
      }).join('\n');
    }catch(e){ /* fall through with raw text */ }
  }
  document.getElementById('scriptText').value = text;
  project.script = {text, type: document.getElementById('scriptType').value};
  markDirty();
  toast('Script imported — hit "Break down script" when ready');
  this.value = '';
});

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
document.getElementById('breakdownBtn').addEventListener('click', ()=>{
  const text = (project.script && project.script.text || '').trim();
  const out = document.getElementById('breakdownResult');
  out.innerHTML = '';
  if(!text){ toast('Write or import a script first'); return; }
  const type = (project.script.type || 'film');
  const parsed = type === 'av' ? parseAV(text) : parseScreenplay(text);
  if(!parsed.length){
    out.innerHTML = '<div class="bd-scene">No scenes detected. Film scripts need scene headings like <b>INT. KITCHEN — DAY</b>; AV scripts split on blank lines.</div>';
    return;
  }
  parsed.forEach((s,i)=>{
    const el = document.createElement('div');
    el.className = 'bd-scene';
    el.innerHTML = '<b>' + (i+1) + '. ' + esc(s.heading) + '</b>' +
      '<div class="bd-meta">' +
      [s.dayNight, s.characters.length ? 'Cast: ' + s.characters.join(', ') : '',
       Math.max(1, Math.round(s.body.length/60)) + ' lines'].filter(Boolean).join(' · ') +
      '</div>';
    out.appendChild(el);
  });
  const act = document.createElement('div');
  act.style.cssText = 'margin-top:10px;display:flex;gap:8px;align-items:center;';
  const btn = document.createElement('button');
  btn.className = 'btn primary';
  btn.textContent = 'Create ' + parsed.length + ' scene' + (parsed.length>1?'s':'') + ' in FLOOR';
  btn.addEventListener('click', ()=>{
    createScenesFromBreakdown(parsed);
    out.innerHTML = '<div class="bd-scene">✓ ' + parsed.length + ' scenes created — check the Storyboard and Shot designer tabs.</div>';
  });
  act.appendChild(btn);
  const note = document.createElement('span');
  note.className = 'tp-hint';
  note.textContent = 'Detected cast gets placed as actor icons on each scene board.';
  act.appendChild(note);
  out.appendChild(act);
});
function createScenesFromBreakdown(parsed){
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
  });
  if(!project.activeSceneId && project.scenes.length) project.activeSceneId = project.scenes[0].id;
  markDirty();
  buildShotList(); buildInfo();
  toast(parsed.length + ' scenes created');
}

// ---------------------------------------------------------------- storyboard tab
function buildStoryTab(){
  const host = document.getElementById('storyTable');
  host.innerHTML = '';
  const tbl = document.createElement('table');
  tbl.innerHTML = '<thead><tr><th style="width:34px">#</th><th>Shot</th><th style="width:38%">Description</th><th>Camera</th><th style="width:92px">Reference</th><th style="width:70px"></th></tr></thead>';
  const tb = document.createElement('tbody');
  let shotNum = 0;
  for(const sc of project.scenes){
    sc.shots = sc.shots || [];
    const cams = sc.objects.filter(o=>o.cat==='camera');
    const sr = document.createElement('tr');
    sr.className = 'sceneRow';
    const heading = [sc.scene ? 'Scene ' + sc.scene : sc.name, sc.sceneDesc].filter(Boolean).join(' — ');
    sr.innerHTML = '<td colspan="5">' + esc(heading) + '</td>';
    const openTd = document.createElement('td');
    const openBtn = document.createElement('button');
    openBtn.className = 'btn';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', ()=>{
      switchScene(sc.id);
      switchTab('design');
    });
    openTd.appendChild(openBtn);
    sr.appendChild(openTd);
    tb.appendChild(sr);
    sc.shots.forEach(sh=>{
      shotNum++;
      const tr = document.createElement('tr');
      const td = s=>{ const d=document.createElement('td'); if(s!==undefined) d.textContent=s; tr.appendChild(d); return d; };
      td(String(shotNum));
      // shot name
      const nameTd = td();
      const ni = document.createElement('input');
      ni.value = sh.name || '';
      ni.addEventListener('input', ()=>{ sh.name = ni.value; markDirty(); });
      nameTd.appendChild(ni);
      // description
      const descTd = td();
      const di = document.createElement('textarea');
      di.rows = 1; di.value = sh.desc || '';
      di.addEventListener('input', ()=>{ sh.desc = di.value; markDirty(); });
      descTd.appendChild(di);
      // camera summary (from assigned cameras)
      const scams = cams.filter(c=>c.shotId===sh.id);
      td(scams.length
        ? scams.map(c=>[c.lens?c.lens+'mm':null, c.framing, c.support].filter(Boolean).join(' ') || (CAMS[c.kind]||{}).name).join(' | ')
        : '—');
      // reference image
      const refTd = td();
      buildRefCell(refTd, sh);
      // open scene
      const oTd = td();
      const ob = document.createElement('button');
      ob.className = 'btn'; ob.textContent = 'Open';
      ob.addEventListener('click', ()=>{ switchScene(sc.id); switchTab('design'); });
      oTd.appendChild(ob);
      tb.appendChild(tr);
    });
    // add-shot row
    const ar = document.createElement('tr');
    const atd = document.createElement('td');
    atd.colSpan = 6;
    const ab = document.createElement('button');
    ab.className = 'btn'; ab.style.fontSize = '11px';
    ab.textContent = '+ Add shot to ' + (sc.scene ? 'scene ' + sc.scene : sc.name);
    ab.addEventListener('click', ()=>{
      sc.shots.push({id:uid(), name:'Shot ' + (sc.shots.length+1), desc:''});
      markDirty(); buildStoryTab();
    });
    atd.appendChild(ab);
    ar.appendChild(atd);
    tb.appendChild(ar);
  }
  tbl.appendChild(tb);
  host.appendChild(tbl);
  if(!project.scenes.length){
    host.innerHTML = '<div class="bd-scene">No scenes yet — create them in the Shot designer, or break down a script in the Script tab.</div>';
  }
}
function buildRefCell(td, sh){
  td.innerHTML = '';
  if(sh.imgId){
    const img = document.createElement('img');
    img.className = 'sb-ref';
    img.title = 'Click to replace the reference image';
    loadStill(sh.imgId).then(im=>{ if(im) img.src = im.src; });
    img.addEventListener('click', ()=>pickRef(sh, td));
    td.appendChild(img);
    const rm = document.createElement('button');
    rm.className = 'rm'; rm.textContent = '×'; rm.title = 'Remove reference';
    rm.style.cssText = 'border:none;background:none;color:var(--ink2);cursor:pointer;';
    rm.addEventListener('click', ()=>{ sh.imgId = null; markDirty(); buildRefCell(td, sh); });
    td.appendChild(rm);
  } else {
    const b = document.createElement('button');
    b.className = 'sb-refBtn'; b.textContent = '+';
    b.title = 'Add a reference still / frame / drawing';
    b.addEventListener('click', ()=>pickRef(sh, td));
    td.appendChild(b);
  }
}
function pickRef(sh, td){
  const fi = document.createElement('input');
  fi.type = 'file'; fi.accept = 'image/*';
  fi.addEventListener('change', async ()=>{
    if(!fi.files || !fi.files[0]) return;
    try{
      sh.imgId = await storeImageFile(fi.files[0]);
      markDirty(); buildRefCell(td, sh);
    }catch(e){ toast('Could not store that image — try a smaller one'); }
  });
  fi.click();
}

// ---------------------------------------------------------------- production tab
function buildOrgTab(){
  project.production = project.production || {company:'', lead:'', notes:'', contacts:[], locations:[]};
  const p = project.production;
  const host = document.getElementById('orgContent');
  host.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'org-grid';
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
