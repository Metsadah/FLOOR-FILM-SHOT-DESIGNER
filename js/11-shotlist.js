// Floorboard — 11-shotlist.js · the Shot list floor (3rd)
// A BOARD like every other floor (notes, images, sub-boards all work), whose
// signature card is the shot list: an AV-script card in shot-list mode — one
// card per shoot day, rows in SHOOTING order. Columns: SC · SHOT · START ·
// MIN · CAMERA (camera · lens · move, prefilled from the Shot designer, still
// editable) · STILLS · VIDEO · AUDIO · REGIE NOTES. Breaks, setup time and
// company moves are tinted rows; START adds the minutes up from the call.
// The card IS an avscript (cat) so cells, row drag, stills, column widths,
// custom columns and the .docx export all come for free; o.mode==='shotlist'
// switches columns, clock and placeholders.
'use strict';
const SL_BLOCKS = {break:['Break', 30], setup:['Setup / build', 45], move:['Company move', 60]};

function slMinutes(t){ // "08:30" → 510
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(t || '').trim());
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}
function slHHMM(min){
  if(min == null) return '—';
  min = Math.round(min);
  const d = Math.floor(min / 60) % 24, m = min % 60;
  return String(d).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
function slDurMin(t){ // "20", "20m", "1:30" (h:mm) → minutes
  t = String(t || '').trim();
  if(!t) return 0;
  const m = t.match(/^(\d{1,2})[:.](\d{2})$/);
  if(m) return (+m[1]) * 60 + (+m[2]);
  return parseInt(t, 10) || 0;
}
function slCardTitle(o){
  const d = o.day || {};
  const date = d.date ? new Date(d.date + 'T12:00:00').toLocaleDateString('nl-NL', {weekday:'short', day:'numeric', month:'short'}) : '';
  return [(d.name || 'SHOT LIST').toUpperCase(), date, d.call ? 'call ' + d.call : ''].filter(Boolean).join('  ·  ');
}
// ---------------------------------------------------------------- the board
function ensureShotBoard(){
  if(!project.shotboard){
    const b = newShot(0);
    b.name = 'Shot list';
    project.shotboard = b;
    markDirty();
  }
  migrateShot(project.shotboard);
  slMigrateOld();
}
function slCards(){ // every shot-list card on the shot board (sub-boards too), date-sorted
  const out = [];
  const scan = objs=>(objs || []).forEach(ob=>{
    if(ob.cat === 'avscript' && ob.mode === 'shotlist') out.push(ob);
    if(ob.cat === 'subboard' && ob.board) scan(ob.board.objects);
  });
  if(project.shotboard) scan(project.shotboard.objects);
  return out.sort((a, c)=>String((a.day || {}).date || '9999').localeCompare(String((c.day || {}).date || '9999')));
}
function slNewCard(x, y, day){
  const n = slCards().length;
  const bd = (typeof boardDays === 'function') ? boardDays()[n] : null; // borrow the Production floor's day headers
  return {id:uid(), cat:'avscript', kind:'avscript', mode:'shotlist', x:x || 0, y:y || 0, rot:0, w:900, h:150, color:PAL.coral,
    cols:{no:true, still:false, notes:true}, rows:[],
    day:Object.assign({name:'Day ' + (n + 1), date:(bd && bd.date) || '', call:(bd && (bd.shootCall || bd.call)) || '08:00'}, day || {})};
}
// v0.76 kept days in project.shotlist (a DOM page) — they become cards once
function slMigrateOld(){
  const old = project.shotlist;
  if(!old || old.migrated || !(old.days || []).length) return;
  const map = slShotMap();
  let y = 0;
  for(const d of old.days){
    const card = slNewCard(0, y, {name:d.name, date:d.date, call:d.call});
    for(const it of d.items || []){
      if(it.type === 'shot'){ const sh = map[it.key]; if(sh) card.rows.push(slRowFromShot(sh, it.dur, it.note)); }
      else if(it.type === 'note') card.rows.push({id:uid(), no:'', shot:'', dur:'', cam:'', video:it.label || '', audio:'', notes:it.note || '', imgs:[]});
      else card.rows.push(slBlockRow(it.type, it.label, it.dur, it.note));
    }
    if(d.loc) card.rows.unshift({id:uid(), no:'', shot:'', dur:'', cam:'', video:d.loc, audio:'', notes:'', imgs:[], block:'setup', label:'Unit base'});
    project.shotboard.objects.push(card);
    y += 420;
  }
  old.migrated = true;
  markDirty();
}
// ---------------------------------------------------------------- shots from the designer
function slAllShots(){
  const out = [];
  (project.scenes || []).forEach((s, si)=>{
    const seen = new Set();
    const pools = [{su:null, objs:s.objects || []}];
    for(const su of (s.setups || [])) if(su.objects !== s.objects) pools.push({su, objs:su.objects || []});
    const multi = (s.setups || []).length > 1;
    for(const {su, objs} of pools){
      for(const ob of objs){
        if(ob.cat !== 'camera' || seen.has(ob.id)) continue;
        seen.add(ob.id);
        const sh = (s.shots || []).find(x=>x.id === ob.shotId);
        const suName = multi ? ((su || (s.setups || []).find(x=>x.id === s.setupId) || {}).name || '') : '';
        const camName = (typeof CAMS !== 'undefined' && CAMS[ob.kind] && CAMS[ob.kind].name) || '';
        out.push({key:s.id + '|' + ob.id, sceneId:s.id, camId:ob.id, si,
          sc:s.scene || '', scene:s.sceneDesc || s.name || '', shot:(sh && sh.name) || '', label:ob.label || '',
          framing:ob.framing || '', lens:ob.lens ? ob.lens + 'mm' : '', support:ob.support || '', setup:suName, camName,
          sceneDur:s.duration || 0});
      }
    }
  });
  return out;
}
function slShotMap(){ const m = {}; for(const s of slAllShots()) m[s.key] = s; return m; }
function slCamText(sh){ return [sh.camName, sh.framing, sh.lens, sh.support, sh.setup].filter(Boolean).join(' · '); }
function slRowFromShot(sh, dur, note){
  const cam = slCamText(sh);
  return {id:uid(), key:sh.key, no:sh.sc, shot:[sh.shot, sh.label].filter(Boolean).join(' · '), dur:String(dur || 20), cam, camAuto:cam,
    video:'', audio:'', notes:note || '', imgs:[]};
}
function slBlockRow(type, label, dur, note){
  const [name, def] = SL_BLOCKS[type] || ['Block', 30];
  return {id:uid(), block:type, no:'', shot:'', dur:String(dur || def), cam:'', video:label || '', audio:'', notes:note || '', imgs:[], label:name};
}
function slScheduledKeys(){
  const set = new Set();
  for(const c of slCards()) for(const r of c.rows || []) if(r.key) set.add(r.key);
  return set;
}
// refresh camera/lens/move from the designer for rows the user hasn't retyped
function slSyncCard(o){
  const map = slShotMap();
  let n = 0, gone = 0;
  for(const r of o.rows || []){
    if(!r.key) continue;
    const sh = map[r.key];
    if(!sh){ gone++; continue; }
    const cam = slCamText(sh);
    if(r.cam === r.camAuto && r.cam !== cam){ r.cam = cam; n++; }
    r.camAuto = cam;
    if(!r.no) r.no = sh.sc;
    if(!r.shot) r.shot = [sh.shot, sh.label].filter(Boolean).join(' · ');
  }
  markDirty(); render();
  toast((n ? n + ' camera cell' + (n === 1 ? '' : 's') + ' updated from the Shot designer' : 'Camera cells already match the Shot designer') +
    (gone ? ' · ' + gone + ' row' + (gone === 1 ? '' : 's') + ' no longer have a camera on the board' : ''));
}
function slAddBlock(o, type){
  o.rows.push(slBlockRow(type));
  markDirty(); render();
  const r = o.rows[o.rows.length - 1];
  setTimeout(()=>openAvCell(o, r.id, 'video'), 0);
}
// pull shots from the scene boards into this card
function slPullOverlay(o){
  const sched = slScheduledKeys();
  const all = slAllShots();
  const groups = [];
  for(const s of all){
    let g = groups.find(x=>x.sceneId === s.sceneId);
    if(!g){ g = {sceneId:s.sceneId, sc:s.sc, scene:s.scene, shots:[]}; groups.push(g); }
    g.shots.push(s);
  }
  const el = document.createElement('div');
  el.className = 'fb-ov';
  el.innerHTML = '<div class="fb-ov-box" style="width:560px"><div class="fb-ov-title">Shots from the scene boards</div>' +
    '<div class="fb-ov-sub">Every camera on a scene board is a shot. Tick what shoots on <b>' + esc((o.day || {}).name || 'this day') + '</b> — they land at the bottom in scene order; drag rows into shooting order afterwards. Greyed shots are already on a shot list.</div>' +
    (groups.length ? '<div class="fb-row" style="margin-bottom:6px"><button class="btn" id="slAll">Tick all unscheduled</button><button class="btn" id="slNone">Untick</button></div>' +
      groups.map(g=>'<div class="fb-pick-scene"><b>' + esc((g.sc ? 'SC ' + g.sc + ' · ' : '') + g.scene) + '</b>' +
        g.shots.map(s=>'<label class="fb-pick"><input type="checkbox" data-key="' + s.key + '"' + (sched.has(s.key) ? ' data-dup="1"' : '') + '><span>' + esc([s.shot, s.label].filter(Boolean).join(' · ') || 'Shot') +
          ' <i>' + esc(slCamText(s)) + (sched.has(s.key) ? ' · already listed' : '') + '</i></span></label>').join('') + '</div>').join('')
      : '<p class="fb-dim">No cameras on any scene board yet — place them on the 2nd floor.</p>') +
    '<div class="fb-ov-actions"><button class="btn" id="slNo">Cancel</button><span style="flex:1"></span><button class="btn primary" id="slGo">Add ticked</button></div></div>';
  document.body.appendChild(el);
  el.addEventListener('keydown', e=>e.stopPropagation());
  el.querySelector('#slNo').addEventListener('click', ()=>el.remove());
  el.addEventListener('click', e=>{ if(e.target === el) el.remove(); });
  const allBtn = el.querySelector('#slAll');
  if(allBtn){
    allBtn.addEventListener('click', ()=>el.querySelectorAll('input[type=checkbox]').forEach(cb=>{ cb.checked = !cb.dataset.dup; }));
    el.querySelector('#slNone').addEventListener('click', ()=>el.querySelectorAll('input[type=checkbox]').forEach(cb=>{ cb.checked = false; }));
    el.querySelectorAll('.fb-pick input[data-dup]').forEach(cb=>{ cb.closest('.fb-pick').style.opacity = .55; });
  }
  el.querySelector('#slGo').addEventListener('click', ()=>{
    const map = slShotMap();
    let n = 0;
    // placeholder first row from a fresh card goes when real rows arrive
    if(o.rows.length === 1 && !o.rows[0].key && !o.rows[0].block && !(o.rows[0].video || o.rows[0].audio || o.rows[0].no || o.rows[0].shot)) o.rows = [];
    el.querySelectorAll('input[type=checkbox]:checked').forEach(cb=>{ const sh = map[cb.dataset.key]; if(sh){ o.rows.push(slRowFromShot(sh)); n++; } });
    el.remove();
    if(n){ markDirty(); render(); refreshSelBar(); toast(n + ' shot' + (n === 1 ? '' : 's') + ' added — drag the grips into shooting order'); }
  });
}
// ---------------------------------------------------------------- library section (3rd floor)
function buildShotLibSection(lib){
  const h = document.createElement('div');
  h.className = 'side-head';
  h.style.marginTop = '6px';
  h.textContent = 'Shoot days';
  const grid = document.createElement('div');
  grid.className = 'lib-grid';
  const el = document.createElement('div');
  el.className = 'lib-item';
  el.appendChild(tileCanvas((tc, w2, h2)=>{}, 100, 100, PAL.coral, null, null, 'avscript'));
  el.insertAdjacentHTML('beforeend', '<span>Shot list (day)</span>');
  el.title = 'Drag onto the board — one card per shoot day. Then "+ Shots…" pulls the cameras from your scene boards.';
  el.addEventListener('pointerdown', e=>startLibDrag(e, Object.assign(slNewCard(0, 0), {id:undefined})));
  grid.appendChild(el);
  const cards = slCards();
  const info = document.createElement('div');
  info.className = 'doc-empty';
  info.style.padding = '2px 12px 6px';
  const sched = slScheduledKeys().size, total = slAllShots().length;
  info.textContent = cards.length
    ? cards.length + ' day' + (cards.length === 1 ? '' : 's') + ' · ' + sched + ' of ' + total + ' shots scheduled' + (total > sched ? ' — select a day card and use "+ Shots…"' : '')
    : (total ? total + ' shots on the scene boards, none scheduled yet — drop a day card first.' : 'Every camera on a scene board (2nd floor) becomes a shot here.');
  lib.prepend(info);
  lib.prepend(grid);
  lib.prepend(h);
}
// ---------------------------------------------------------------- PDF
function slCardRows(o){ // computed start times per row
  let t = slMinutes((o.day || {}).call) ?? 480;
  return (o.rows || []).map(r=>{ const dur = slDurMin(r.dur); const row = {r, start:t, dur}; t += dur; return row; }).concat([{wrap:t}]);
}
function exportShotListPDF(card){
  const cards = card ? [card] : slCards();
  if(!cards.length){ toast('No shot list cards yet — drop a day card on the 3rd floor'); return; }
  const doc = new DocPDF({title:'Shot list', landscape:true, margin:36});
  const nShots = cards.reduce((a, c)=>a + (c.rows || []).filter(r=>!r.block).length, 0);
  doc.head('Shot list' + (card ? ' — ' + ((card.day || {}).name || 'Day') : ''), 'Shooting order' + (cards.length > 1 ? ' · ' + cards.length + ' shoot days' : ''),
    [['Date', card && card.day && card.day.date ? docDateStr(card.day.date) : todayStr()], ['Shots', String(nShots)]]);
  const cols = [{label:'Start', w:42, bold:true}, {label:'SC', w:30}, {label:'Shot', w:64, bold:true}, {label:'Min', w:30, align:'r'},
    {label:'Camera · lens · move', flex:2}, {label:'Video', flex:3}, {label:'Audio', flex:2}, {label:'Regie notes', flex:2}];
  for(const c of cards){
    const rows = slCardRows(c), wrap = rows.pop().wrap, d = c.day || {};
    const n = rows.filter(x=>!x.r.block).length;
    doc.section((d.name || 'Day') + (d.date ? ' — ' + docDateStr(d.date) : ''), 'call ' + (d.call || '–') + ' · ' + n + ' shots · wrap ' + slHHMM(wrap));
    const trs = rows.map(({r, start, dur})=>{
      if(r.block){
        const lab = (SL_BLOCKS[r.block] || ['Block'])[0] + (r.video ? ' — ' + r.video : '');
        return [{t:slHHMM(start), bold:true, fill:[0.965, 0.96, 0.95]}, '', '', String(dur), {t:lab, dim:true, bold:true}, '', r.audio || '', r.notes || ''];
      }
      return [slHHMM(start), r.no || '', r.shot || '', String(dur), r.cam || '', r.video || '', r.audio || '', r.notes || ''];
    });
    if(!trs.length) doc.text('Nothing scheduled on this day yet.', {dim:true});
    else doc.table(cols, trs, {fontSize:8.5});
  }
  dlBlob(docFileName('shot-list' + (card ? '_' + ((card.day || {}).name || 'day').replace(/\s+/g, '-').toLowerCase() : '')), doc.blob());
  toast('Shot list PDF exported');
}
