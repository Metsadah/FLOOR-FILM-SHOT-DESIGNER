// Floorboard — 09-budget.js · the 3rd floor
// A budget a director/DOP actually thinks in: crew, cast and gear, each split
// over pre-production / production / post, against a target per phase. Rows
// are plain data on the project (project.budget), so they save, sync and
// export with everything else. Crew & cast can be pulled from the People
// registry, gear from every scene board's gear list — then priced by hand.
'use strict';
const BUDGET_CATS = [['crew','Crew'],['cast','Cast'],['gear','Gear & locations'],['other','Other']];
const BUDGET_PHASES = [['pre','Pre-production'],['prod','Production'],['post','Post']];
function budgetData(){
  if(!project.budget) project.budget = {currency:'EUR', target:{pre:0, prod:0, post:0}, items:[]};
  const b = project.budget;
  b.target = b.target || {pre:0, prod:0, post:0};
  b.items = b.items || [];
  b.currency = b.currency || 'EUR';
  return b;
}
function budgetAmount(it){ return (+it.qty || 0) * (+it.rate || 0); }
function budgetFmt(n, cur){
  try{ return new Intl.NumberFormat('nl-NL', {style:'currency', currency:cur || 'EUR', maximumFractionDigits:0}).format(n || 0); }
  catch(_){ return Math.round(n || 0) + ' ' + (cur || 'EUR'); }
}
function budgetTotals(){
  const b = budgetData();
  const t = {byCat:{}, byPhase:{pre:0, prod:0, post:0}, all:0, target:0};
  for(const [c] of BUDGET_CATS) t.byCat[c] = {pre:0, prod:0, post:0, all:0};
  for(const it of b.items){
    const a = budgetAmount(it), ph = BUDGET_PHASES.some(p=>p[0] === it.phase) ? it.phase : 'prod';
    const c = t.byCat[it.cat] ? it.cat : 'other';
    t.byCat[c][ph] += a; t.byCat[c].all += a; t.byPhase[ph] += a; t.all += a;
  }
  t.target = (+b.target.pre || 0) + (+b.target.prod || 0) + (+b.target.post || 0);
  return t;
}
function budgetAddRow(cat, seed){
  const b = budgetData();
  const row = Object.assign({id:uid(), cat, name:'', phase:'prod', qty:1, unit:'days', rate:0, note:''}, seed || {});
  b.items.push(row);
  return row;
}
// pull names from the People registry (roles stay attached — no flat text)
function budgetImportPeople(cat){
  const reg = (typeof peopleReg === 'function') ? peopleReg() : [];
  const want = cat === 'cast' ? p=>(p.kind || p.tag || '') === 'cast' : p=>(p.kind || p.tag || 'crew') !== 'cast';
  const b = budgetData();
  let n = 0;
  for(const p of reg){
    if(!want(p) || !(p.name || p.role)) continue;
    const label = [p.role, p.name].filter(Boolean).join(' — ');
    if(b.items.some(it=>it.cat === cat && it.name === label)) continue;
    budgetAddRow(cat, {name:label, personId:p.id});
    n++;
  }
  return n;
}
// gear from every scene board (fixture names when set), one row per kind
function budgetImportGear(){
  if(typeof gearListGroups !== 'function') return 0;
  const groups = gearListGroups({props:{}, hide:{}, done:{}});
  const counts = {};
  for(const g of groups) for(const r of g.rows) counts[r.name] = Math.max(counts[r.name] || 0, r.count || 1);
  const b = budgetData();
  let n = 0;
  for(const name in counts){
    if(b.items.some(it=>it.cat === 'gear' && it.name === name)) continue;
    budgetAddRow('gear', {name, qty:counts[name], unit:'units'});
    n++;
  }
  return n;
}
function budgetCSV(){
  const b = budgetData();
  const esc = v=>'"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [['Category','Name','Phase','Qty','Unit','Rate','Amount','Note'].map(esc).join(';')];
  for(const it of b.items)
    lines.push([it.cat, it.name, it.phase, it.qty, it.unit, it.rate, budgetAmount(it), it.note].map(esc).join(';'));
  const t = budgetTotals();
  lines.push('');
  for(const [k, label] of BUDGET_PHASES) lines.push([label, '', '', '', '', 'target ' + (b.target[k] || 0), t.byPhase[k], ''].map(esc).join(';'));
  lines.push(['TOTAL', '', '', '', '', 'target ' + t.target, t.all, ''].map(esc).join(';'));
  return new Blob(['﻿' + lines.join('\n')], {type:'text/csv;charset=utf-8'});
}

function buildBudgetPage(){
  const host = document.getElementById('tabBudget');
  if(!host) return;
  const b = budgetData(), t = budgetTotals(), cur = b.currency;
  const pct = (v, tgt)=> tgt ? Math.min(100, Math.round(v / tgt * 100)) : 0;
  const over = (v, tgt)=> tgt && v > tgt;
  const catBlock = ([cat, label])=>{
    const rows = b.items.filter(it=>it.cat === cat);
    const tot = t.byCat[cat];
    return `
    <section class="bud-cat" data-cat="${cat}">
      <header>
        <h3><span class="dot" style="background:${cat === 'crew' ? PAL.teal : cat === 'cast' ? PAL.coral : cat === 'gear' ? PAL.sand : PAL.slate}"></span>${label}</h3>
        <span class="bud-sum">${budgetFmt(tot.all, cur)}</span>
        <span class="bud-actions">
          ${cat === 'crew' || cat === 'cast' ? `<button class="btn" data-act="people">From ${cat} list</button>` : ''}
          ${cat === 'gear' ? `<button class="btn" data-act="gear">From scene boards</button>` : ''}
          <button class="btn" data-act="add">+ Row</button>
        </span>
      </header>
      <table>
        <thead><tr><th>Name / role</th><th>Phase</th><th class="n">Qty</th><th>Unit</th><th class="n">Rate</th><th class="n">Amount</th><th>Note</th><th></th></tr></thead>
        <tbody>
        ${rows.map(it=>`
          <tr data-id="${it.id}">
            <td><input data-k="name" value="${esc(it.name || '')}" placeholder="${cat === 'gear' ? 'Fixture, camera, location…' : 'Role — name'}"></td>
            <td><select data-k="phase">${BUDGET_PHASES.map(([k, l])=>`<option value="${k}"${it.phase === k ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
            <td class="n"><input data-k="qty" type="number" min="0" step="0.5" value="${it.qty ?? 1}"></td>
            <td><select data-k="unit">${['days','hours','units','flat','km'].map(u=>`<option${(it.unit || 'days') === u ? ' selected' : ''}>${u}</option>`).join('')}</select></td>
            <td class="n"><input data-k="rate" type="number" min="0" step="10" value="${it.rate ?? 0}"></td>
            <td class="n bud-amt">${budgetFmt(budgetAmount(it), cur)}</td>
            <td><input data-k="note" value="${esc(it.note || '')}" placeholder="…"></td>
            <td><button class="mini" data-act="del" title="Remove row">×</button></td>
          </tr>`).join('')}
        ${rows.length ? '' : `<tr class="bud-empty"><td colspan="8">Nothing here yet — add a row${cat === 'gear' ? ' or pull the gear from your scene boards' : cat === 'other' ? '' : ' or pull people from the ' + cat + ' list'}.</td></tr>`}
        </tbody>
      </table>
    </section>`;
  };
  host.innerHTML = `
  <div class="bud-wrap">
    <div class="bud-head">
      <div>
        <h2>Budget</h2>
        <p class="bud-lead">Crew, cast and gear against a target per phase. Rows save with the production; export the CSV for the producer.</p>
      </div>
      <div class="bud-headactions">
        <label class="bud-cur">Currency <select id="budCur">${['EUR','USD','GBP','CHF'].map(c=>`<option${cur === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        <button class="btn" id="budCsv">Export CSV</button>
      </div>
    </div>
    <div class="bud-phases">
      ${BUDGET_PHASES.map(([k, label])=>`
        <div class="bud-phase${over(t.byPhase[k], +b.target[k]) ? ' over' : ''}">
          <div class="bud-phase-top"><span>${label}</span>
            <label>Target <input data-target="${k}" type="number" min="0" step="100" value="${b.target[k] || ''}" placeholder="0"></label></div>
          <div class="bud-bar"><i style="width:${pct(t.byPhase[k], +b.target[k])}%"></i></div>
          <div class="bud-phase-num"><b>${budgetFmt(t.byPhase[k], cur)}</b><span>${b.target[k] ? 'of ' + budgetFmt(+b.target[k], cur) : 'no target yet'}</span></div>
        </div>`).join('')}
      <div class="bud-phase total${over(t.all, t.target) ? ' over' : ''}">
        <div class="bud-phase-top"><span>Total</span><span class="bud-delta">${t.target ? (t.all <= t.target ? budgetFmt(t.target - t.all, cur) + ' left' : budgetFmt(t.all - t.target, cur) + ' over') : ''}</span></div>
        <div class="bud-bar"><i style="width:${pct(t.all, t.target)}%"></i></div>
        <div class="bud-phase-num"><b>${budgetFmt(t.all, cur)}</b><span>${t.target ? 'of ' + budgetFmt(t.target, cur) : ''}</span></div>
      </div>
    </div>
    ${BUDGET_CATS.map(catBlock).join('')}
  </div>`;
  // ---- wiring (event delegation; keys must not reach the canvas shortcuts) ----
  host.onkeydown = e=>e.stopPropagation();
  host.oninput = e=>{
    const tr = e.target.closest('tr[data-id]');
    if(e.target.dataset.target){ b.target[e.target.dataset.target] = +e.target.value || 0; markDirty(); refreshTotals(); return; }
    if(!tr) return;
    const it = b.items.find(x=>x.id === tr.dataset.id); if(!it) return;
    const k = e.target.dataset.k;
    it[k] = (k === 'qty' || k === 'rate') ? (+e.target.value || 0) : e.target.value;
    tr.querySelector('.bud-amt').textContent = budgetFmt(budgetAmount(it), b.currency);
    markDirty(); refreshTotals();
  };
  host.onchange = e=>{
    if(e.target.id === 'budCur'){ b.currency = e.target.value; markDirty(); buildBudgetPage(); }
    else if(e.target.dataset.k === 'phase' || e.target.dataset.k === 'unit') host.oninput(e);
  };
  host.onclick = e=>{
    const btn = e.target.closest('button'); if(!btn) return;
    const act = btn.dataset.act, sec = btn.closest('.bud-cat'), cat = sec && sec.dataset.cat;
    if(btn.id === 'budCsv'){ dlBlob((project.shootName || 'production').replace(/\s+/g, '_') + '-budget.csv', budgetCSV()); return; }
    if(act === 'add'){ budgetAddRow(cat); markDirty(); buildBudgetPage(); focusLast(cat); }
    else if(act === 'people'){ const n = budgetImportPeople(cat); markDirty(); buildBudgetPage(); toast(n ? n + ' added from the ' + cat + ' list' : 'Everyone from the ' + cat + ' list is already here'); }
    else if(act === 'gear'){ const n = budgetImportGear(); markDirty(); buildBudgetPage(); toast(n ? n + ' gear rows added from the scene boards' : 'No new gear found on the boards'); }
    else if(act === 'del'){ const tr = btn.closest('tr'); b.items = b.items.filter(x=>x.id !== tr.dataset.id); markDirty(); buildBudgetPage(); }
  };
  function focusLast(cat){
    const inp = host.querySelector(`.bud-cat[data-cat="${cat}"] tbody tr:last-child input[data-k="name"]`);
    if(inp) inp.focus();
  }
  function refreshTotals(){
    const t2 = budgetTotals();
    host.querySelectorAll('.bud-cat').forEach(sec=>{ sec.querySelector('.bud-sum').textContent = budgetFmt(t2.byCat[sec.dataset.cat].all, b.currency); });
    host.querySelectorAll('.bud-phase').forEach((ph, i)=>{
      const k = BUDGET_PHASES[i] ? BUDGET_PHASES[i][0] : null;
      const v = k ? t2.byPhase[k] : t2.all, tg = k ? +b.target[k] : t2.target;
      ph.classList.toggle('over', !!(tg && v > tg));
      ph.querySelector('.bud-bar i').style.width = pct(v, tg) + '%';
      ph.querySelector('.bud-phase-num b').textContent = budgetFmt(v, b.currency);
      ph.querySelector('.bud-phase-num span').textContent = tg ? 'of ' + budgetFmt(tg, b.currency) : (k ? 'no target yet' : '');
      const d = ph.querySelector('.bud-delta');
      if(d) d.textContent = tg ? (v <= tg ? budgetFmt(tg - v, b.currency) + ' left' : budgetFmt(v - tg, b.currency) + ' over') : '';
    });
  }
}
