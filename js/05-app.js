// FLOOR — 05-app.js
// Extracted from the original single-file build. All files share global scope
// (loaded as classic scripts, in order). True ES modules come with the build step later.
'use strict';
// ---------------------------------------------------------------- shots list
function buildShotList(){
  const list = document.getElementById('shotList');
  list.innerHTML = '';
  project.scenes.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'shot-item' + (s.id === project.activeSceneId ? ' active' : '');
    el.innerHTML = `<span class="num">${i+1}</span><span class="nm">${esc(s.name)}</span>
      <button class="mini" title="Duplicate shot">⧉</button><button class="mini" title="Delete shot">×</button>`;
    el.addEventListener('click', e => {
      if(e.target.classList.contains('mini')) return;
      switchShot(s.id);
    });
    el.querySelector('.nm').addEventListener('dblclick', e => {
      e.stopPropagation();
      const inp = document.createElement('input');
      inp.value = s.name;
      el.replaceChild(inp, el.querySelector('.nm'));
      inp.focus(); inp.select();
      const done = () => { s.name = inp.value.trim() || s.name; markDirty(); buildShotList(); syncTitle(); };
      inp.addEventListener('blur', done);
      inp.addEventListener('keydown', ev => { if(ev.key==='Enter') inp.blur(); ev.stopPropagation(); });
    });
    const [dupB, delB] = el.querySelectorAll('.mini');
    dupB.addEventListener('click', e => {
      e.stopPropagation();
      const n = JSON.parse(JSON.stringify(s));
      n.id = uid(); n.name = s.name + ' copy';
      n.walls.forEach(w=>{ w.id=uid(); (w.openings||[]).forEach(o=>o.id=uid()); });
      n.objects.forEach(o=>o.id=uid());
      project.scenes.splice(i+1, 0, n);
      markDirty(); buildShotList();
    });
    delB.addEventListener('click', async e => {
      e.stopPropagation();
      if(!confirm(`Delete "${s.name}"? This can't be undone.`)) return;
      project.scenes = project.scenes.filter(x=>x.id!==s.id);
      if(!project.scenes.length){ project.scenes.push(newShot(1)); }
      if(project.activeSceneId === s.id) project.activeSceneId = project.scenes[0].id;
      sel = null; closeNoteEditor(false); markDirty();
      buildShotList(); syncTitle(); render(); buildStills(); buildInfo(); refreshSelBar(); syncSunBtn();
    });
    list.appendChild(el);
  });
}
function switchShot(id){
  if(project.activeSceneId === id) return;
  togglePlay(false);
  closeNoteEditor(true);
  project.activeSceneId = id;
  sel = null; markDirty();
  buildShotList(); syncTitle(); refreshSelBar(); buildStills(); buildInfo(); syncSunBtn();
  ensureShotImages(activeShot(), false).then(render);
  zoomFit();
}
function addMinutes(hhmm, mins){
  if(!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const t = (h*60 + m + (mins||0)) % (24*60);
  return String(Math.floor(t/60)).padStart(2,'0') + ':' + String(t%60).padStart(2,'0');
}
document.getElementById('addShotEnt').addEventListener('click', ()=>addShotEntity());
document.getElementById('addShot').addEventListener('click', ()=>{
  const prev = activeShot();
  const s = newShot(project.scenes.length+1);
  // practical planning carries over; start where the previous shot wraps
  s.date = prev.date;
  s.time = addMinutes(prev.time, prev.duration) || prev.time;
  s.duration = prev.duration;
  s.weather = prev.weather;
  project.scenes.push(s);
  project.activeSceneId = s.id;
  sel = null; closeNoteEditor(false); markDirty();
  buildShotList(); syncTitle(); render(); buildStills(); buildInfo(); refreshSelBar(); syncSunBtn();
});
function syncTitle(){ document.getElementById('shotTitle').value = activeShot().name; }
document.getElementById('shotTitle').addEventListener('input', e => {
  activeShot().name = e.target.value;
  markDirty(); buildShotList();
});
document.getElementById('shotTitle').addEventListener('keydown', e => { if(e.key==='Enter') e.target.blur(); });

// ---------------------------------------------------------------- tabs
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', ()=>{
  document.querySelectorAll('#tabs button').forEach(x=>x.classList.toggle('on', x===b));
  document.querySelectorAll('.tabPage').forEach(p=>p.classList.toggle('on', p.dataset.page===b.dataset.tab));
}));

// ---------------------------------------------------------------- shot info form
function fmtDur(m){
  if(m < 60) return m + ' min';
  const h = Math.floor(m/60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
function initInfoForm(){
  const dur = document.getElementById('iDur');
  for(let m=10; m<=480; m+=10) dur.insertAdjacentHTML('beforeend', `<option value="${m}">${fmtDur(m)}</option>`);
  const wx = document.getElementById('iWeather');
  for(const w of WEATHERS) wx.insertAdjacentHTML('beforeend', `<option>${w}</option>`);

  document.getElementById('iShoot').addEventListener('input', e => { project.shootName = e.target.value; markDirty(); });
  const bind = (id, key) => document.getElementById(id).addEventListener('input', e => {
    activeShot()[key] = e.target.value; markDirty();
  });
  bind('iScene','scene'); bind('iDesc','sceneDesc'); bind('iScript','script');
  bind('iDate','date'); bind('iTime','time');
  document.getElementById('iDur').addEventListener('change', e => { activeShot().duration = +e.target.value; markDirty(); });
  document.getElementById('iWeather').addEventListener('change', e => { activeShot().weather = e.target.value; markDirty(); });
}
function camLetter(i){ return String.fromCharCode(65+i); }
function buildShotEnts(){
  const list = document.getElementById('shotEntList');
  if(!list) return;
  const sc = activeScene();
  sc.shots = sc.shots || [];
  list.innerHTML = '';
  const cams = sc.objects.filter(o=>o.cat==='camera');
  sc.shots.forEach((sh, idx)=>{
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--line);';
    const inp = document.createElement('input');
    inp.value = sh.name || '';
    inp.placeholder = 'Shot ' + (idx+1);
    inp.style.cssText = 'flex:1;min-width:0;border:1px solid transparent;background:transparent;font-size:12px;padding:3px 4px;border-radius:6px;';
    inp.addEventListener('focus', ()=>{ inp.style.borderColor='var(--line)'; inp.style.background='#fff'; });
    inp.addEventListener('blur', ()=>{ inp.style.borderColor='transparent'; inp.style.background='transparent'; });
    inp.addEventListener('input', ()=>{ sh.name = inp.value; markDirty(); });
    row.appendChild(inp);
    const scams = cams.filter(c=>c.shotId===sh.id);
    const badge = document.createElement('span');
    badge.style.cssText = 'font-size:10.5px;color:var(--ink2);white-space:nowrap;';
    badge.textContent = scams.length
      ? scams.map(c=>c.label || camLetter(cams.indexOf(c))).join(', ')
      : 'no camera';
    badge.title = 'Cameras assigned to this shot';
    row.appendChild(badge);
    const del = document.createElement('button');
    del.textContent = '\u00d7';
    del.title = 'Delete shot (cameras become unassigned)';
    del.style.cssText = 'border:none;background:none;color:var(--ink2);cursor:pointer;font-size:14px;padding:2px 5px;';
    del.addEventListener('click', ()=>{
      sc.shots = sc.shots.filter(x=>x.id!==sh.id);
      sc.objects.forEach(o=>{ if(o.shotId===sh.id) o.shotId=null; });
      markDirty(); buildShotEnts(); refreshSelBar();
    });
    row.appendChild(del);
    list.appendChild(row);
  });
  if(!sc.shots.length){
    list.innerHTML = '<div style="font-size:11px;color:var(--ink2);padding:4px 0">No shots yet — add one, or drop a camera on the board.</div>';
  }
}
function addShotEntity(name){
  const sc = activeScene();
  sc.shots = sc.shots || [];
  const sh = {id:uid(), name: name || ('Shot ' + (sc.shots.length+1)), desc:''};
  sc.shots.push(sh);
  markDirty(); buildShotEnts();
  return sh;
}
function buildInfo(){
  buildShotEnts();
  const s = activeShot();
  document.getElementById('iShoot').value = project.shootName || '';
  document.getElementById('iScene').value = s.scene || '';
  document.getElementById('iDesc').value = s.sceneDesc || '';
  document.getElementById('iScript').value = s.script || '';
  document.getElementById('iDate').value = s.date || '';
  document.getElementById('iTime').value = s.time || '';
  document.getElementById('iDur').value = s.duration || 60;
  document.getElementById('iWeather').value = WEATHERS.includes(s.weather) ? s.weather : 'Any';
}

// ---------------------------------------------------------------- stills & board images
const stillInput = document.getElementById('stillInput');
const stillDrop = document.getElementById('stillDrop');
stillDrop.addEventListener('click', ()=>stillInput.click());
stillDrop.addEventListener('dragover', e=>{ e.preventDefault(); stillDrop.classList.add('over'); });
stillDrop.addEventListener('dragleave', ()=>stillDrop.classList.remove('over'));
stillDrop.addEventListener('drop', e=>{
  e.preventDefault(); stillDrop.classList.remove('over');
  addStills(e.dataTransfer.files);
});
stillInput.addEventListener('change', ()=>{ addStills(stillInput.files); stillInput.value=''; });

document.getElementById('boardImgInput').addEventListener('change', async function(){
  const c = toWorld(wrap.clientWidth/2, wrap.clientHeight/2);
  let x=c.x, y=c.y;
  for(const f of [...this.files]){
    if(!f.type.startsWith('image/')) continue;
    await addBoardImage(f, x, y);
    x+=60; y+=60;
  }
  this.value='';
});

function downscale(file, maxDim, q){
  return new Promise((res, rej)=>{
    const img = new Image();
    img.onload = ()=>{
      const k = Math.min(1, maxDim/Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width*k));
      c.height = Math.max(1, Math.round(img.height*k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = ()=>{ URL.revokeObjectURL(img.src); rej(new Error("Couldn't read that image file")); };
    img.src = URL.createObjectURL(file);
  });
}
// stores with progressively stronger compression until the backend accepts it
async function storeImageFile(file){
  const tiers = [[1000,.72],[800,.6],[620,.5],[460,.4],[340,.35]];
  let lastErr = null;
  for(const [d,q] of tiers){
    let dataURL;
    try{ dataURL = await downscale(file, d, q); }
    catch(e){ throw e; }
    try{
      const id = uid();
      await window.storage.set('sd:img:'+id, dataURL);
      const img = new Image(); img.src = dataURL;
      await img.decode().catch(()=>{});
      imgCache[id] = img;
      return id;
    }catch(e){ lastErr = e; }
  }
  throw lastErr || new Error('storage rejected the image');
}
async function addStills(files){
  for(const f of [...files]){
    if(!f.type.startsWith('image/')) continue;
    try{
      const id = await storeImageFile(f);
      activeShot().stills.push(id);
      markDirty(); buildStills();
    }catch(e){
      console.error('still upload failed', e);
      toast("Couldn't store “" + f.name + "” — " + (e && e.message ? e.message : 'storage error'));
    }
  }
}
async function addBoardImage(file, x, y){
  try{
    const id = await storeImageFile(file);
    pinImageToBoard(id, x, y);
  }catch(e){
    console.error('board image failed', e);
    toast("Couldn't store “" + file.name + "” — " + (e && e.message ? e.message : 'storage error'));
  }
}
function pinImageToBoard(id, x, y){
  const im = imgCache[id];
  const ar = (im && im.naturalWidth) ? im.naturalHeight/im.naturalWidth : .66;
  const o = {id:uid(), cat:'image', kind:'image', imgId:id, x, y, rot:0, w:280, h:280*ar, color:'#5B6472', label:'', path:[]};
  activeShot().objects.push(o);
  sel = {type:'object', id:o.id};
  setTool('select');
  markDirty(); render(); refreshSelBar();
}
async function buildStills(){
  const grid = document.getElementById('stillsGrid');
  const shot = activeShot();
  grid.innerHTML = '';
  if(!shot.stills.length){
    grid.innerHTML = '<div class="empty-note" style="grid-column:1/-1">No recce or moodboard images yet.<br>Drop location photos, frames or references above.</div>';
    return;
  }
  for(const id of [...shot.stills]){
    const img = await loadStill(id);
    const el = document.createElement('div');
    el.className = 'still';
    if(img && img.src){
      const im = document.createElement('img'); im.src = img.src; el.appendChild(im);
      el.addEventListener('click', ()=>{
        const lb = document.getElementById('lightbox');
        lb.querySelector('img').src = img.src;
        lb.classList.add('show');
      });
    } else {
      el.innerHTML = '<div class="empty-note">missing</div>';
    }
    const toB = document.createElement('button');
    toB.className='toB'; toB.textContent='→ Board'; toB.title='Pin this image onto the canvas';
    toB.addEventListener('click', e=>{
      e.stopPropagation();
      const c = toWorld(wrap.clientWidth/2, wrap.clientHeight/2);
      pinImageToBoard(id, c.x, c.y);
    });
    el.appendChild(toB);
    const x = document.createElement('button');
    x.className='x'; x.textContent='×'; x.title='Remove image';
    x.addEventListener('click', e=>{
      e.stopPropagation();
      shot.stills = shot.stills.filter(s=>s!==id);
      markDirty(); buildStills();
    });
    el.appendChild(x);
    grid.appendChild(el);
  }
}
document.getElementById('lightbox').addEventListener('click', function(){ this.classList.remove('show'); });

// ---------------------------------------------------------------- exports
function renderShotPlan(shot, maxDim, boundsOpt, withGrid){
  const b = boundsOpt || contentBounds(shot);
  const pad = boundsOpt ? 0 : 80;
  const bx = b ? b.minX-pad : -400, by = b ? b.minY-pad : -300;
  const bw = b ? (b.maxX-b.minX)+pad*2 : 800, bh = b ? (b.maxY-b.minY)+pad*2 : 600;
  const k = Math.min(2, maxDim/Math.max(bw,bh));
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(bw*k));
  c.height = Math.max(2, Math.round(bh*k));
  const xc = c.getContext('2d');
  xc.fillStyle = '#fff'; xc.fillRect(0,0,c.width,c.height);
  xc.scale(k, k); xc.translate(-bx, -by);

  const mainCtx = ctx, savedView = {...view}, savedSel = sel, savedDrawShot = drawShot;
  ctx = xc; view.scale = k; sel = null; drawShot = shot;
  try{
    if(withGrid){
      xc.fillStyle = 'rgba(60,58,52,.16)';
      const g = 50, r0 = Math.max(1.1, 1.5/k);
      for(let gx = Math.ceil(bx/g)*g; gx < bx+bw; gx += g)
        for(let gy = Math.ceil(by/g)*g; gy < by+bh; gy += g)
          xc.fillRect(gx-r0, gy-r0, r0*2, r0*2);
    }
    for(const o of shot.objects) if(o.cat==='image' && o.underlay) drawObject(o);
    drawWalls(shot);
    for(const o of shot.objects) if(o.path && o.path.length && o.kind!=='track') drawPath(o);
    for(const o of shot.objects) if(!(o.cat==='image' && o.underlay)) drawObject(o);
    drawSun(shot);
  } finally {
    ctx = mainCtx; Object.assign(view, savedView); sel = savedSel; drawShot = savedDrawShot;
  }
  return c;
}
async function doPNGExport(cropBounds){
  const shot = activeShot();
  await ensureShotImages(shot, false);
  const plan = renderShotPlan(shot, 2400, cropBounds || null, project.exportPrefs.grid);
  const hStrip = 52;
  // header meta: scene · date · time window (duration) · weather — only what's filled in
  const wrapT = addMinutes(shot.time, shot.duration);
  const metaBits = [
    shot.scene ? 'Scene ' + shot.scene : '',
    shot.sceneDesc || '',
    shot.date || '',
    shot.time ? (shot.time + (wrapT ? '–' + wrapT : '')) : '',
    shot.duration ? fmtDur(shot.duration) : '',
    (shot.weather && shot.weather !== 'Any') ? shot.weather : '',
  ].filter(Boolean);
  const meta = metaBits.join('  ·  ') ||
    new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  // script footer (wrapped, capped)
  const scratch = document.createElement('canvas').getContext('2d');
  scratch.font = '13px -apple-system,Segoe UI,sans-serif';
  let scriptLines = [];
  const script = (shot.script || '').trim();
  if(script){
    scriptLines = wrapCanvasText(scratch, script, Math.max(200, plan.width - 40));
    if(scriptLines.length > 22){
      scriptLines = scriptLines.slice(0, 22);
      scriptLines.push('…');
    }
  }
  const footerH = script ? (34 + scriptLines.length*18 + 16) : 0;
  const out = document.createElement('canvas');
  out.width = plan.width; out.height = plan.height + hStrip + footerH;
  const oc = out.getContext('2d');
  oc.fillStyle='#fff'; oc.fillRect(0,0,out.width,out.height);
  oc.fillStyle = '#33322E';
  oc.font = '600 19px -apple-system,Segoe UI,sans-serif';
  oc.fillText((project.shootName ? project.shootName + ' — ' : '') + shot.name, 18, 26);
  oc.fillStyle = '#8A877F';
  oc.font = '12px -apple-system,Segoe UI,sans-serif';
  oc.fillText(meta, 18, 43);
  oc.drawImage(plan, 0, hStrip);
  if(script){
    const fy = hStrip + plan.height;
    oc.strokeStyle = '#E5E3DE';
    oc.beginPath(); oc.moveTo(18, fy + 6); oc.lineTo(out.width - 18, fy + 6); oc.stroke();
    oc.fillStyle = '#8A877F';
    oc.font = '700 10px -apple-system,Segoe UI,sans-serif';
    oc.fillText('S C R I P T', 18, fy + 24);
    oc.fillStyle = '#33322E';
    oc.font = '13px -apple-system,Segoe UI,sans-serif';
    scriptLines.forEach((l, i)=> oc.fillText(l, 18, fy + 44 + i*18));
  }
  const a = document.createElement('a');
  a.download = (shot.name.replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'_') || 'shot') + '.png';
  a.href = out.toDataURL('image/png');
  a.click();
}

// ---------------------------------------------------------------- export options popover
function hideExportPop(){
  const p = document.getElementById('exportPop');
  if(p) p.classList.remove('show');
}
function showExportPop(kind){
  const p = document.getElementById('exportPop');
  const prefs = project.exportPrefs;
  p.innerHTML = '';
  const mk = html => { p.insertAdjacentHTML('beforeend', html); };
  const chk = (id, label, val) => mk(
    `<label class="xp-row"><input type="checkbox" id="${id}" ${val?'checked':''}> ${label}</label>`);
  const boardMode = BOARD_TABS.has(activeTab);
  mk(`<div class="xp-title">${kind==='png'
    ? (boardMode ? 'Export board as PNG' : 'Export scene as PNG')
    : (boardMode ? 'Export board as PDF' : 'Export shot list PDF')}</div>`);
  chk('xpGrid', 'Include grid dots', prefs.grid);
  if(kind === 'pdf') chk('xpStills', 'Include recce & mood images', prefs.stills);
  mk('<div class="xp-btns"></div>');
  const btns = p.querySelector('.xp-btns');
  const btn = (label, primary, fn) => {
    const b = document.createElement('button');
    b.className = 'btn' + (primary ? ' primary' : '');
    b.textContent = label;
    b.addEventListener('click', fn);
    btns.appendChild(b);
  };
  const readPrefs = ()=>{
    prefs.grid = p.querySelector('#xpGrid').checked;
    const st = p.querySelector('#xpStills');
    if(st) prefs.stills = st.checked;
    markDirty();
  };
  if(kind === 'png'){
    btn('Export full', true, ()=>{ readPrefs(); hideExportPop(); doPNGExport(null); });
    btn('Crop area…', false, ()=>{
      readPrefs(); hideExportPop();
      setTool('crop');
      toast('Drag a rectangle around the area to export');
    });
  } else {
    btn('Export PDF', true, ()=>{
      readPrefs(); hideExportPop();
      if(boardMode) exportBoardPDF();
      else runPDFExport();
    });
  }
  p.classList.toggle('show');
}
document.getElementById('exportBtn').addEventListener('click', ()=>showExportPop('png'));

// ---- PDF shot list ----
function pdfEsc(s){
  return String(s).replace(/[\\()]/g, m=>'\\'+m).replace(/[^\x20-\xFF]/g,'?');
}
function pdfWrap(s, n){
  const out=[];
  for(const para of String(s).split('\n')){
    let line='';
    for(const w of para.split(/\s+/)){
      if(!w) continue;
      const t = line ? line+' '+w : w;
      if(t.length > n && line){ out.push(line); line = w; }
      else line = t;
    }
    out.push(line);
  }
  return out;
}
function makePDF(pages){
  const objs = [];
  const add = b => { objs.push(b); return objs.length; };
  add(null); add(null);
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const kids = [];
  const W = 842, H = 595;

  pages.forEach((p, pi) => {
    const xobjs = {};
    const addImg = (im, nm) => {
      const n = add({stream: im.data, dict:
        `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>`});
      xobjs[nm] = n;
    };
    if(p.plan) addImg(p.plan, 'P');
    p.stills.forEach((s,i)=>addImg(s, 'S'+i));

    let c = '';
    c += `BT /F2 16 Tf 36 ${H-40} Td 0.20 0.20 0.18 rg (${pdfEsc(p.title)}) Tj ET\n`;
    c += `BT /F1 9 Tf 36 ${H-55} Td 0.55 0.53 0.50 rg (Shot ${pi+1} of ${pages.length}) Tj ET\n`;
    if(p.plan){
      const bx=36, by=150, bw=556, boxTop=H-70, BH=boxTop-by;
      const k = Math.min(bw/p.plan.w, BH/p.plan.h);
      const iw = p.plan.w*k, ih = p.plan.h*k;
      const ix = bx + (bw-iw)/2, iy = by + (BH-ih)/2;
      c += `q ${iw.toFixed(2)} 0 0 ${ih.toFixed(2)} ${ix.toFixed(2)} ${iy.toFixed(2)} cm /P Do Q\n`;
    }
    // info column
    const nx = 614;
    let ny = H-70;
    const line = (t, bold, dim) => {
      if(ny < 148) return;
      c += `BT /F${bold?2:1} ${bold?8.5:8} Tf ${nx} ${ny} Td ${dim ? '0.55 0.53 0.50' : (bold ? '0.30 0.29 0.27' : '0.25 0.24 0.22')} rg (${pdfEsc(t)}) Tj ET\n`;
      ny -= bold ? 12 : 10.5;
    };
    line('SCENE ' + (p.info.scene || '-'), true);
    pdfWrap(p.info.sceneDesc || '', 46).forEach(l=>line(l));
    ny -= 5;
    line('PLANNING', true);
    const wrapTime = addMinutes(p.info.time, p.info.duration);
    line('Date: ' + (p.info.date || '-'), false);
    line('Time: ' + (p.info.time ? p.info.time + (wrapTime ? ' - ' + wrapTime : '') : '-') + '   (' + fmtDur(p.info.duration||60) + ')', false);
    line('Weather: ' + (p.info.weather || 'Any'), false);
    ny -= 5;
    const cams = (p.info.objects||[]).filter(o=>o.cat==='camera');
    const shotEnts = p.info.shots || [];
    if(cams.length || shotEnts.length){
      line('SHOTS', true);
      const bitsFor = cm => [
        (CAMS[cm.kind]||{}).name,
        cm.lens ? cm.lens+'mm' : Math.round(cm.fov||50)+' deg',
        cm.framing, cm.support, cm.desc,
      ].filter(Boolean).join(' - ');
      shotEnts.forEach(sh=>{
        const scams = cams.filter(c=>c.shotId===sh.id);
        const txt = (sh.name||'Shot') + ': ' +
          (scams.length ? scams.map(bitsFor).join('  |  ') : '(no camera)');
        pdfWrap(txt, 46).forEach(l=>line(l));
      });
      const un = cams.filter(c=>!c.shotId || !shotEnts.some(x=>x.id===c.shotId));
      un.forEach((cm,ci)=>{
        pdfWrap((cm.label||'Cam '+String.fromCharCode(65+ci)) + ' (unassigned): ' + bitsFor(cm), 46)
          .forEach(l=>line(l));
      });
      ny -= 5;
    }
    if(p.info.script){
      line('SCRIPT', true);
      pdfWrap(p.info.script, 48).forEach(l=>line(l));
    }
    // stills strip
    let sx = 36; const sh = 96, sy = 36;
    p.stills.forEach((s,i)=>{
      let sw = sh * (s.w/s.h);
      if(sw > 150) sw = 150;
      const shh = sw * (s.h/s.w);
      c += `q ${sw.toFixed(2)} 0 0 ${shh.toFixed(2)} ${sx.toFixed(2)} ${sy} cm /S${i} Do Q\n`;
      sx += sw + 10;
    });
    const cn = add({stream:c, dict:`<< /Length ${c.length} >>`});
    const xo = Object.entries(xobjs).map(([k2,v])=>`/${k2} ${v} 0 R`).join(' ');
    const pn = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> /XObject << ${xo} >> >> /Contents ${cn} 0 R >>`);
    kids.push(pn);
  });

  objs[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[1] = `<< /Type /Pages /Kids [${kids.map(k=>k+' 0 R').join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offs = [];
  objs.forEach((o,i)=>{
    offs.push(out.length);
    out += `${i+1} 0 obj\n`;
    if(typeof o === 'string') out += o + '\nendobj\n';
    else out += o.dict + '\nstream\n' + o.stream + '\nendstream\nendobj\n';
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;
  offs.forEach(o=>{ out += String(o).padStart(10,'0') + ' 00000 n \n'; });
  out += `trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  const bytes = new Uint8Array(out.length);
  for(let i=0;i<out.length;i++) bytes[i] = out.charCodeAt(i) & 0xFF;
  return bytes;
}
document.getElementById('pdfBtn').addEventListener('click', ()=>showExportPop('pdf'));
async function runPDFExport(){
  const btnEl = document.getElementById('pdfBtn');
  btnEl.disabled = true;
  const old = btnEl.textContent;
  btnEl.textContent = 'Building…';
  try{
    const prefs = project.exportPrefs;
    const pages = [];
    for(const shot of project.scenes){
      await ensureShotImages(shot, true);
      const planC = renderShotPlan(shot, 1500, null, prefs.grid);
      const planData = atob(planC.toDataURL('image/jpeg', .8).split(',')[1]);
      const stills = [];
      if(prefs.stills) for(const id of shot.stills.slice(0,4)){
        const im = await loadStill(id);
        if(im && im.naturalWidth && im.src.startsWith('data:image/jpeg'))
          stills.push({data: atob(im.src.split(',')[1]), w:im.naturalWidth, h:im.naturalHeight});
      }
      pages.push({
        title: (project.shootName ? project.shootName + '  -  ' : '') + shot.name,
        info: shot,
        plan: {data:planData, w:planC.width, h:planC.height},
        stills,
      });
    }
    const bytes = makePDF(pages);
    const blob = new Blob([bytes], {type:'application/pdf'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (project.shootName ? project.shootName.replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'_') + '-' : '') + 'shot-list.pdf';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
  }catch(e){
    console.error('pdf export failed', e);
    toast('PDF export failed — see console for details');
  }
  btnEl.textContent = old;
  btnEl.disabled = false;
}

// ---------------------------------------------------------------- PWA install
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./service-worker.js').catch(err=>{
      console.warn('[FLOOR] service worker registration failed', err);
    });
  });
}
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e=>{
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('installBtn');
  if(btn) btn.style.display = 'inline-flex';
});
window.addEventListener('appinstalled', ()=>{
  const btn = document.getElementById('installBtn');
  if(btn) btn.style.display = 'none';
  deferredInstallPrompt = null;
});
document.getElementById('installBtn')?.addEventListener('click', async ()=>{
  if(!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('installBtn').style.display = 'none';
});

// ---------------------------------------------------------------- mobile drawers
document.getElementById('libToggle').addEventListener('click', ()=>{
  const sb = document.getElementById('sidebar');
  const rp = document.getElementById('rightPanel');
  rp.classList.remove('open');
  sb.classList.toggle('open');
});
document.getElementById('panelToggle').addEventListener('click', ()=>{
  const sb = document.getElementById('sidebar');
  const rp = document.getElementById('rightPanel');
  sb.classList.remove('open');
  rp.classList.toggle('open');
});

// ---------------------------------------------------------------- help
function toggleHelp(show){
  document.getElementById('helpOverlay').classList.toggle('show', show);
}
document.getElementById('helpBtn').addEventListener('click', ()=>toggleHelp(true));
document.getElementById('helpClose').addEventListener('click', ()=>toggleHelp(false));
document.getElementById('helpOverlay').addEventListener('click', function(e){
  if(e.target === this) toggleHelp(false);
});
document.addEventListener('keydown', e => { if(e.key === 'Escape') toggleHelp(false); });

// ---------------------------------------------------------------- boot
(async function boot(){
  await loadProject();
  document.getElementById('loading').remove();
  initInfoForm();
  buildShotList();
  buildLibrary();
  syncTitle();
  buildStills();
  buildInfo();
  syncSunBtn();
  setTool('select');
  resize();
  await ensureShotImages(activeShot(), false);
  zoomFit();
  updateZoomPct();
  histSettle(); // baseline for undo
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden) saveProject(); });
  window.addEventListener('beforeunload', ()=>{ if(dirty){ try{ saveProject(); }catch(_){} } });
})();
