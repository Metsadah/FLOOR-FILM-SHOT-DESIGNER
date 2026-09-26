// FLOOR — 17-ui2.js · UI 2.0
// - applyFloor(): <html data-floor> drives the accent colour per floor; the
//   canvas re-reads THEME so selection handles and chips follow the hue.
// - libDecorate(): search field + category chips on top of the library.
// - Camera inspector: on the Shot designer (desktop, right panel visible)
//   a selected camera is edited in a card in the right panel instead of a
//   long row of selects in the floating selection bar.
'use strict';

// ---------------------------------------------------------------- floor colour
function applyFloor(t){
  const root = document.documentElement;
  if(root.getAttribute('data-floor') === t) return;
  root.setAttribute('data-floor', t);
  if(typeof loadTheme === 'function') loadTheme();
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.content = THEME.dark ? '#1F1F22' : '#F7F7F8';
  fitFloors();
}
// the floor switcher shows every name while the top bar has room; otherwise
// only the active floor keeps its name and the others become coloured dots
function fitFloors(){
  const tb = document.getElementById('topbar'), pb = document.getElementById('projBtn');
  if(!tb) return;
  tb.classList.remove('floors-compact');
  if(window.innerWidth <= 600) return;
  const tight = tb.scrollWidth > tb.clientWidth + 1 || (pb && pb.scrollWidth > pb.clientWidth + 1 && pb.clientWidth < 220);
  if(tight) tb.classList.add('floors-compact');
}
// the board draws its text in Geist too — repaint once the faces are in
if(document.fonts && document.fonts.load){
  Promise.all(['400 13px Geist', '600 13px Geist', '700 13px Geist', '800 13px Geist'].map(f=>document.fonts.load(f).catch(()=>null)))
    .then(()=>{ if(typeof render === 'function') render(); });
}
(function(){
  let t = 0;
  const later = ()=>{ clearTimeout(t); t = setTimeout(fitFloors, 60); };
  window.addEventListener('resize', later);
  const pb = document.getElementById('projBtn');
  if(pb && window.MutationObserver) new MutationObserver(later).observe(pb, {childList:true, characterData:true, subtree:true});
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(fitFloors);
  setTimeout(fitFloors, 0);
})();

// ---------------------------------------------------------------- library search + chips
let libQ = '', libCat = '', libCatTab = '';
const LIB_SEARCH_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';
function libSections(lib){
  // a section = a header (.cat-head / .side-head) plus everything up to the next header
  const out = [];
  let cur = null;
  for(const el of [...lib.children]){
    if(el.classList.contains('lib-top')) continue;
    if(el.classList.contains('cat-head') || el.classList.contains('side-head')){
      // the header's own words — not the arrow, not the buttons inside it
      let name = [...el.childNodes].filter(n=>n.nodeType === 3).map(n=>n.textContent).join(' ');
      if(!name.trim()) name = el.textContent;
      name = name.replace(/[▼▶]/g, '').replace(/\s+/g, ' ').trim();
      cur = {head:el, name, els:[]};
      out.push(cur);
    } else if(cur) cur.els.push(el);
  }
  return out;
}
function libDecorate(){
  const lib = document.getElementById('library');
  if(!lib || !lib.children.length) return;
  if(libCatTab !== activeTab){ libCat = ''; libCatTab = activeTab; }
  const secs = libSections(lib);
  const top = document.createElement('div');
  top.className = 'lib-top';
  top.innerHTML = '<div class="lib-title"><b>Library</b></div>' +
    '<label class="lib-search">' + LIB_SEARCH_SVG +
    '<input type="search" placeholder="' + (activeTab === 'design' ? 'Search — sofa, dolly, HMI…' : 'Search the library…') +
    '" aria-label="Search the library" spellcheck="false"></label>' +
    '<div class="lib-chips" role="tablist"></div>';
  lib.prepend(top);
  const inp = top.querySelector('input');
  inp.value = libQ;
  const chips = top.querySelector('.lib-chips');
  const names = ['All'].concat(secs.filter(s=>s.els.length).map(s=>s.name));
  if(libCat && !names.includes(libCat)) libCat = '';
  for(const n of names){
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'lib-chip' + ((n === 'All' ? !libCat : libCat === n) ? ' on' : '');
    c.textContent = n;
    c.addEventListener('click', ()=>{
      libCat = n === 'All' ? '' : n;
      chips.querySelectorAll('.lib-chip').forEach(x=>x.classList.toggle('on', x === c));
      libApplyFilter(lib, secs);
      lib.scrollTop = 0;
    });
    chips.appendChild(c);
  }
  inp.addEventListener('input', ()=>{ libQ = inp.value; libApplyFilter(lib, secs); });
  inp.addEventListener('keydown', e=>{
    e.stopPropagation(); // single-key tool shortcuts must not fire while typing
    if(e.key === 'Escape'){ inp.value = ''; libQ = ''; libApplyFilter(lib, secs); inp.blur(); }
  });
  libApplyFilter(lib, secs);
}
function libApplyFilter(lib, secs){
  const q = libQ.trim().toLowerCase();
  lib.classList.toggle('filtering', !!q || !!libCat);
  let any = false;
  for(const s of secs){
    let show = !libCat || s.name === libCat;
    let hits = 0;
    for(const el of s.els){
      const items = el.querySelectorAll ? el.querySelectorAll('.lib-item') : [];
      if(items.length){
        let vis = 0;
        items.forEach(it=>{
          const t = (it.textContent || '').toLowerCase();
          const ok = !q || t.includes(q) || s.name.toLowerCase().includes(q);
          it.classList.toggle('lib-miss', !ok);
          if(ok) vis++;
        });
        hits += vis;
        el.classList.toggle('lib-miss', show && !vis);
      } else {
        // non-tile content (document lists, notes): only matches on its header or text
        const ok = !q || (el.textContent || '').toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
        el.classList.toggle('lib-miss', !ok);
        if(ok) hits++;
      }
    }
    if(!s.els.length) hits = (!q || s.name.toLowerCase().includes(q)) ? 1 : 0;
    show = show && hits > 0;
    s.head.classList.toggle('lib-off', !show);
    s.els.forEach(el=>el.classList.toggle('lib-off', !show));
    if(show) any = true;
  }
  let empty = lib.querySelector('.lib-empty');
  if(!any){
    if(!empty){ empty = document.createElement('div'); empty.className = 'lib-empty'; lib.appendChild(empty); }
    empty.textContent = 'Nothing called “' + libQ.trim() + '” here — try another word, or add a custom prop.';
  } else if(empty) empty.remove();
}

// ---------------------------------------------------------------- camera inspector
const CI_CAM_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="7.5" width="13" height="10" rx="2"/><path d="M15.5 11l6-3v8.5l-6-3"/><circle cx="9" cy="12.5" r="2.6"/></svg>';
function camInspOn(){
  if(activeTab !== 'design' || window.innerWidth <= 900) return false;
  const b = document.body.classList;
  if(b.contains('hideR') || b.contains('view-only') || b.contains('read-only')) return false;
  const rp = document.getElementById('rightPanel');
  return !!rp && getComputedStyle(rp).display !== 'none';
}
function hideCamInsp(){
  const el = document.getElementById('camInsp');
  if(!el || el.hidden) return;
  el.hidden = true; el.innerHTML = '';
  document.getElementById('rightPanel').classList.remove('insp');
}
function ciFovSvg(fov){
  const a = Math.max(4, Math.min(170, fov || 50)) * Math.PI / 180;
  const cx = 48, cy = 56, r = 50;
  const x1 = cx - r * Math.sin(a/2), y1 = cy - r * Math.cos(a/2);
  const x2 = cx + r * Math.sin(a/2);
  return '<svg class="ci-arc" viewBox="0 0 96 62" aria-hidden="true">' +
    '<path d="M' + cx + ' ' + cy + ' L' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + x2.toFixed(1) + ' ' + y1.toFixed(1) + ' Z"/>' +
    '<rect x="41" y="52" width="14" height="9" rx="2.5"/></svg>';
}
function buildCamInsp(o, shot){
  const host = document.getElementById('camInsp');
  if(!host) return;
  document.getElementById('rightPanel').classList.add('insp');
  host.hidden = false;
  host.innerHTML = '';
  const redo = ()=>{ markDirty(); render(); refreshSelBar(); };
  const sensor = o.sensor || project.defaultSensor || 'ff';
  const sq = +o.squeeze || 1;
  const set = lensSet();
  const refov = ()=>{ if(o.lens) o.fov = fovForLens(o.lens, o.sensor || project.defaultSensor || 'ff', +o.squeeze || 1); };
  const sh = (shot.shots || []).find(x=>x.id === o.shotId);
  const el = (tag, cls, html)=>{ const e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; };
  const sec = (label, extra)=>{
    const s = el('div', 'ci-sec');
    const l = el('div', 'ci-lab', '<span>' + esc(label) + '</span>');
    if(extra) l.appendChild(extra);
    s.appendChild(l);
    host.appendChild(s);
    return s;
  };
  const selectField = (options, value, onChange, title)=>{
    const w = el('div', 'ci-field');
    const s = document.createElement('select');
    if(title) s.title = title;
    for(const [v, n] of options) s.insertAdjacentHTML('beforeend', '<option value="' + esc(String(v)) + '">' + esc(n) + '</option>');
    s.value = value;
    s.addEventListener('change', ()=>onChange(s.value, s));
    w.appendChild(s);
    return w;
  };

  // header: icon · editable name · what it films
  const head = el('div', 'ci-head');
  head.appendChild(el('span', 'ci-icon', CI_CAM_SVG));
  const tt = el('div', 'ci-title');
  const nm = document.createElement('input');
  nm.className = 'ci-name'; nm.placeholder = 'Camera'; nm.value = o.label || ''; nm.spellcheck = false;
  nm.title = 'Camera label';
  nm.addEventListener('input', ()=>{ o.label = nm.value; markDirty(); render(); });
  nm.addEventListener('keydown', e=>{ if(e.key === 'Enter') nm.blur(); e.stopPropagation(); });
  tt.appendChild(nm);
  const sub = [sh ? (sh.name || 'Shot') : 'No shot yet', o.support || (CAM_TYPES.find(t=>t[0] === o.kind) || [0, 'Camera'])[1]].filter(Boolean).join(' · ');
  tt.appendChild(el('span', 'ci-sub', esc(sub)));
  head.appendChild(tt);
  host.appendChild(head);

  sec('Camera').appendChild(selectField(CAM_TYPES, CAMS[o.kind] ? o.kind : 'cam_std', v=>{
    o.kind = v; o.w = CAMS[v].w; o.h = CAMS[v].h; redo();
  }, 'Camera type'));
  sec('Body / format').appendChild(selectField(SENSORS.map(s=>[s[0], s[1]]), sensor, v=>{
    o.sensor = v; project.defaultSensor = v; refov(); redo();
  }, 'Sensor / film format — the same focal length gives a different field of view per format'));
  sec('Lens set').appendChild(selectField(LENS_SETS.map(s=>[s.key, s.name]), set.key, v=>{
    project.production = project.production || {};
    project.production.lensSet = v;
    const ns = lensSet();
    o.squeeze = ns.squeeze;
    refov(); redo();
    toast('Lens set: ' + ns.name + ' — new cameras follow it');
  }, 'Lens set of this production — every camera\'s focal lengths follow it'));

  // focal length chips (+ Other…)
  const other = el('button', 'ci-link', 'Other…');
  other.type = 'button';
  other.addEventListener('click', ()=>{
    const v = parseFloat(prompt('Focal length in mm (e.g. 24, 65, 100 — a macro or probe lens too)', o.lens || ''));
    if(!(v > 0)) return;
    o.lens = Math.round(v * 10) / 10; refov(); redo();
  });
  const fs = sec('Focal length', other);
  const row = el('div', 'ci-focals');
  const focals = set.focals.slice();
  if(o.lens && !focals.includes(o.lens)) focals.push(o.lens);
  focals.sort((a, b)=>a - b);
  for(const f of focals){
    const c = el('button', 'ci-focal' + (o.lens === f ? ' on' : ''), String(f));
    c.type = 'button';
    c.title = f + ' mm · ' + Math.round(fovForLens(f, sensor, sq)) + '° horizontal';
    c.addEventListener('click', ()=>{ o.lens = o.lens === f ? null : f; refov(); redo(); });
    row.appendChild(c);
  }
  fs.appendChild(row);

  // squeeze: segmented
  const ss = sec('Squeeze');
  const seg = el('div', 'ci-seg');
  const sqOpts = [[1, 'Spherical'], [1.33, '1.33×'], [1.5, '1.5×'], [1.8, '1.8×'], [2, '2×']];
  if(!sqOpts.some(([v])=>v === sq)) sqOpts.push([sq, sq + '×']);
  for(const [v, n] of sqOpts){
    const b = el('button', v === sq ? 'on' : '', esc(n));
    b.type = 'button';
    b.addEventListener('click', ()=>{ o.squeeze = v; refov(); redo(); });
    seg.appendChild(b);
  }
  ss.appendChild(seg);

  // field of view readout
  const fov = o.fov || 50;
  const senName = (SENSORS.find(s=>s[0] === sensor) || SENSORS[0])[1].replace(/ ·.*$/, '');
  const fv = el('div', 'ci-fov', ciFovSvg(fov) +
    '<div><b>' + (Math.round(fov * 10) / 10) + '°</b><span>horizontal · ' +
    (o.lens ? esc(lensLabel(o)) + ' on ' + esc(senName) : 'drag the cone, or pick a lens') + '</span></div>');
  host.appendChild(fv);

  // framing chips
  const fr = sec('Framing');
  const fc = el('div', 'ci-chips');
  for(const f of FRAMINGS.filter(Boolean)){
    const c = el('button', 'ci-chip' + (o.framing === f ? ' on' : ''), esc(f));
    c.type = 'button';
    c.addEventListener('click', ()=>{ o.framing = o.framing === f ? '' : f; redo(); });
    fc.appendChild(c);
  }
  fr.appendChild(fc);

  // shot + support
  const shotOpts = [['', '— not linked to a shot']].concat((shot.shots || []).map(x=>[x.id, x.name || 'Shot']), [['__new', '+ New shot…']]);
  sec('Films shot').appendChild(selectField(shotOpts, (shot.shots || []).some(x=>x.id === o.shotId) ? o.shotId : '', v=>{
    if(v === '__new'){ const n = addShotEntity(o.label ? o.label : undefined); o.shotId = n.id; }
    else o.shotId = v || null;
    markDirty(); buildShotEnts(); refreshSelBar();
  }, 'Which shot this camera films'));
  sec('Support').appendChild(selectField(SUPPORTS.map(s=>[s, s || '—']), o.support || '', v=>{ o.support = v; redo(); }, 'Camera support'));

  const ds = sec('Shot description');
  const ta = document.createElement('textarea');
  ta.className = 'ci-desc'; ta.rows = 2; ta.placeholder = 'Slow push-in on her hands…'; ta.value = o.desc || '';
  ta.addEventListener('input', ()=>{ o.desc = ta.value; markDirty(); });
  ta.addEventListener('keydown', e=>e.stopPropagation());
  ds.appendChild(ta);

  // actions
  const act = el('div', 'ci-actions');
  const fb = el('button', 'btn', o.imgId ? 'Frame ✓' : 'Frame…');
  fb.type = 'button';
  fb.title = o.imgId ? 'Replace the reference frame for this camera' : 'Attach a reference frame (a still or a grab) to this camera';
  fb.addEventListener('click', ()=>{
    const fi = document.createElement('input');
    fi.type = 'file'; fi.accept = 'image/*';
    fi.addEventListener('change', async ()=>{
      if(!fi.files || !fi.files[0]) return;
      try{
        o.imgId = await storeImageFile(fi.files[0]);
        redo();
        toast('Frame attached — drag the little picture to reposition it');
      }catch(e){ toast('That image could not be stored — try a smaller one'); }
    });
    fi.click();
  });
  act.appendChild(fb);
  if(o.imgId){
    const rf = el('button', 'btn ci-x', '×');
    rf.type = 'button'; rf.title = 'Remove the frame';
    rf.addEventListener('click', ()=>{ o.imgId = null; redo(); });
    act.appendChild(rf);
  }
  if(!document.body.classList.contains('lite') && typeof floorAllowed === 'function' && floorAllowed('shots')){
    const sl = el('button', 'btn primary', 'Shot list →');
    sl.type = 'button';
    sl.title = 'Go to the shot list floor';
    sl.addEventListener('click', ()=>switchTab('shots'));
    act.appendChild(sl);
  }
  host.appendChild(act);
}

// the inspector follows the right panel: collapse it and the selection bar takes over again
(function(){
  const pt = document.getElementById('panelToggle');
  if(pt) pt.addEventListener('click', ()=>setTimeout(()=>{ if(typeof refreshSelBar === 'function' && sel) refreshSelBar(); }, 0));
  let wasOn = null;
  window.addEventListener('resize', ()=>{
    const on = window.innerWidth > 900;
    if(wasOn !== null && on !== wasOn && sel && typeof refreshSelBar === 'function') refreshSelBar();
    wasOn = on;
  });
})();
