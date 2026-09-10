// Floorboard — 11-shotlist.js · the Shot list floor
// Every camera on every scene board is a shot. This floor lines them up in
// SHOOTING order — per shoot day, with breaks, build/setup time and company
// moves in between — without a floor plan in sight. Times chain from the
// day's call. Drag a shot to another slot or day (or use the arrows / the
// "Move to" menu on touch). Exports a per-day shot list PDF.
'use strict';
const SL_TYPES = {shot:'Shot', break:'Break', setup:'Setup / build', move:'Company move', note:'Note'};
const SL_DEFAULT = {shot:20, break:30, setup:45, move:60, note:0};
let slDayId = null, slDrag = null;

function shotlistData(){
  if(!project.shotlist) project.shotlist = {days:[]};
  const d = project.shotlist;
  d.days = d.days || [];
  return d;
}
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
// every camera on every scene (all setups) → a shot
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
        out.push({key:s.id + '|' + ob.id, sceneId:s.id, camId:ob.id, si,
          sc:s.scene || '', scene:s.sceneDesc || s.name || '', shot:(sh && sh.name) || '', label:ob.label || '',
          framing:ob.framing || '', lens:ob.lens ? ob.lens + 'mm' : '', support:ob.support || '', setup:suName,
          film:s.film || ''});
      }
    }
  });
  return out;
}
function slShotMap(){ const m = {}; for(const s of slAllShots()) m[s.key] = s; return m; }
function slSync(){
  const d = shotlistData(), map = slShotMap();
  for(const day of d.days){
    day.items = (day.items || []).filter(it=>it.type !== 'shot' || map[it.key]);
    for(const it of day.items) if(it.dur == null) it.dur = SL_DEFAULT[it.type] || 20;
  }
  if(slDayId && !d.days.some(x=>x.id === slDayId)) slDayId = null;
  if(!slDayId && d.days.length) slDayId = d.days[0].id;
  return map;
}
function slScheduledKeys(){
  const set = new Set();
  for(const day of shotlistData().days) for(const it of day.items || []) if(it.type === 'shot') set.add(it.key);
  return set;
}
function slAddDay(){
  const d = shotlistData();
  const n = d.days.length;
  const bd = (typeof boardDays === 'function') ? boardDays()[n] : null; // borrow the Production floor's day headers
  const day = {id:uid(), name:'Day ' + (n + 1), date:(bd && bd.date) || '', call:(bd && (bd.shootCall || bd.call)) || '08:00', loc:'', items:[]};
  d.days.push(day);
  slDayId = day.id;
  markDirty();
  return day;
}
function slCurrentDay(){ const d = shotlistData(); return d.days.find(x=>x.id === slDayId) || d.days[0] || null; }
function slAddShot(day, key, at){
  if(!day) return;
  const it = {id:uid(), type:'shot', key, dur:SL_DEFAULT.shot, note:''};
  if(at == null || at < 0 || at > day.items.length) day.items.push(it); else day.items.splice(at, 0, it);
  markDirty();
  return it;
}
function slAddBlock(day, type){
  if(!day) return;
  day.items.push({id:uid(), type, label:'', dur:SL_DEFAULT[type], note:''});
  markDirty();
}
function slFindItem(id){
  for(const day of shotlistData().days){ const i = day.items.findIndex(x=>x.id === id); if(i >= 0) return {day, i, it:day.items[i]}; }
  return null;
}
function slMoveItem(id, toDay, at){ // at = index in the target list (before removal fix-up)
  const f = slFindItem(id); if(!f || !toDay) return;
  f.day.items.splice(f.i, 1);
  if(f.day === toDay && at != null && at > f.i) at--;
  if(at == null || at < 0 || at > toDay.items.length) toDay.items.push(f.it); else toDay.items.splice(at, 0, f.it);
  markDirty();
}
function slRows(day, map){
  let t = slMinutes(day.call) ?? 480;
  const rows = [];
  for(const it of day.items || []){
    const pin = slMinutes(it.time);
    if(pin != null) t = pin;
    const dur = +it.dur || 0;
    rows.push({it, shot:it.type === 'shot' ? map[it.key] : null, start:t, end:t + dur, dur});
    t += dur;
  }
  return {rows, wrap:t};
}
function slShotTitle(sh){
  return [sh.sc ? 'SC ' + sh.sc : '', sh.shot, sh.label].filter(Boolean).join(' · ') || 'Shot';
}
function slShotSub(sh){
  return [sh.framing, sh.lens, sh.support, sh.setup].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------- page
function buildShotListPage(){
  const host = document.getElementById('tabShots');
  if(!host) return;
  const map = slSync();
  const d = shotlistData();
  const day = slCurrentDay();
  const sched = slScheduledKeys();
  const pool = slAllShots().filter(s=>!sched.has(s.key));
  const groups = [];
  for(const s of pool){ let g = groups.find(x=>x.sceneId === s.sceneId); if(!g){ g = {sceneId:s.sceneId, sc:s.sc, scene:s.scene, shots:[]}; groups.push(g); } g.shots.push(s); }
  const totalShots = slAllShots().length;
  const dayBtn = dy=>{
    const {rows, wrap} = slRows(dy, map);
    const n = rows.filter(r=>r.it.type === 'shot').length;
    return `<button class="sl-day${dy === day ? ' on' : ''}" data-day="${dy.id}"><b>${esc(dy.name || 'Day')}</b><span>${dy.date ? new Date(dy.date + 'T12:00:00').toLocaleDateString('nl-NL', {weekday:'short', day:'numeric', month:'short'}) : 'no date'} · ${n} shot${n === 1 ? '' : 's'} · wrap ${slHHMM(wrap)}</span></button>`;
  };
  let main = '';
  if(!day){
    main = `<div class="sl-empty"><h3>No shoot days yet</h3><p>Add a day, then drag shots from the left into shooting order. Breaks, build time and company moves go in between; the clock runs from the day's call.</p><button class="btn primary" data-act="addday">+ Shoot day</button></div>`;
  } else {
    const {rows, wrap} = slRows(day, map);
    const nShots = rows.filter(r=>r.it.type === 'shot').length;
    const mins = rows.reduce((a, r)=>a + r.dur, 0);
    const moveOpts = d.days.filter(x=>x !== day).map(x=>`<option value="${x.id}">→ ${esc(x.name)}</option>`).join('');
    main = `
      <div class="sl-dayhead">
        <input class="sl-dayname" data-dk="name" value="${esc(day.name || '')}" placeholder="Day name">
        <label>Date <input type="date" data-dk="date" value="${esc(day.date || '')}"></label>
        <label>Call <input data-dk="call" value="${esc(day.call || '')}" placeholder="08:00" style="width:64px"></label>
        <label class="grow">Location / note <input data-dk="loc" value="${esc(day.loc || '')}" placeholder="Where the day starts, parking, unit base…"></label>
        <span class="sl-daystats">${nShots} shot${nShots === 1 ? '' : 's'} · ${Math.round(mins / 60 * 10) / 10} h · wrap <b>${slHHMM(wrap)}</b></span>
      </div>
      <div class="sl-tools">
        <button class="btn" data-act="block" data-type="break">+ Break</button>
        <button class="btn" data-act="block" data-type="setup">+ Setup / build</button>
        <button class="btn" data-act="block" data-type="move">+ Company move</button>
        <button class="btn" data-act="block" data-type="note">+ Note</button>
        <span style="flex:1"></span>
        <button class="btn" data-act="pdfday">PDF this day</button>
        <button class="btn primary" data-act="pdfall">PDF all days</button>
        <button class="btn danger-ghost" data-act="rmday" title="Remove this day — its shots go back to Unscheduled">Remove day</button>
      </div>
      <table class="sl-table">
        <thead><tr><th class="t">Time</th><th class="g"></th><th>Shot</th><th class="n">Min</th><th>Notes</th><th class="c"></th></tr></thead>
        <tbody data-day="${day.id}">
        ${rows.map((r, i)=>{
          const it = r.it, isShot = it.type === 'shot';
          const info = isShot
            ? `<div class="sl-shot"><b>${esc(slShotTitle(r.shot))}</b><span>${esc(slShotSub(r.shot) || r.shot.scene)}</span></div>`
            : `<div class="sl-block sl-${it.type}"><em>${SL_TYPES[it.type]}</em><input data-k="label" value="${esc(it.label || '')}" placeholder="${it.type === 'move' ? 'To where?' : it.type === 'note' ? 'Anything the crew should know' : 'Optional label'}"></div>`;
          return `<tr data-id="${it.id}" class="sl-row sl-${it.type}" draggable="true">
            <td class="t"><input data-k="time" class="sl-time${it.time ? ' pinned' : ''}" value="${esc(it.time || '')}" placeholder="${slHHMM(r.start)}" title="Computed from the call — type a time to pin it"></td>
            <td class="g"><span class="grip" title="Drag to reorder">⋮⋮</span></td>
            <td>${info}</td>
            <td class="n"><input data-k="dur" type="number" min="0" step="5" value="${it.dur ?? 0}"></td>
            <td><input data-k="note" value="${esc(it.note || '')}" placeholder="…"></td>
            <td class="c"><button class="mini" data-act="up" title="Earlier"${i === 0 ? ' disabled' : ''}>▲</button><button class="mini" data-act="down" title="Later"${i === rows.length - 1 ? ' disabled' : ''}>▼</button>
              <select class="sl-move" data-act="moveto" title="Move to another day"><option value="">Move…</option>${moveOpts}${isShot ? '<option value="__pool">→ Unscheduled</option>' : ''}</select>
              <button class="mini" data-act="del" title="${isShot ? 'Back to Unscheduled' : 'Remove'}">×</button></td>
          </tr>`;
        }).join('')}
        ${rows.length ? '' : `<tr class="sl-droprow"><td colspan="6">Drag shots here from the left — or click the + next to a shot. Then add breaks and moves.</td></tr>`}
        </tbody>
      </table>`;
  }
  host.innerHTML = `
  <div class="sl-wrap">
    <aside class="sl-pool" data-pool="1">
      <div class="sl-pool-head"><h3>Unscheduled</h3><span>${pool.length} of ${totalShots}</span></div>
      ${totalShots ? '' : '<p class="sl-hint">No shots yet — every camera you place on a scene board (2nd floor) shows up here.</p>'}
      ${groups.map(g=>`
        <div class="sl-group">
          <div class="sl-group-head"><b>${g.sc ? 'SC ' + esc(g.sc) : 'Scene'}</b><span>${esc(g.scene)}</span><button class="mini" data-act="addscene" data-scene="${g.sceneId}" title="Add all ${g.shots.length} shots to the current day">+ all</button></div>
          ${g.shots.map(s=>`<div class="sl-pshot" draggable="true" data-key="${s.key}"><div><b>${esc([s.shot, s.label].filter(Boolean).join(' · ') || 'Shot')}</b><span>${esc(slShotSub(s))}</span></div><button class="mini" data-act="addshot" data-key="${s.key}" title="Add to the current day">+</button></div>`).join('')}
        </div>`).join('')}
      ${totalShots && !pool.length ? '<p class="sl-hint">Everything is scheduled.</p>' : ''}
    </aside>
    <section class="sl-main">
      <div class="sl-days">${d.days.map(dayBtn).join('')}<button class="sl-day add" data-act="addday">+ Shoot day</button></div>
      ${main}
    </section>
  </div>`;
  // ---- wiring ----
  host.onkeydown = e=>e.stopPropagation();
  host.oninput = e=>{
    const dk = e.target.dataset.dk;
    if(dk && day){ day[dk] = e.target.value; markDirty(); if(dk !== 'name' && dk !== 'loc') buildShotListPage(); else if(dk === 'name'){ const b = host.querySelector(`.sl-day[data-day="${day.id}"] b`); if(b) b.textContent = day.name || 'Day'; } return; }
    const tr = e.target.closest('tr[data-id]'); if(!tr) return;
    const f = slFindItem(tr.dataset.id); if(!f) return;
    const k = e.target.dataset.k;
    f.it[k] = k === 'dur' ? (+e.target.value || 0) : e.target.value;
    markDirty();
    if(k === 'dur' || k === 'time') refreshTimes();
  };
  host.onchange = e=>{
    if(e.target.dataset.act === 'moveto'){
      const tr = e.target.closest('tr[data-id]'), v = e.target.value; if(!tr || !v) return;
      if(v === '__pool'){ const f = slFindItem(tr.dataset.id); f.day.items.splice(f.i, 1); markDirty(); }
      else slMoveItem(tr.dataset.id, d.days.find(x=>x.id === v), null);
      buildShotListPage();
    }
    if(e.target.type === 'date' && e.target.dataset.dk) { /* handled in oninput */ }
  };
  host.onclick = e=>{
    const dayBtnEl = e.target.closest('.sl-day[data-day]');
    if(dayBtnEl){ slDayId = dayBtnEl.dataset.day; buildShotListPage(); return; }
    const btn = e.target.closest('button'); if(!btn) return;
    const act = btn.dataset.act;
    if(act === 'addday'){ slAddDay(); buildShotListPage(); }
    else if(act === 'addshot'){ if(!day){ slAddDay(); } slAddShot(slCurrentDay(), btn.dataset.key); buildShotListPage(); }
    else if(act === 'addscene'){ if(!day){ slAddDay(); } const cur = slCurrentDay(); for(const s of pool.filter(x=>x.sceneId === btn.dataset.scene)) slAddShot(cur, s.key); buildShotListPage(); }
    else if(act === 'block'){ slAddBlock(day, btn.dataset.type); buildShotListPage(); const last = host.querySelector('tbody tr[data-id]:last-child input[data-k="label"]'); if(last) last.focus(); }
    else if(act === 'up' || act === 'down'){ const tr = btn.closest('tr'); const f = slFindItem(tr.dataset.id); const j = act === 'up' ? f.i - 1 : f.i + 1; if(j >= 0 && j < f.day.items.length){ f.day.items.splice(f.i, 1); f.day.items.splice(j, 0, f.it); markDirty(); buildShotListPage(); } }
    else if(act === 'del'){ const tr = btn.closest('tr'); const f = slFindItem(tr.dataset.id); f.day.items.splice(f.i, 1); markDirty(); buildShotListPage(); }
    else if(act === 'rmday'){ if(!confirm('Remove ' + (day.name || 'this day') + '? Its shots go back to Unscheduled.')) return; d.days = d.days.filter(x=>x !== day); slDayId = null; markDirty(); buildShotListPage(); }
    else if(act === 'pdfday'){ exportShotListPDF(day.id); }
    else if(act === 'pdfall'){ exportShotListPDF(null); }
  };
  // ---- drag & drop: rows within/between days, pool → day, row → pool ----
  host.addEventListener('dragstart', e=>{
    const row = e.target.closest('tr[data-id]'), ps = e.target.closest('.sl-pshot');
    if(e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT'){ e.preventDefault(); return; }
    if(row){ slDrag = {kind:'item', id:row.dataset.id}; row.classList.add('dragging'); }
    else if(ps){ slDrag = {kind:'pool', key:ps.dataset.key}; ps.classList.add('dragging'); }
    else return;
    e.dataTransfer.effectAllowed = 'move';
    try{ e.dataTransfer.setData('text/plain', 'floorboard-shot'); }catch(_){}
  });
  host.addEventListener('dragend', ()=>{ slDrag = null; host.querySelectorAll('.dragging,.drop-before,.drop-into').forEach(x=>x.classList.remove('dragging', 'drop-before', 'drop-into')); });
  host.addEventListener('dragover', e=>{
    if(!slDrag) return;
    const row = e.target.closest('tr[data-id]'), body = e.target.closest('tbody[data-day]'), dbtn = e.target.closest('.sl-day[data-day]'), poolEl = e.target.closest('.sl-pool');
    if(!(row || body || dbtn || (poolEl && slDrag.kind === 'item'))) return;
    e.preventDefault();
    host.querySelectorAll('.drop-before,.drop-into').forEach(x=>x.classList.remove('drop-before', 'drop-into'));
    if(row) row.classList.add('drop-before'); else if(dbtn) dbtn.classList.add('drop-into'); else if(body) body.classList.add('drop-into'); else if(poolEl) poolEl.classList.add('drop-into');
  });
  host.addEventListener('drop', e=>{
    if(!slDrag) return;
    const row = e.target.closest('tr[data-id]'), body = e.target.closest('tbody[data-day]'), dbtn = e.target.closest('.sl-day[data-day]'), poolEl = e.target.closest('.sl-pool');
    e.preventDefault();
    const targetDay = dbtn ? d.days.find(x=>x.id === dbtn.dataset.day) : (body || row) ? d.days.find(x=>x.id === (body || row.closest('tbody')).dataset.day) : null;
    const at = row ? targetDay.items.findIndex(x=>x.id === row.dataset.id) : null;
    if(slDrag.kind === 'pool'){
      if(targetDay) slAddShot(targetDay, slDrag.key, at);
    } else if(slDrag.kind === 'item'){
      if(poolEl && !targetDay){ const f = slFindItem(slDrag.id); if(f && f.it.type === 'shot'){ f.day.items.splice(f.i, 1); markDirty(); } }
      else if(targetDay && !(row && row.dataset.id === slDrag.id)) slMoveItem(slDrag.id, targetDay, at);
    }
    slDrag = null;
    buildShotListPage();
  });
  function refreshTimes(){
    if(!day) return;
    const {rows, wrap} = slRows(day, map);
    host.querySelectorAll('tbody tr[data-id]').forEach((tr, i)=>{
      const inp = tr.querySelector('.sl-time'); if(inp && rows[i]){ inp.placeholder = slHHMM(rows[i].start); inp.classList.toggle('pinned', !!rows[i].it.time); }
    });
    const st = host.querySelector('.sl-daystats b'); if(st) st.textContent = slHHMM(wrap);
    const mins = rows.reduce((a, r)=>a + r.dur, 0), n = rows.filter(r=>r.it.type === 'shot').length;
    const ds = host.querySelector('.sl-daystats'); if(ds) ds.innerHTML = n + ' shot' + (n === 1 ? '' : 's') + ' · ' + Math.round(mins / 60 * 10) / 10 + ' h · wrap <b>' + slHHMM(wrap) + '</b>';
    const db = host.querySelector(`.sl-day[data-day="${day.id}"] span`);
    if(db) db.textContent = (day.date ? new Date(day.date + 'T12:00:00').toLocaleDateString('nl-NL', {weekday:'short', day:'numeric', month:'short'}) : 'no date') + ' · ' + n + ' shot' + (n === 1 ? '' : 's') + ' · wrap ' + slHHMM(wrap);
  }
}

// ---------------------------------------------------------------- PDF
function exportShotListPDF(dayId){
  const map = slSync();
  const d = shotlistData();
  const days = dayId ? d.days.filter(x=>x.id === dayId) : d.days;
  if(!days.length){ toast('No shoot days yet'); return; }
  const doc = new DocPDF({title:'Shot list'});
  const nShots = days.reduce((a, dy)=>a + dy.items.filter(i=>i.type === 'shot').length, 0);
  doc.head('Shot list' + (dayId ? ' — ' + (days[0].name || 'Day') : ''), 'Shooting order' + (days.length > 1 ? ' · ' + days.length + ' shoot days' : ''),
    [['Date', dayId && days[0].date ? docDateStr(days[0].date) : todayStr()], ['Shots', String(nShots)]]);
  const cols = [{label:'Time', w:44, bold:true}, {label:'SC', w:34}, {label:'Shot', flex:3}, {label:'Framing · lens', flex:2}, {label:'Min', w:34, align:'r'}, {label:'Notes', flex:2}];
  for(const dy of days){
    const {rows, wrap} = slRows(dy, map);
    const n = rows.filter(r=>r.it.type === 'shot').length;
    doc.section((dy.name || 'Day') + (dy.date ? ' — ' + docDateStr(dy.date) : ''), 'call ' + (dy.call || '–') + ' · ' + n + ' shots · wrap ' + slHHMM(wrap));
    if(dy.loc) doc.text(dy.loc, {size:9, dim:true, gap:4});
    const trs = rows.map(r=>{
      const it = r.it;
      if(it.type === 'shot' && r.shot){
        const sh = r.shot;
        return [slHHMM(r.start), sh.sc || '', {t:[sh.shot, sh.label].filter(Boolean).join(' · ') || 'Shot', bold:true}, [sh.framing, sh.lens, sh.support, sh.setup].filter(Boolean).join(' · ') || sh.scene, String(r.dur), it.note || ''];
      }
      const lab = SL_TYPES[it.type] + (it.label ? ' — ' + it.label : '') + (it.note ? '  ·  ' + it.note : '');
      return [{t:slHHMM(r.start), bold:true, fill:[0.965, 0.96, 0.95]}, '', {t:lab, dim:true}, '', String(r.dur), ''];
    });
    if(!trs.length) doc.text('Nothing scheduled on this day yet.', {dim:true});
    else doc.table(cols, trs, {fontSize:9});
  }
  dlBlob(docFileName('shot-list' + (dayId ? '_' + (days[0].name || 'day').replace(/\s+/g, '-').toLowerCase() : '')), doc.blob());
  toast('Shot list PDF exported');
}
