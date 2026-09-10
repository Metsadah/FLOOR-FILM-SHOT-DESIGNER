// Floorboard — 09-budget.js · the Budget floor
// Laid out the way a quote is: pre-production, production, post-production
// and variable costs, each with as many lines as you need (qty × rate),
// a target per phase, contingency and VAT on top. Lines save with the
// production; crew/cast come from the People registry (roles attached),
// gear from the scene boards. Exports: CSV and a quote-style PDF.
'use strict';
const BUDGET_PHASES = [
  ['pre',  'Pre-production',  ''],
  ['prod', 'Production',      ''],
  ['post', 'Post-production', ''],
  ['var',  'Variable costs',  'Depends on script choices — priced once known (travel, hotels, styling, licences…)']
];
const BUDGET_UNITS = ['days', 'half days', 'hours', 'units', 'flat', 'km', 'nights', '%'];
// starter lines per phase — a producer's checklist, priced by hand (rate 0 until you fill it in)
const BUDGET_STANDARD = {
  pre: ['Brainstorm · research · script', 'Shot list · storyboard · script walk-through', 'Production · contacts · admin',
        'Location scouting', 'Location visit with director / styling', 'Set dressing / styling prep', 'Casting / booking actors',
        'Camera prep · tests · rental visit'],
  prod: ['Director', 'Director of photography', 'Focus puller / 1st AC', 'Runner / 2nd AC', 'Gaffer + best boy (light)',
         'Make-up artist', 'Set dresser', 'Producer / production manager', 'Sound recordist (incl. recording kit)',
         'Camera package (cameras, lenses, tripod, gimbal)', 'Light package + van'],
  post: ['Editing (feedback rounds, incl. director edit day)', 'Colour grading', 'Audio mix / sound design', 'Contingency'],
  var: ['Music licence TV / online (1 year)', 'Travel costs crew & cast', 'Location fee', 'Set design / styling (rental, accessories, small purchases)',
        'Actor fees / buy-out', 'Wardrobe stylist', 'Hotel / overnight stays', 'Catering']
};
function budgetData(){
  if(!project.budget) project.budget = {currency:'EUR', vat:21, contPct:0, target:{pre:0, prod:0, post:0}, items:[]};
  const b = project.budget;
  b.target = b.target || {pre:0, prod:0, post:0};
  b.items = b.items || [];
  b.currency = b.currency || 'EUR';
  if(b.vat == null) b.vat = 21;
  if(b.contPct == null) b.contPct = 0;
  for(const it of b.items){ if(!BUDGET_PHASES.some(p=>p[0] === it.phase)) it.phase = 'prod'; if(it.qty == null) it.qty = 1; }
  return b;
}
function budgetAmount(it){ return (+it.qty || 0) * (+it.rate || 0); }
function budgetFmt(n, cur, cents){
  try{ return new Intl.NumberFormat('nl-NL', {style:'currency', currency:cur || 'EUR', minimumFractionDigits:cents ? 2 : 0, maximumFractionDigits:cents ? 2 : 0}).format(n || 0); }
  catch(_){ return Math.round(n || 0) + ' ' + (cur || 'EUR'); }
}
function budgetTotals(){
  const b = budgetData();
  const t = {byPhase:{pre:0, prod:0, post:0, var:0}, sub:0, cont:0, vat:0, total:0, target:0};
  for(const it of b.items){ const a = budgetAmount(it); t.byPhase[it.phase] += a; t.sub += a; }
  t.cont = t.sub * (+b.contPct || 0) / 100;
  t.vat = (t.sub + t.cont) * (+b.vat || 0) / 100;
  t.total = t.sub + t.cont + t.vat;
  t.target = (+b.target.pre || 0) + (+b.target.prod || 0) + (+b.target.post || 0);
  return t;
}
function budgetAddRow(phase, seed){
  const b = budgetData();
  const row = Object.assign({id:uid(), phase, name:'', qty:1, unit:'days', rate:0, note:''}, seed || {});
  b.items.push(row);
  return row;
}
function budgetShootDays(){
  if(project.shotlist && project.shotlist.days && project.shotlist.days.length) return project.shotlist.days.length;
  if(typeof boardDays === 'function' && boardDays().length) return boardDays().length;
  return 1;
}
// crew / cast from the People registry — the role stays a field, not flat text
function budgetImportPeople(tag){
  const reg = (typeof peopleReg === 'function') ? peopleReg() : [];
  const b = budgetData(), days = budgetShootDays();
  let n = 0;
  for(const p of reg){
    if((p.tag || 'crew') !== tag || !(p.name || p.role)) continue;
    if(b.items.some(it=>it.personId === p.id)) continue;
    const label = [p.role, p.name].filter(Boolean).join(' — ');
    budgetAddRow('prod', {name:label, personId:p.id, cat:tag, qty:days, unit:'days'});
    n++;
  }
  return n;
}
function budgetImportGear(){
  if(typeof gearListGroups !== 'function') return 0;
  const counts = {};
  for(const g of gearListGroups({props:{}, hide:{}, done:{}})) for(const r of g.rows) counts[r.name] = Math.max(counts[r.name] || 0, r.count || 1);
  const b = budgetData(), days = budgetShootDays();
  let n = 0;
  for(const name in counts){
    if(b.items.some(it=>it.cat === 'gear' && it.name === name)) continue;
    budgetAddRow('prod', {name:name + (counts[name] > 1 ? ' ×' + counts[name] : ''), cat:'gear', qty:days, unit:'days'});
    n++;
  }
  return n;
}
function budgetAddStandard(phase){
  const b = budgetData();
  let n = 0;
  for(const name of BUDGET_STANDARD[phase] || []){
    if(b.items.some(it=>it.phase === phase && it.name === name)) continue;
    budgetAddRow(phase, {name, qty:1, unit:phase === 'prod' && /Director|photography|AC|Gaffer|Make-up|dresser|Producer|Sound|package/.test(name) ? 'days' : 'flat'});
    n++;
  }
  return n;
}
function budgetCSV(){
  const b = budgetData(), t = budgetTotals();
  const esc = v=>'"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [['Phase', 'Qty', 'Unit', 'Description', 'Rate', 'Amount', 'Note'].map(esc).join(';')];
  for(const [k, label] of BUDGET_PHASES){
    const rows = b.items.filter(it=>it.phase === k);
    if(!rows.length) continue;
    for(const it of rows) lines.push([label, it.qty, it.unit, it.name, it.rate, budgetAmount(it), it.note].map(esc).join(';'));
  }
  lines.push('');
  lines.push(['Subtotal', '', '', '', '', t.sub, ''].map(esc).join(';'));
  if(+b.contPct) lines.push(['Contingency ' + b.contPct + '%', '', '', '', '', t.cont, ''].map(esc).join(';'));
  lines.push(['VAT ' + b.vat + '%', '', '', '', '', t.vat, ''].map(esc).join(';'));
  lines.push(['Total incl. VAT', '', '', '', '', t.total, ''].map(esc).join(';'));
  return new Blob(['﻿' + lines.join('\n')], {type:'text/csv;charset=utf-8'});
}
function budgetFileBase(){ return (project.shootName || 'production').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'production'; }
// quote-style PDF: phases as groups, qty · description · rate · amount, totals with VAT
function exportBudgetPDF(){
  const b = budgetData(), t = budgetTotals(), cur = b.currency;
  const doc = new DocPDF({title:'Budget'});
  doc.head('Budget', 'Estimate — amounts excl. VAT unless stated', [['Date', todayStr()], ['Currency', cur], ['Shoot days', String(budgetShootDays())]]);
  const cols = [{label:'Qty', w:46, align:'c'}, {label:'Description', flex:1}, {label:'Rate', w:84, align:'r'}, {label:'Amount', w:90, align:'r'}];
  const rows = [];
  for(const [k, label, hint] of BUDGET_PHASES){
    const its = b.items.filter(it=>it.phase === k);
    if(!its.length) continue;
    rows.push([{t:label.toUpperCase() + (hint ? '  —  ' + hint : ''), bold:true, span:true, fill:[0.965, 0.96, 0.95]}]);
    for(const it of its){
      const q = (+it.qty || 0), qs = q % 1 ? q.toFixed(1) : String(q);
      const unit = q === 1 ? String(it.unit || '').replace(/^(days|hours|units|nights)$/, m=>m.slice(0, -1)).replace(/^half days$/, 'half day') : it.unit;
      const qty = (!it.unit || it.unit === 'flat') ? qs + ' ×' : qs + ' ' + unit;
      rows.push([qty, {t:it.name + (it.note ? '\n' + it.note : '')}, budgetFmt(+it.rate || 0, cur, true), budgetFmt(budgetAmount(it), cur, true)]);
    }
    rows.push(['', {t:label + ' subtotal', dim:true}, '', {t:budgetFmt(t.byPhase[k], cur, true), bold:true}]);
  }
  if(!rows.length) doc.text('No lines yet.', {dim:true});
  else doc.table(cols, rows, {fontSize:9});
  const tot = [['Subtotal', budgetFmt(t.sub, cur, true)]];
  if(+b.contPct) tot.push(['Contingency ' + b.contPct + '%', budgetFmt(t.cont, cur, true)]);
  tot.push([b.vat + '% VAT', budgetFmt(t.vat, cur, true)]);
  tot.push(['Total', budgetFmt(t.total, cur, true), true]);
  doc.totals(tot);
  const vars = b.items.filter(it=>it.phase === 'var' && !budgetAmount(it));
  if(vars.length) doc.text('Variable costs without an amount are not included in the total — they follow the final script choices.', {size:8.5, dim:true});
  dlBlob(budgetFileBase() + '_budget.pdf', doc.blob());
  toast('Budget PDF exported');
}

// ---------------------------------------------------------------- page
function buildBudgetPage(){
  const host = document.getElementById('tabBudget');
  if(!host) return;
  const b = budgetData(), t = budgetTotals(), cur = b.currency;
  const pct = (v, tgt)=> tgt ? Math.min(100, Math.round(v / tgt * 100)) : 0;
  const over = (v, tgt)=> tgt && v > tgt;
  const phaseCard = ([k, label])=>{
    const hasT = k !== 'var';
    const v = t.byPhase[k], tg = hasT ? +b.target[k] : 0;
    return `<div class="bud-phase${over(v, tg) ? ' over' : ''}" data-ph="${k}">
      <div class="bud-phase-top"><span>${label}</span>${hasT ? `<label>Target <input data-target="${k}" type="number" min="0" step="100" value="${b.target[k] || ''}" placeholder="0"></label>` : '<span class="bud-dim">not in target</span>'}</div>
      <div class="bud-bar"><i style="width:${pct(v, tg)}%"></i></div>
      <div class="bud-phase-num"><b>${budgetFmt(v, cur)}</b><span>${tg ? 'of ' + budgetFmt(tg, cur) : (hasT ? 'no target yet' : '')}</span></div>
    </div>`;
  };
  const section = ([k, label, hint])=>{
    const rows = b.items.filter(it=>it.phase === k);
    return `
    <section class="bud-cat" data-ph="${k}">
      <header>
        <h3><span class="dot" style="background:${k === 'pre' ? PAL.sky : k === 'prod' ? PAL.teal : k === 'post' ? PAL.lilac : PAL.sand}"></span>${label}${hint ? `<small>${hint}</small>` : ''}</h3>
        <span class="bud-sum">${budgetFmt(t.byPhase[k], cur)}</span>
        <span class="bud-actions">
          ${k === 'prod' ? `<button class="btn" data-act="people" data-tag="crew" title="One line per crew member from the People registry — qty = shoot days">From crew list</button>
          <button class="btn" data-act="people" data-tag="cast" title="One line per cast member from the People registry">From cast list</button>
          <button class="btn" data-act="gear" title="Cameras, grip and light from every scene board">Gear from boards</button>` : ''}
          <button class="btn" data-act="std" title="Add the usual lines for this phase (rate 0 — fill in what applies, remove the rest)">Standard lines</button>
          <button class="btn" data-act="add">+ Line</button>
        </span>
      </header>
      <table>
        <thead><tr><th class="n">Qty</th><th>Unit</th><th>Description</th><th class="n">Rate</th><th class="n">Amount</th><th>Note</th><th></th></tr></thead>
        <tbody>
        ${rows.map(it=>`
          <tr data-id="${it.id}" draggable="true">
            <td class="n"><input data-k="qty" type="number" min="0" step="0.5" value="${it.qty ?? 1}"></td>
            <td><select data-k="unit">${BUDGET_UNITS.map(u=>`<option${(it.unit || 'days') === u ? ' selected' : ''}>${u}</option>`).join('')}</select></td>
            <td><input data-k="name" value="${esc(it.name || '')}" placeholder="${k === 'var' ? 'Travel, hotel, styling…' : 'Role — name, or a task'}"></td>
            <td class="n"><input data-k="rate" type="number" min="0" step="10" value="${it.rate ?? 0}"></td>
            <td class="n bud-amt">${budgetFmt(budgetAmount(it), cur)}</td>
            <td><input data-k="note" value="${esc(it.note || '')}" placeholder="…"></td>
            <td><button class="mini" data-act="del" title="Remove line">×</button></td>
          </tr>`).join('')}
        ${rows.length ? '' : `<tr class="bud-empty"><td colspan="7">No lines yet — <b>+ Line</b>, or <b>Standard lines</b> for the usual ${label.toLowerCase()} items.</td></tr>`}
        </tbody>
      </table>
    </section>`;
  };
  host.innerHTML = `
  <div class="bud-wrap">
    <div class="bud-head">
      <div>
        <h2>Budget</h2>
        <p class="bud-lead">As many lines per phase as the job needs, a target per phase, contingency and VAT on top. Exports as a quote-style PDF or CSV.</p>
      </div>
      <div class="bud-headactions">
        <label class="bud-cur">Currency <select id="budCur">${['EUR', 'USD', 'GBP', 'CHF'].map(c=>`<option${cur === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="bud-cur">VAT % <input id="budVat" type="number" min="0" max="100" step="1" value="${b.vat}"></label>
        <label class="bud-cur" title="A safety margin over the subtotal (typically 5–10%)">Contingency % <input id="budCont" type="number" min="0" max="100" step="1" value="${b.contPct}"></label>
        <button class="btn" id="budCsv">CSV</button>
        <button class="btn primary" id="budPdf">Export PDF</button>
      </div>
    </div>
    <div class="bud-phases">
      ${BUDGET_PHASES.map(phaseCard).join('')}
      <div class="bud-phase total${over(t.sub, t.target) ? ' over' : ''}">
        <div class="bud-phase-top"><span>Total</span><span class="bud-delta">${t.target ? (t.sub <= t.target ? budgetFmt(t.target - t.sub, cur) + ' left' : budgetFmt(t.sub - t.target, cur) + ' over') : ''}</span></div>
        <div class="bud-bar"><i style="width:${pct(t.sub, t.target)}%"></i></div>
        <div class="bud-phase-num"><b>${budgetFmt(t.sub, cur)}</b><span>${t.target ? 'of ' + budgetFmt(t.target, cur) + ' target' : 'excl. VAT'}</span></div>
        <div class="bud-tot-lines"><span>${+b.contPct ? 'Contingency ' + b.contPct + '% ' + budgetFmt(t.cont, cur) + ' · ' : ''}VAT ${b.vat}% ${budgetFmt(t.vat, cur)}</span><b>${budgetFmt(t.total, cur)} incl.</b></div>
      </div>
    </div>
    ${BUDGET_PHASES.map(section).join('')}
  </div>`;
  // ---- wiring ----
  host.onkeydown = e=>e.stopPropagation();
  host.oninput = e=>{
    if(e.target.id === 'budVat'){ b.vat = +e.target.value || 0; markDirty(); refreshTotals(); return; }
    if(e.target.id === 'budCont'){ b.contPct = +e.target.value || 0; markDirty(); refreshTotals(); return; }
    if(e.target.dataset.target){ b.target[e.target.dataset.target] = +e.target.value || 0; markDirty(); refreshTotals(); return; }
    const tr = e.target.closest('tr[data-id]'); if(!tr) return;
    const it = b.items.find(x=>x.id === tr.dataset.id); if(!it) return;
    const k = e.target.dataset.k;
    it[k] = (k === 'qty' || k === 'rate') ? (+e.target.value || 0) : e.target.value;
    tr.querySelector('.bud-amt').textContent = budgetFmt(budgetAmount(it), b.currency);
    markDirty(); refreshTotals();
  };
  host.onchange = e=>{
    if(e.target.id === 'budCur'){ b.currency = e.target.value; markDirty(); buildBudgetPage(); }
    else if(e.target.dataset.k === 'unit') host.oninput(e);
  };
  host.onclick = e=>{
    const btn = e.target.closest('button'); if(!btn) return;
    const act = btn.dataset.act, sec = btn.closest('.bud-cat'), ph = sec && sec.dataset.ph;
    if(btn.id === 'budCsv'){ dlBlob(budgetFileBase() + '-budget.csv', budgetCSV()); return; }
    if(btn.id === 'budPdf'){ exportBudgetPDF(); return; }
    if(act === 'add'){ budgetAddRow(ph); markDirty(); buildBudgetPage(); focusLast(ph); }
    else if(act === 'std'){ const n = budgetAddStandard(ph); markDirty(); buildBudgetPage(); toast(n ? n + ' standard lines added — fill in the rates, remove what does not apply' : 'All standard lines are already there'); }
    else if(act === 'people'){ const tag = btn.dataset.tag; const n = budgetImportPeople(tag); markDirty(); buildBudgetPage(); toast(n ? n + ' added from the ' + tag + ' list (qty = ' + budgetShootDays() + ' shoot day' + (budgetShootDays() === 1 ? '' : 's') + ')' : 'Everyone from the ' + tag + ' list is already here'); }
    else if(act === 'gear'){ const n = budgetImportGear(); markDirty(); buildBudgetPage(); toast(n ? n + ' gear lines added from the scene boards' : 'No new gear found on the boards'); }
    else if(act === 'del'){ const tr = btn.closest('tr'); b.items = b.items.filter(x=>x.id !== tr.dataset.id); markDirty(); buildBudgetPage(); }
  };
  // drag a line to another position or phase
  let dragId = null;
  host.addEventListener('dragstart', e=>{ const tr = e.target.closest('tr[data-id]'); if(!tr || e.target.tagName === 'INPUT') { if(tr) e.preventDefault(); return; } dragId = tr.dataset.id; e.dataTransfer.effectAllowed = 'move'; tr.classList.add('dragging'); });
  host.addEventListener('dragend', ()=>{ dragId = null; host.querySelectorAll('.dragging,.drop-before').forEach(x=>x.classList.remove('dragging', 'drop-before')); });
  host.addEventListener('dragover', e=>{
    if(!dragId) return;
    const sec = e.target.closest('.bud-cat'); if(!sec) return;
    e.preventDefault();
    host.querySelectorAll('.drop-before').forEach(x=>x.classList.remove('drop-before'));
    const tr = e.target.closest('tr[data-id]');
    if(tr && tr.dataset.id !== dragId) tr.classList.add('drop-before'); else sec.classList.add('drop-before');
  });
  host.addEventListener('drop', e=>{
    if(!dragId) return;
    const sec = e.target.closest('.bud-cat'); if(!sec) return;
    e.preventDefault();
    const it = b.items.find(x=>x.id === dragId); if(!it) return;
    const tr = e.target.closest('tr[data-id]');
    b.items = b.items.filter(x=>x !== it);
    it.phase = sec.dataset.ph;
    const idx = tr ? b.items.findIndex(x=>x.id === tr.dataset.id) : -1;
    if(idx >= 0) b.items.splice(idx, 0, it); else b.items.push(it);
    markDirty(); buildBudgetPage();
  });
  function focusLast(ph){
    const inp = host.querySelector(`.bud-cat[data-ph="${ph}"] tbody tr:last-child input[data-k="name"]`);
    if(inp) inp.focus();
  }
  function refreshTotals(){
    const t2 = budgetTotals();
    host.querySelectorAll('.bud-cat').forEach(sec=>{ sec.querySelector('.bud-sum').textContent = budgetFmt(t2.byPhase[sec.dataset.ph], b.currency); });
    host.querySelectorAll('.bud-phase').forEach(ph=>{
      const k = ph.dataset.ph;
      const v = k ? t2.byPhase[k] : t2.sub, tg = k ? (k === 'var' ? 0 : +b.target[k]) : t2.target;
      ph.classList.toggle('over', !!(tg && v > tg));
      ph.querySelector('.bud-bar i').style.width = pct(v, tg) + '%';
      ph.querySelector('.bud-phase-num b').textContent = budgetFmt(v, b.currency);
      ph.querySelector('.bud-phase-num span').textContent = tg ? 'of ' + budgetFmt(tg, b.currency) + (k ? '' : ' target') : (k === 'var' ? '' : k ? 'no target yet' : 'excl. VAT');
      const d = ph.querySelector('.bud-delta');
      if(d) d.textContent = tg ? (v <= tg ? budgetFmt(tg - v, b.currency) + ' left' : budgetFmt(v - tg, b.currency) + ' over') : '';
      const tl = ph.querySelector('.bud-tot-lines');
      if(tl){ tl.querySelector('span').textContent = (+b.contPct ? 'Contingency ' + b.contPct + '% ' + budgetFmt(t2.cont, b.currency) + ' · ' : '') + 'VAT ' + b.vat + '% ' + budgetFmt(t2.vat, b.currency); tl.querySelector('b').textContent = budgetFmt(t2.total, b.currency) + ' incl.'; }
    });
  }
}
