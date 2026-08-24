// FLOOR — 06-tabs.js
// The app shell: Moodboard · Script · Storyboard · Shot designer · Production.
// Moodboard reuses the whole canvas engine on a project-level board.

// ---------------------------------------------------------------- tab switching
function switchTab(t){
  if(activeTab === t) return;
  if(typeof exitAllSubboards === 'function') exitAllSubboards();
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
    refreshSelBar();
    ensureShotImages(activeScene(), false).then(()=>{ zoomFitIfEmptyView(); render(); });
  }
  if(typeof syncTitle === 'function') syncTitle(); // setup chips follow the tab
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
    m.name = 'Mood & inspiration';
    project.moodboard = m;
    markDirty();
  }
  migrateShot(project.moodboard);
}
// library section for the Mood & inspiration board — brainstorm cards
function buildMoodLibSection(lib){
  const h = document.createElement('div');
  h.className = 'side-head';
  h.style.marginTop = '10px';
  h.textContent = 'Brainstorm';
  lib.appendChild(h);
  const grid = document.createElement('div');
  grid.className = 'lib-grid';
  const preset = (name, color, title, ph)=>{
    const el = document.createElement('div');
    el.className = 'lib-item';
    el.appendChild(tileCanvas((tc,w2,h2)=>{
      tc.beginPath(); tc.roundRect(-w2/2,-h2*.4,w2,h2*.8,4);
      tc.fillStyle='#fff'; tc.fill();
      tc.strokeStyle=color; tc.lineWidth=2.5; tc.stroke();
      tc.fillStyle=color; tc.globalAlpha=.28;
      tc.fillRect(-w2/2,-h2*.4,w2,h2*.18); tc.globalAlpha=1;
      tc.globalAlpha=.5;
      for(const y2 of [-h2*.06, h2*.1, h2*.26]) tc.fillRect(-w2*.36, y2, w2*.72, 2.5);
      tc.globalAlpha=1;
    }, 100, 100, color));
    el.insertAdjacentHTML('beforeend', '<span>' + esc(name) + '</span>');
    el.addEventListener('pointerdown', e => startLibDrag(e,
      {cat:'colcard', kind:'colcard', w:220, h:120, cw:220, color, title, text:ph||''}));
    grid.appendChild(el);
  };
  preset('Idea', '#E2A93B', 'Idea');
  preset('Question', '#8B5CF6', 'Question');
  preset('Theme', '#3E9B6E', 'Theme');
  preset('Do / Don’t', '#E8604C', 'Do / don’t');
  lib.appendChild(grid);
  const tip = document.createElement('div');
  tip.style.cssText = 'font-size:10px;color:var(--ink2);padding:4px 14px 10px;line-height:1.5;';
  tip.textContent = 'Column cards for thinking out loud — pose a question, stack ideas under it, group by theme. Paste stills (Cmd+V), drop links for references, use color cards for the palette.';
  lib.appendChild(tip);
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
    tc.beginPath(); tc.roundRect(-w2*.42,-h2*.4,w2*.84,h2*.8,3);
    tc.fillStyle='#fff'; tc.fill();
    tc.strokeStyle='#8B5CF6'; tc.lineWidth=2.5; tc.stroke();
    tc.fillStyle='#8B5CF6'; tc.globalAlpha=.28;
    tc.fillRect(-w2*.42,-h2*.4,w2*.84,h2*.14); tc.globalAlpha=1;
    tc.globalAlpha=.5; tc.strokeStyle='#8B5CF6'; tc.lineWidth=1.5;
    for(const x2 of [-w2*.18, w2*.1]){
      tc.beginPath(); tc.moveTo(x2,-h2*.26); tc.lineTo(x2,h2*.4); tc.stroke();
    }
    for(const y2 of [-h2*.04, h2*.18]){
      tc.beginPath(); tc.moveTo(-w2*.42,y2); tc.lineTo(w2*.42,y2); tc.stroke();
    }
    tc.globalAlpha=1;
  }, {cat:'avscript', kind:'avscript', w:560, h:150, color:'#8B5CF6'});
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
  tip.textContent = 'Film script: write, select, hit "Break down" — FLOOR creates a storyboard row and a scene board per detected scene. AV script: a row per beat — time, what you hear, what you see; toggle scene #, stills and director notes columns in its selection bar.';
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

// ---- production card library (smart cards — drag onto the board) ----
function buildProdLibSection(lib){
  const h = document.createElement('div');
  h.className = 'side-head';
  h.style.marginTop = '10px';
  h.textContent = 'Production cards';
  lib.appendChild(h);
  const grid = document.createElement('div');
  grid.className = 'lib-grid';
  // day header — the call-time block (P3): date, general call, sunrise/sunset
  {
    const el = document.createElement('div');
    el.className = 'lib-item';
    el.appendChild(tileCanvas((tc,w2,h2)=>{
      tc.beginPath(); tc.roundRect(-w2/2,-h2*.4,w2,h2*.8,4);
      tc.fillStyle='#fff'; tc.fill();
      tc.strokeStyle='#E8604C'; tc.lineWidth=2.5; tc.stroke();
      tc.fillStyle='#E8604C'; tc.globalAlpha=.28;
      tc.fillRect(-w2/2, -h2*.4, w2, h2*.16); tc.globalAlpha=1;
      tc.font='800 '+(h2*.3)+'px -apple-system,Segoe UI,sans-serif';
      tc.textAlign='center'; tc.textBaseline='middle';
      tc.fillStyle='#33322E'; tc.fillText('07:00', 0, h2*.02);
      tc.textAlign='left'; tc.textBaseline='alphabetic';
      tc.fillStyle='#E8934C'; tc.globalAlpha=.7;
      tc.fillRect(-w2*.36, h2*.24, w2*.3, 2.5); tc.globalAlpha=1;
    }, 100, 100, '#E8604C'));
    el.insertAdjacentHTML('beforeend', '<span>Day header</span>');
    el.addEventListener('pointerdown', e => startLibDrag(e, {cat:'dayheader', kind:'dayheader', w:320, h:140, color:'#E8604C'}));
    grid.appendChild(el);
  }
  // registry cards first — Crew / Cast / Client, live views of one People list
  for(const kind of ['crew','cast','client']){
    const spec = LIST_CARDS[kind];
    const el = document.createElement('div');
    el.className = 'lib-item';
    el.appendChild(tileCanvas((tc,w2,h2)=>{
      tc.beginPath(); tc.roundRect(-w2/2,-h2*.36,w2,h2*.72,4);
      tc.fillStyle='#fff'; tc.fill();
      tc.strokeStyle=spec.color; tc.lineWidth=2.5; tc.stroke();
      tc.fillStyle=spec.color; tc.globalAlpha=.28;
      tc.fillRect(-w2/2, -h2*.36, w2, h2*.2); tc.globalAlpha=1;
      tc.globalAlpha=.55;
      for(const y2 of [-h2*.04, h2*.14]) tc.fillRect(-w2*.36, y2, w2*.72, 2.5);
      tc.globalAlpha=1;
    }, 100, 100, spec.color));
    el.insertAdjacentHTML('beforeend', '<span>' + esc(kind.charAt(0).toUpperCase()+kind.slice(1)) + '</span>');
    el.addEventListener('pointerdown', e => startLibDrag(e, {cat:'listcard', kind, w:360, h:74, color:spec.color}));
    grid.appendChild(el);
  }
  // field cards — label:value windows onto the production data
  for(const [kind, name] of [['prodinfo','Production'],['location','Location']]){
    const spec = FIELD_CARDS[kind];
    const el = document.createElement('div');
    el.className = 'lib-item';
    el.appendChild(tileCanvas((tc,w2,h2)=>{
      tc.beginPath(); tc.roundRect(-w2/2,-h2*.4,w2,h2*.8,4);
      tc.fillStyle='#fff'; tc.fill();
      tc.strokeStyle=spec.color; tc.lineWidth=2.5; tc.stroke();
      tc.fillStyle=spec.color; tc.globalAlpha=.28;
      tc.fillRect(-w2/2, -h2*.4, w2, h2*.18); tc.globalAlpha=1;
      tc.globalAlpha=.5;
      for(const y2 of [-h2*.1, h2*.06, h2*.22]){
        tc.fillRect(-w2*.36, y2, w2*.2, 2.5);
        tc.fillRect(-w2*.08, y2, w2*.44, 2.5);
      }
      tc.globalAlpha=1;
    }, 100, 100, spec.color));
    el.insertAdjacentHTML('beforeend', '<span>' + esc(name) + '</span>');
    el.addEventListener('pointerdown', e => startLibDrag(e, {cat:'fieldcard', kind, w:280, h:130, color:spec.color}));
    grid.appendChild(el);
  }
  // Checklist 2.0 — a real to-do list born from a template
  {
    const el = document.createElement('div');
    el.className = 'lib-item';
    el.appendChild(tileCanvas((tc,w2,h2)=>{
      tc.strokeStyle='#8B5CF6'; tc.lineWidth=3;
      for(const y2 of [-h2*.26, 0, h2*.26]){
        tc.strokeRect(-w2*.32, y2-6, 12, 12);
        tc.beginPath(); tc.moveTo(-w2*.06, y2); tc.lineTo(w2*.34, y2); tc.stroke();
      }
    }, 100, 100, '#8B5CF6'));
    el.insertAdjacentHTML('beforeend', '<span>Checklist</span>');
    el.addEventListener('pointerdown', e => startLibDrag(e,
      {cat:'todo', kind:'todo', w:230, h:120, color:'#8B5CF6', checklist:true}));
    grid.appendChild(el);
  }
  // day schedule — live: calls from the day header + scene picker
  {
    const el = document.createElement('div');
    el.className = 'lib-item';
    el.appendChild(tileCanvas((tc,w2,h2)=>{
      tc.beginPath(); tc.roundRect(-w2/2,-h2*.4,w2,h2*.8,4);
      tc.fillStyle='#fff'; tc.fill();
      tc.strokeStyle='#E8934C'; tc.lineWidth=2.5; tc.stroke();
      tc.fillStyle='#E8934C'; tc.globalAlpha=.28;
      tc.fillRect(-w2/2,-h2*.4,w2,h2*.16); tc.globalAlpha=1;
      tc.globalAlpha=.5;
      for(const y2 of [-h2*.1, h2*.04, h2*.18]){
        tc.strokeRect(-w2*.36, y2-1, 5, 5);
        tc.fillRect(-w2*.24, y2, w2*.6, 2.5);
      }
      tc.globalAlpha=1;
    }, 100, 100, '#E8934C'));
    el.insertAdjacentHTML('beforeend', '<span>Day schedule</span>');
    el.addEventListener('pointerdown', e => startLibDrag(e,
      {cat:'schedule', kind:'schedule', w:320, h:200, color:'#E8934C'}));
    grid.appendChild(el);
  }
  // prop list — live: props per scene from the boards + script, plus your own
  {
    const el = document.createElement('div');
    el.className = 'lib-item';
    el.appendChild(tileCanvas((tc,w2,h2)=>{
      tc.beginPath(); tc.roundRect(-w2/2,-h2*.4,w2,h2*.8,4);
      tc.fillStyle='#fff'; tc.fill();
      tc.strokeStyle='#7FA05A'; tc.lineWidth=2.5; tc.stroke();
      tc.fillStyle='#7FA05A'; tc.globalAlpha=.28;
      tc.fillRect(-w2/2,-h2*.4,w2,h2*.16); tc.globalAlpha=1;
      tc.globalAlpha=.55;
      for(const y2 of [-h2*.1, h2*.04, h2*.18]){
        tc.strokeRect(-w2*.36, y2-1, 6, 6);
        tc.fillRect(-w2*.22, y2+1, w2*.55, 2.5);
      }
      // one ticked box
      tc.globalAlpha=1; tc.lineWidth=1.8;
      tc.beginPath();
      tc.moveTo(-w2*.35, -h2*.09); tc.lineTo(-w2*.33, -h2*.06); tc.lineTo(-w2*.29, -h2*.12);
      tc.stroke();
    }, 100, 100, '#7FA05A'));
    el.insertAdjacentHTML('beforeend', '<span>Prop list</span>');
    el.addEventListener('pointerdown', e => startLibDrag(e,
      {cat:'proplist', kind:'proplist', w:280, h:160, color:'#7FA05A'}));
    grid.appendChild(el);
  }
  // gear list — live: cameras & lights per scene, fixture names included
  {
    const el = document.createElement('div');
    el.className = 'lib-item';
    el.appendChild(tileCanvas((tc,w2,h2)=>{
      tc.beginPath(); tc.roundRect(-w2/2,-h2*.4,w2,h2*.8,4);
      tc.fillStyle='#fff'; tc.fill();
      tc.strokeStyle='#4C8AD9'; tc.lineWidth=2.5; tc.stroke();
      tc.fillStyle='#4C8AD9'; tc.globalAlpha=.28;
      tc.fillRect(-w2/2,-h2*.4,w2,h2*.16); tc.globalAlpha=1;
      tc.globalAlpha=.55;
      for(const y2 of [-h2*.1, h2*.04, h2*.18]){
        tc.strokeRect(-w2*.36, y2-1, 6, 6);
        tc.fillRect(-w2*.22, y2+1, w2*.55, 2.5);
      }
      tc.globalAlpha=1;
    }, 100, 100, '#4C8AD9'));
    el.insertAdjacentHTML('beforeend', '<span>Gear list</span>');
    el.addEventListener('pointerdown', e => startLibDrag(e,
      {cat:'gearlist', kind:'gearlist', w:280, h:160, color:'#4C8AD9'}));
    grid.appendChild(el);
  }
  // live weather card (Open-Meteo: free GFS/ICON model data, no key)
  const wEl = document.createElement('div');
  wEl.className = 'lib-item';
  wEl.appendChild(tileCanvas((tc,w2,h2)=>{
    tc.strokeStyle='#4CA6E8'; tc.lineWidth=3; tc.fillStyle='#4CA6E8';
    tc.beginPath(); tc.arc(-w2*.1,-h2*.14,h2*.16,0,7); tc.stroke();
    tc.beginPath();
    tc.moveTo(-w2*.3,h2*.12); tc.quadraticCurveTo(-w2*.34,-h2*.06,-w2*.12,0);
    tc.quadraticCurveTo(0,-h2*.2,w2*.14,0);
    tc.quadraticCurveTo(w2*.36,-h2*.02,w2*.28,h2*.12);
    tc.closePath(); tc.globalAlpha=.35; tc.fill(); tc.globalAlpha=1; tc.stroke();
  }, 100, 100, '#4CA6E8'));
  wEl.insertAdjacentHTML('beforeend', '<span>Weather (live)</span>');
  wEl.addEventListener('pointerdown', e => startLibDrag(e, {cat:'weather', kind:'weather', color:'#4CA6E8'}));
  grid.appendChild(wEl);
  // the call sheet comes LAST — it's the sum of everything above
  {
    const el = document.createElement('div');
    el.className = 'lib-item';
    el.appendChild(tileCanvas((tc,w2,h2)=>{
      tc.beginPath(); tc.roundRect(-w2/2,-h2*.44,w2,h2*.88,4);
      tc.fillStyle='#fff'; tc.fill();
      tc.strokeStyle='#4B6BFB'; tc.lineWidth=2.5; tc.stroke();
      tc.fillStyle='#4B6BFB'; tc.globalAlpha=.28;
      tc.fillRect(-w2/2,-h2*.44,w2,h2*.16); tc.globalAlpha=1;
      tc.globalAlpha=.55;
      for(const y2 of [-h2*.18, -h2*.06, h2*.1, h2*.22, h2*.34])
        tc.fillRect(-w2*.36, y2, w2*(y2===-h2*.18||y2===h2*.1 ? .34 : .72), 2.5);
      tc.globalAlpha=1;
    }, 100, 100, '#4B6BFB'));
    el.insertAdjacentHTML('beforeend', '<span>Call sheet</span>');
    el.addEventListener('pointerdown', e => startLibDrag(e,
      {cat:'callsheet', kind:'callsheet', w:380, h:300, color:'#4B6BFB'}));
    grid.appendChild(el);
  }
  lib.appendChild(grid);
  const tip = document.createElement('div');
  tip.style.cssText = 'font-size:10px;color:var(--ink2);padding:4px 14px 10px;line-height:1.5;';
  tip.textContent = 'Crew, Cast and Client cards are live views of one People registry — add a person on any card and they exist everywhere ("Paste list…" imports a whole contact list at once). Production info and Location cards are windows onto the production data. Drop map screenshots or Cmd+V paste straight onto the board.';
  lib.appendChild(tip);
}

// ---------------------------------------------------------------- live weather (Open-Meteo, GFS-backed, free)
const WMO = {0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Rime fog',
  51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',
  66:'Freezing rain',71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',
  80:'Light showers',81:'Showers',82:'Heavy showers',85:'Snow showers',86:'Snow showers',
  95:'Thunderstorm',96:'Thunderstorm + hail',99:'Severe thunderstorm'};
async function fetchWeatherFor(o){
  if(!o.place || !o.date){ toast('Set a place and a date first'); return; }
  const days = Math.round((new Date(o.date) - new Date().setHours(0,0,0,0)) / 86400000);
  if(days < 0){ toast('That date is in the past'); return; }
  if(days > 15){ toast('Forecasts reach ~16 days ahead \u2014 fetch again closer to the date'); return; }
  toast('Fetching forecast\u2026');
  try{
    const g = await (await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=nl&name=' +
      encodeURIComponent(o.place))).json();
    const hit = g.results && g.results[0];
    if(!hit){ toast('Place not found \u2014 try a bigger town nearby'); return; }
    const q = 'https://api.open-meteo.com/v1/forecast?latitude=' + hit.latitude +
      '&longitude=' + hit.longitude +
      '&daily=weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset' +
      '&timezone=auto&start_date=' + o.date + '&end_date=' + o.date;
    const w = await (await fetch(q)).json();
    const d = w.daily;
    if(!d || !d.time || !d.time.length){ toast('No forecast returned for that date'); return; }
    const hhmm = t => (t||'').split('T')[1] || '';
    o.place = hit.name + (hit.admin1 ? ', ' + hit.admin1 : '');
    o.data = [
      ['Forecast', WMO[d.weather_code[0]] || ('code ' + d.weather_code[0])],
      ['Temp', Math.round(d.temperature_2m_min[0]) + '\u2013' + Math.round(d.temperature_2m_max[0]) + ' \u00b0C'],
      ['Rain chance', (d.precipitation_probability_max[0] ?? '\u2014') + ' %'],
      ['Wind', toBft(d.wind_speed_10m_max[0]) + ' Bft'],
      ['Sun', hhmm(d.sunrise[0]) + ' \u2192 ' + hhmm(d.sunset[0])],
    ];
    markDirty(); render(); refreshSelBar();
    toast('Forecast loaded');
  }catch(e){
    console.warn('weather fetch failed', e);
    toast('Could not reach the weather service');
  }
}

// bare forecast for a known lat/lon + date (the call sheet's auto-weather)
async function fetchDailyForecast(lat, lon, dateStr){
  const days = Math.round((new Date(dateStr) - new Date().setHours(0,0,0,0)) / 864e5);
  if(days < 0 || days > 15) return null; // outside the ~16-day forecast window
  try{
    const q = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&daily=weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max,wind_speed_10m_max' +
      '&timezone=auto&start_date=' + dateStr + '&end_date=' + dateStr;
    const w = await (await fetch(q)).json();
    const d = w.daily;
    if(!d || !d.time || !d.time.length) return null;
    return [
      ['Forecast', WMO[d.weather_code[0]] || ('code ' + d.weather_code[0])],
      ['Temp', Math.round(d.temperature_2m_min[0]) + '–' + Math.round(d.temperature_2m_max[0]) + ' °C'],
      ['Rain chance', (d.precipitation_probability_max[0] ?? '—') + ' %'],
      ['Wind', toBft(d.wind_speed_10m_max[0]) + ' Bft'],
    ];
  }catch(e){ return null; }
}
// the call sheet fetches its own weather from the day header's place + date;
// cached on the card under a key so render() can call this freely
async function callsheetWeather(o, day){
  const key = day.date + '@' + (+day.lat).toFixed(2) + ',' + (+day.lon).toFixed(2);
  if(o._wxBusy || (o.wx && o.wx.key === key)) return;
  o._wxBusy = true;
  try{
    const data = await fetchDailyForecast(day.lat, day.lon, day.date);
    o.wx = {key, date:day.date, place:day.place || '', data};
    markDirty(); render();
  } finally { o._wxBusy = false; }
}

// email addresses on the call sheet — all groups, or one tag
function sheetEmails(o, tag){
  normalizeProduction();
  const inc = o.inc || {};
  const tags = tag ? [tag] : ['crew','cast','client'].filter(t=>inc[t] !== false);
  return [...new Set(peopleReg()
    .filter(p=>tags.includes(p.tag) && /\S+@\S+\.\S+/.test(p.email || ''))
    .map(p=>p.email.trim()))];
}
async function copySheetEmails(o){
  const ems = sheetEmails(o);
  if(!ems.length){ toast('No email addresses in the registry yet'); return; }
  try{ await navigator.clipboard.writeText(ems.join(', ')); toast(ems.length + ' addresses copied'); }
  catch(_){ prompt('Email addresses:', ems.join(', ')); }
}
// plain-text call sheet for the mail body (attachments need the PDF export)
function callSheetText(o){
  const b = project.prodboard;
  const allD = boardDays();
  const multi = !!o.allDays && allD.length > 1;
  const dayList = multi ? allD : [dayFor(o)];
  const L = [];
  L.push((project.shootName || 'PRODUCTION').toUpperCase() + ' — CALL SHEET' +
    (multi ? ' — ALL DAYS' : ''));
  const P = project.production || {};
  if(P.company || P.email || P.phone)
    L.push([P.company, P.email, P.phone].filter(Boolean).join(' · '));
  for(const day of dayList){
    if(!day) continue;
    if(multi){
      L.push('');
      L.push('══ SHOOT DAY ' + dayNumber(day) +
        (day.date ? ' — ' + new Date(day.date + 'T12:00:00').toLocaleDateString('nl-NL',
          {weekday:'long', day:'numeric', month:'long'}) : '') + ' ══');
    } else if(day.date){
      L.push(new Date(day.date + 'T12:00:00').toLocaleDateString('nl-NL',
        {weekday:'long', day:'numeric', month:'long', year:'numeric'}));
    }
    L.push('General call ' + (day.call || '–') + ' · shooting call ' + (day.shootCall || '–') +
      ' · est. wrap ' + (day.wrap || '–'));
    const assigned = dayLocs(day);
    const locs = assigned.length ? assigned
      : project.production.locations.filter(l=>l.name || l.street || l.town || l.address);
    if(locs.length){
      L.push('');
      L.push(locs.length > 1 ? (assigned.length > 1 ? 'LOCATIONS (in order):' : 'LOCATIONS:') : 'LOCATION:');
      locs.forEach((loc, li)=>{
        L.push('  ' + (assigned.length > 1 ? (li+1) + '. ' : '') +
          [loc.name, loc.street, loc.town, loc.country].filter(Boolean).join(', '));
        if(loc.parking) L.push('  Parking: ' + loc.parking);
        if(loc.hospital) L.push('  Hospital: ' + loc.hospital);
      });
    }
    const scheds = b ? b.objects.filter(x=>x.cat==='schedule') : [];
    const schd = scheds.find(x=>dayFor(x) === day) || (multi ? null : scheds[0]);
    const cs2 = computeSchedule(schd || {}, day);
    const rows = [];
    if(schd) for(const r of cs2.rows){
      if(r.it.on === false || r.start == null) continue;
      rows.push(minToHHMM(r.start) + '  ' + r.label + (r.it.type !== 'scene' ? ' (' + r.dur + 'm)' : ''));
    }
    if(rows.length){
      L.push(''); L.push('SCHEDULE:'); L.push(...rows);
      L.push('Est. wrap ' + ((day && day.wrap) || cs2.wrap));
    }
  }
  const day = dayList[0]; // props/people/weather below are day-independent
  if(!(o.inc && o.inc.props === false)){
    const plc = b && b.objects.find(x=>x.cat==='proplist');
    const gs = propListGroups(plc || {props:{}, hide:{}, done:{}}).filter(g=>g.rows.length);
    if(gs.length){
      L.push(''); L.push('PROPS:');
      for(const g of gs){
        L.push('  ' + plSceneHead(g.s));
        for(const r of g.rows) L.push('    - ' + r.name + (r.count > 1 ? ' ×' + r.count : ''));
      }
    }
  }
  const ppl = tag => peopleReg().filter(p=>p.tag === tag);
  for(const [tag, name] of [['crew','CREW'],['cast','CAST'],['client','CLIENT']]){
    if(o.inc && o.inc[tag] === false) continue;
    const list = ppl(tag);
    if(!list.length) continue;
    L.push(''); L.push(name + ':');
    for(const p of list)
      L.push('  ' + [p.call, p.role, p.name, p.phone, p.email].filter(Boolean).join(' · '));
  }
  if(o.wx && o.wx.data){
    L.push(''); L.push('WEATHER (' + (o.wx.place || '') + '):');
    for(const [k, v] of o.wx.data) L.push('  ' + k + ': ' + v);
  }
  L.push(''); L.push('— sent from FLOOR Studio');
  return L.join('\n');
}
function mailCallSheet(o, tag){
  const ems = sheetEmails(o, tag);
  const who = tag || 'everyone';
  if(!ems.length){
    toast('No ' + who + ' email addresses yet — add them on the registry cards');
    return;
  }
  // the PDF downloads alongside the draft — newest file, ready to drag in
  // (browsers cannot attach files to mailto:; "Share PDF…" attaches for real)
  try{ exportCallSheetPDF(o); }catch(e){ console.warn('pdf for mail failed', e); }
  const day = dayFor(o);
  const subject = 'Call sheet — ' + (project.shootName || 'production') +
    (day && day.date ? ' — ' + day.date : '');
  let body = callSheetText(o);
  if(body.length > 1600) body = body.slice(0, 1600) + '\n…'; // mailto URL limits
  setTimeout(()=>{
    location.href = 'mailto:?bcc=' + encodeURIComponent(ems.join(',')) +
      '&subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    toast('Mail to ' + who + ' (' + ems.length + ' BCC) — the PDF just downloaded, drag it into the draft');
  }, 350);
}
// real attachment via the OS share sheet (Mail on macOS/iPadOS) where supported
async function shareCallSheetPDF(o){
  const {bytes, name} = buildCallSheetPDF(o);
  const file = new File([bytes], name, {type:'application/pdf'});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{
      await navigator.share({files:[file], title:name});
      return;
    }catch(e){ if(e.name === 'AbortError') return; }
  }
  // no share sheet on this browser — fall back to a download
  exportCallSheetPDF(o);
  toast('Sharing not supported here — PDF downloaded instead');
}

// one-page call-sheet PDF: the card rendered alone, A4 portrait
function buildCallSheetPDF(o){
  render(); // fresh self-sizing
  const scale = 3;
  const c = document.createElement('canvas');
  c.width = Math.ceil(o.w*scale); c.height = Math.ceil(o.h*scale);
  const prevCtx = ctx, prevSel = sel;
  ctx = c.getContext('2d');
  sel = null; // no selection chrome in print
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.setTransform(scale, 0, 0, scale, (o.w/2 - o.x)*scale, (o.h/2 - o.y)*scale);
  try{ drawObject(o); }
  finally { ctx = prevCtx; sel = prevSel; render(); }
  const jpeg = atob(c.toDataURL('image/jpeg', .92).split(',')[1]);
  const PW = 595, PH = 842, M = 36; // A4 portrait
  const maxW = PW - M*2, maxH = PH - M*2;
  const k = Math.min(maxW/c.width, maxH/c.height);
  const iw = c.width*k, ih = c.height*k;
  const ix = (PW - iw)/2, iy = PH - M - ih; // top-aligned under the margin
  const content = 'q ' + iw.toFixed(2) + ' 0 0 ' + ih.toFixed(2) + ' ' + ix.toFixed(2) + ' ' + iy.toFixed(2) +
    ' cm /Im1 Do Q';
  // clickable phone / mail / maps links: the renderer left card-local rects in
  // o._csLinks — map them through the same transform into PDF Link annotations
  const annots = (o._csLinks || []).map(L=>{
    const px = v => ix + ((v + o.w/2) * scale / c.width) * iw;         // card x → pdf x
    const py = v => iy + ih - ((v + o.h/2) * scale / c.height) * ih;   // card y → pdf y (flipped)
    const rect = [px(L.x), py(L.y + L.h), px(L.x + L.w), py(L.y)];
    const uri = String(L.u).replace(/([\\()])/g, '\\$1');
    return '<< /Type /Annot /Subtype /Link /Rect [' + rect.map(v=>v.toFixed(2)).join(' ') +
      '] /Border [0 0 0] /A << /S /URI /URI (' + uri + ') >> >>';
  });
  const annotRefs = annots.map((_, i)=>(6 + i) + ' 0 R').join(' ');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] ' +
      '/Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R' +
      (annots.length ? ' /Annots [' + annotRefs + ']' : '') + ' >>',
    '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream',
    '<< /Type /XObject /Subtype /Image /Width ' + c.width + ' /Height ' + c.height +
      ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length +
      ' >>\nstream\n' + jpeg + '\nendstream',
    ...annots,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objs.forEach((obj, i)=>{
    offsets.push(pdf.length);
    pdf += (i+1) + ' 0 obj\n' + obj + '\nendobj\n';
  });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objs.length+1) + '\n0000000000 65535 f \n';
  for(let i=1;i<=objs.length;i++) pdf += String(offsets[i]).padStart(10,'0') + ' 00000 n \n';
  pdf += 'trailer\n<< /Size ' + (objs.length+1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  const bytes = new Uint8Array(pdf.length);
  for(let i=0;i<pdf.length;i++) bytes[i] = pdf.charCodeAt(i) & 0xFF;
  const csDay = dayFor(o);
  const name = ((project.shootName || 'production').replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'_') || 'production') +
    '_callsheet' + (o.allDays ? '_all-days' : (csDay && csDay.date ? '_' + csDay.date : '')) + '.pdf';
  return {bytes, name};
}
function exportCallSheetPDF(o){
  const {bytes, name} = buildCallSheetPDF(o);
  const a = document.createElement('a');
  a.download = name;
  a.href = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'}));
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
  toast('Call sheet PDF exported');
}

// ---------------------------------------------------------------- pdf.js (lazy, self-hosted)
let _pdfjsReady = null;
function loadPdfJs(){
  if(window.pdfjsLib) return Promise.resolve();
  if(_pdfjsReady) return _pdfjsReady;
  _pdfjsReady = new Promise((ok, bad)=>{
    const sc = document.createElement('script');
    sc.src = './js/vendor/pdf.min.js';
    sc.onload = ()=>{
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = './js/vendor/pdf.worker.min.js';
      ok();
    };
    sc.onerror = ()=>bad(new Error('pdf.js failed to load'));
    document.head.appendChild(sc);
  });
  return _pdfjsReady;
}
async function extractPdfText(file){
  await loadPdfJs();
  const buf = await file.arrayBuffer();
  const doc = await window.pdfjsLib.getDocument({data:buf}).promise;
  const out = [];
  for(let p=1; p<=doc.numPages; p++){
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let lastY = null, line = [];
    for(const it of tc.items){
      const y = Math.round(it.transform[5]);
      if(lastY !== null && Math.abs(y - lastY) > 3){
        out.push(line.join(''));
        line = [];
      }
      line.push(it.str);
      lastY = y;
    }
    out.push(line.join(''));
    out.push('');
  }
  return out.join('\n');
}
async function pdfFirstPageThumb(file){
  await loadPdfJs();
  const buf = await file.arrayBuffer();
  const doc = await window.pdfjsLib.getDocument({data:buf}).promise;
  const page = await doc.getPage(1);
  const vp0 = page.getViewport({scale:1});
  const scale = 420 / vp0.width;
  const vp = page.getViewport({scale});
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  await page.render({canvasContext:c.getContext('2d'), viewport:vp}).promise;
  return c.toDataURL('image/jpeg', .8);
}

// import a script file straight into a script block (.txt / .fountain / .fdx / .pdf)
function importIntoScriptBlock(o){
  const fi = document.createElement('input');
  fi.type = 'file'; fi.accept = '.txt,.fountain,.fdx,.pdf';
  fi.addEventListener('change', async ()=>{
    const file = fi.files && fi.files[0];
    if(!file) return;
    let text;
    try{
      if(file.name.toLowerCase().endsWith('.pdf')){
        toast('Reading PDF\u2026');
        text = await extractPdfText(file);
      } else {
        text = await file.text();
        if(file.name.toLowerCase().endsWith('.fdx')){
          const doc = new DOMParser().parseFromString(text, 'text/xml');
          text = [...doc.querySelectorAll('Paragraph')].map(p=>{
            const t = [...p.querySelectorAll('Text')].map(x=>x.textContent).join('');
            return (p.getAttribute('Type') === 'Scene Heading') ? t.toUpperCase() : t;
          }).join('\n');
        }
      }
    }catch(e){
      console.warn('script import failed', e);
      toast('Could not read that file');
      return;
    }
    o.text = text;
    markDirty(); render();
    toast('Script imported \u2014 hit "Break down" when ready');
  });
  fi.click();
}

// ---------------------------------------------------------------- audio on boards
let audioEl = null, audioPlayingId = null;
async function toggleAudio(o){
  if(audioPlayingId === o.id){
    if(audioEl) audioEl.pause();
    audioPlayingId = null;
    render();
    return;
  }
  try{
    const r = await window.storage.get('sd:file:' + o.fileId);
    if(!r || !r.value){ toast('Audio data not found'); return; }
    if(!audioEl){
      audioEl = new Audio();
      audioEl.addEventListener('ended', ()=>{ audioPlayingId = null; render(); });
    }
    audioEl.src = r.value;
    await audioEl.play();
    audioPlayingId = o.id;
    render();
  }catch(e){
    console.warn('audio play failed', e);
    toast('Could not play that file');
  }
}
async function addBoardAudioAt(file, x, y){
  if(file.size > 8*1024*1024){ toast('Audio up to ~8 MB \u2014 this one is too large'); return; }
  try{
    const dataURL = await new Promise((ok, bad)=>{
      const r = new FileReader();
      r.onload = ()=>ok(r.result); r.onerror = ()=>bad(r.error);
      r.readAsDataURL(file);
    });
    const id = uid();
    await window.storage.set('sd:file:' + id, dataURL);
    activeScene().objects.push({id:uid(), cat:'audio', kind:'audio',
      x, y, rot:0, w:280, h:60,
      fileId:id, name:file.name, size:file.size,
      color:'#8B5CF6', label:'', path:[]});
    markDirty(); render();
    toast('Audio added \u2014 tap \u25b8 to play');
  }catch(e){ toast('Could not store that audio file'); }
}
function pickBoardAudio(){
  const fi = document.createElement('input');
  fi.type = 'file'; fi.accept = 'audio/*,.mp3,.aac,.m4a,.wav,.ogg,.flac';
  fi.addEventListener('change', ()=>{
    if(!fi.files || !fi.files[0]) return;
    const c = toWorld(wrap.clientWidth/2, wrap.clientHeight/2);
    addBoardAudioAt(fi.files[0], c.x, c.y);
  });
  fi.click();
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
  // every project is born with an empty "Scene 1" — if it's still untouched,
  // the first detected scene takes its place so numbering starts at 1
  const pristine = s => !s.objects.length && !s.walls.length && !s.stills.length &&
    !s.script && !s.scene && !s.sceneDesc && !(s.shots || []).length &&
    /^Scene \d+$/.test(s.name || '');
  const reusable = (project.scenes.length === 1 && pristine(project.scenes[0]))
    ? project.scenes[0] : null;
  const startN = reusable ? 0 : project.scenes.length;
  parsed.forEach((s, i)=>{
    let sc;
    if(i === 0 && reusable){
      sc = reusable;
    } else {
      sc = newShot(startN + i + 1);
      project.scenes.push(sc);
    }
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
async function addBoardFileAt(file, x, y){
  if(file.size > 4.5*1024*1024){ toast('Files up to ~4 MB \u2014 this one is too large'); return; }
  try{
    const dataURL = await new Promise((ok, bad)=>{
      const r = new FileReader();
      r.onload = ()=>ok(r.result); r.onerror = ()=>bad(r.error);
      r.readAsDataURL(file);
    });
    const id = uid();
    await window.storage.set('sd:file:' + id, dataURL);
    const obj = {id:uid(), cat:'file', kind:'file',
      x, y, rot:0, w:230, h:64,
      fileId:id, name:file.name, size:file.size, mime:file.type,
      color:'#5B6472', label:'', path:[]};
    activeScene().objects.push(obj);
    markDirty(); render();
    toast('File added \u2014 select it to download');
    // PDFs get a first-page preview
    if((file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))){
      try{
        const thumbURL = await pdfFirstPageThumb(file);
        const tid = uid();
        await window.storage.set('sd:img:' + tid, thumbURL);
        const im = new Image();
        im.src = thumbURL;
        imgCache[tid] = im;
        im.onload = ()=>render();
        obj.imgId = tid;
        obj.w = 190; obj.h = 250;
        markDirty(); render();
      }catch(e){ console.warn('pdf thumb failed', e); }
    }
  }catch(e){ toast('Could not store that file'); }
}
function pickBoardFile(){
  const fi = document.createElement('input');
  fi.type = 'file';
  fi.addEventListener('change', ()=>{
    if(!fi.files || !fi.files[0]) return;
    const c = toWorld(wrap.clientWidth/2, wrap.clientHeight/2);
    addBoardFileAt(fi.files[0], c.x, c.y);
  });
  fi.click();
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


// ---------------------------------------------------------------- .floorproj export / import
// One JSON file = the whole production, images and files included. Backup +
// "send a frozen copy" — the cheap rung of the sharing ladder.
function collectAssetIds(){
  const img = new Set(), file = new Set();
  const scanObjs = objs=>(objs||[]).forEach(ob=>{
    if(ob.imgId) img.add(ob.imgId);
    if(ob.fileId) file.add(ob.fileId);
    if(ob.cat === 'subboard' && ob.board){ // boards within boards count too
      scanObjs(ob.board.objects);
      (ob.board.stills||[]).forEach(id=>img.add(id));
    }
  });
  const scan = s=>{
    if(!s) return;
    scanObjs(s.objects);
    (s.setups||[]).forEach(su=>scanObjs(su.objects)); // inactive setups count too
    (s.stills||[]).forEach(id=>img.add(id));
  };
  project.scenes.forEach(scan);
  scan(project.moodboard); scan(project.prodboard); scan(project.scriptboard);
  if(project.production && project.production.logo) img.add(project.production.logo);
  return {img:[...img], file:[...file]};
}
async function collectAssets(){
  const ids = collectAssetIds();
  const assets = {img:{}, file:{}};
  for(const id of ids.img){
    const r = await window.storage.get('sd:img:' + id).catch(()=>null);
    if(r && r.value) assets.img[id] = r.value;
  }
  for(const id of ids.file){
    const r = await window.storage.get('sd:file:' + id).catch(()=>null);
    if(r && r.value) assets.file[id] = r.value;
  }
  return assets;
}
async function exportFloorproj(){
  toast('Packing production…');
  try{
    await saveProject();
    const assets = await collectAssets();
    const pack = {floorproj:1, exported:new Date().toISOString(),
      name:project.shootName || 'production', project, assets};
    const blob = new Blob([JSON.stringify(pack)], {type:'application/json'});
    const a = document.createElement('a');
    a.download = (project.shootName || 'production').replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'_') + '.floorproj';
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
    toast('Exported — images and files travel inside the file');
  }catch(e){
    console.error('floorproj export failed', e);
    toast('Export failed — see the console');
  }
}
async function importFloorproj(f){
  toast('Reading ' + f.name + '…');
  try{
    const pack = JSON.parse(await f.text());
    if(!pack.floorproj || !pack.project || !pack.project.scenes) throw new Error('not a floorproj');
    for(const [k,v] of Object.entries((pack.assets && pack.assets.img) || {}))
      await window.storage.set('sd:img:' + k, v);
    for(const [k,v] of Object.entries((pack.assets && pack.assets.file) || {}))
      await window.storage.set('sd:file:' + k, v);
    const id = uid();
    await window.storage.set('sd:project:' + id, JSON.stringify(pack.project));
    const idx = (await loadProjectIndex()) || [];
    idx.push({id, name:(pack.project.shootName || pack.name || 'Imported production'), updated:Date.now()});
    await saveProjectIndex(idx);
    await window.storage.set('sd:current', id);
    location.reload();
  }catch(e){
    console.error('floorproj import failed', e);
    toast('Could not import — is that a .floorproj file?');
  }
}

// merge another production INTO the current one: its scenes (fresh ids,
// active setup only), assets, its BOARD content (mood / script&storyboard /
// production — AV cards, sticky notes, storyboard rows, day headers, …,
// offset to the right of what's already there), and any people / locations /
// custom props we don't already have. Cross-references are remapped: sbrows
// and schedule rows point at the MERGED scenes, location cards and day
// headers at the merged locations, schedule/call-sheet day bindings at the
// merged day headers. Production info fields stay untouched.
async function mergeFloorproj(f){
  toast('Reading ' + f.name + '…');
  try{
    const pack = JSON.parse(await f.text());
    if(!pack.floorproj || !pack.project || !pack.project.scenes) throw new Error('not a floorproj');
    for(const [k,v] of Object.entries((pack.assets && pack.assets.img) || {}))
      await window.storage.set('sd:img:' + k, v);
    for(const [k,v] of Object.entries((pack.assets && pack.assets.file) || {}))
      await window.storage.set('sd:file:' + k, v);
    normalizeProduction();
    const sceneMap = {}, locMap = {};
    let nScenes = 0;
    for(const src of pack.project.scenes){
      const s = JSON.parse(JSON.stringify(src));
      migrateShot(s);
      sceneMap[src.id] = s.id = uid();
      s.setups = null; s.setupId = null; // the merge takes each scene's ACTIVE setup
      s.walls.forEach(w=>{ w.id = uid(); (w.openings||[]).forEach(op=>op.id = uid()); });
      const map = {};
      s.objects.forEach(ob=>{ const nid = uid(); map[ob.id] = nid; ob.id = nid; });
      s.objects.forEach(ob=>{
        if(ob.mount && map[ob.mount.id]) ob.mount.id = map[ob.mount.id];
        if(ob.rail && map[ob.rail.id]) ob.rail.id = map[ob.rail.id];
      });
      project.scenes.push(s);
      nScenes++;
    }
    const P = project.production, Q = (pack.project.production || {});
    let nPeople = 0, nLocs = 0;
    for(const p of (Q.people || [])){
      if(!p.name) continue;
      if(P.people.some(x=>x.name.toLowerCase() === p.name.toLowerCase() && x.tag === p.tag)) continue;
      P.people.push({...p, id:uid()});
      nPeople++;
    }
    for(const l of (Q.locations || [])){
      const nm = (l.name || l.street || '').toLowerCase();
      if(!nm) continue;
      const dupe = P.locations.find(x=>(x.name || x.street || '').toLowerCase() === nm);
      if(dupe){ locMap[l.id] = dupe.id; continue; }
      const nid = uid();
      locMap[l.id] = nid;
      P.locations.push({...l, id:nid});
      nLocs++;
    }
    for(const cp of (pack.project.customProps || [])){
      if(!(project.customProps || []).some(x=>x.name === cp.name))
        project.customProps.push({...cp, id:uid()});
    }
    // ---- board content: AV cards, notes, sbrows, day headers, cards, ink… ----
    const remapSceneKeys = m=>{
      const out = {};
      for(const k in m){
        const bar = k.indexOf('|');
        const sid = bar > -1 ? k.slice(0, bar) : k;
        out[(sceneMap[sid] || sid) + (bar > -1 ? k.slice(bar) : '')] = m[k];
      }
      return out;
    };
    const mergeBoard = (src, dst)=>{
      if(!src || (!(src.objects||[]).length && !(src.walls||[]).length)) return 0;
      // land the merged content to the RIGHT of what's already on the board
      let dx = 0;
      if((dst.objects||[]).length && (src.objects||[]).length){
        const maxX = Math.max(...dst.objects.map(o=>o.x + (o.w||0)/2));
        const minX = Math.min(...src.objects.map(o=>o.x - (o.w||0)/2));
        dx = Math.round(maxX + 260 - minX);
      }
      const idMap = {};
      const objs = JSON.parse(JSON.stringify(src.objects || []));
      objs.forEach(ob=>{ const nid = uid(); idMap[ob.id] = nid; ob.id = nid; });
      for(const ob of objs){
        ob.x += dx;
        if(ob.p1){ ob.p1.x += dx; } if(ob.p2){ ob.p2.x += dx; } if(ob.mid){ ob.mid.x += dx; }
        if(Array.isArray(ob.pts)) ob.pts.forEach(p=>{ p.x += dx; });          // ink / track
        if(Array.isArray(ob.path)) ob.path.forEach(p=>{ if(p.x != null) p.x += dx; });
        if(ob.mount && idMap[ob.mount.id]) ob.mount.id = idMap[ob.mount.id];
        if(ob.rail && idMap[ob.rail.id]) ob.rail.id = idMap[ob.rail.id];
        if(ob.sceneId) ob.sceneId = sceneMap[ob.sceneId] || ob.sceneId;       // storyboard rows
        if(ob.locId) ob.locId = locMap[ob.locId] || ob.locId;                 // location field cards
        if(Array.isArray(ob.locIds)) ob.locIds = ob.locIds.map(i=>locMap[i] || i); // day headers
        if(ob.dayId) ob.dayId = idMap[ob.dayId] || ob.dayId;                  // schedule / call-sheet day binding
        if(Array.isArray(ob.items))                                           // schedule rows
          ob.items.forEach(it=>{ if(it.sceneId) it.sceneId = sceneMap[it.sceneId] || it.sceneId; });
        if(ob.props && (ob.cat === 'proplist' || ob.cat === 'gearlist')){     // prop / gear lists
          const np = {};
          for(const k in ob.props) np[sceneMap[k] || k] = ob.props[k];
          ob.props = np;
          if(ob.hide) ob.hide = remapSceneKeys(ob.hide);
          if(ob.done) ob.done = remapSceneKeys(ob.done);
        }
        dst.objects.push(ob);
      }
      for(const w of JSON.parse(JSON.stringify(src.walls || []))){
        w.id = uid(); (w.openings||[]).forEach(op=>op.id = uid());
        w.x1 += dx; w.x2 += dx; if(w.mid) w.mid.x += dx;
        dst.walls.push(w);
      }
      return objs.length;
    };
    let nBoard = 0;
    if(pack.project.moodboard){ ensureMoodboard(); nBoard += mergeBoard(pack.project.moodboard, project.moodboard); }
    if(pack.project.scriptboard){ ensureScriptBoard(); nBoard += mergeBoard(pack.project.scriptboard, project.scriptboard); }
    if(pack.project.prodboard){ ensureProdBoard(); nBoard += mergeBoard(pack.project.prodboard, project.prodboard); }
    markDirty();
    buildShotList(); buildLibrary(); buildInfo(); render();
    toast('Merged ' + nScenes + ' scene' + (nScenes===1?'':'s') +
      (nBoard ? ', ' + nBoard + ' board item' + (nBoard===1?'':'s') : '') +
      (nPeople ? ', ' + nPeople + ' people' : '') +
      (nLocs ? ', ' + nLocs + ' location' + (nLocs===1?'':'s') : '') +
      ' from "' + (pack.project.shootName || pack.name || f.name) + '"');
  }catch(e){
    console.error('floorproj merge failed', e);
    toast('Could not merge — is that a .floorproj file?');
  }
}

// ---------------------------------------------------------------- AV script card: import + breakdown
// paste an AV script copied from Excel / Google Sheets (tab-separated
// columns) or any "VIDEO ⇥ AUDIO" text into the row-based AV card
function avPasteOverlay(o){
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:210;background:rgba(40,38,32,.35);' +
    'display:flex;align-items:center;justify-content:center;font-family:-apple-system,Segoe UI,sans-serif;';
  el.innerHTML = `
    <div style="background:#fff;border:1px solid #E5E3DE;border-radius:16px;padding:24px 28px;
                width:520px;max-width:92vw;box-shadow:0 18px 60px rgba(40,38,32,.2)">
      <div style="font-weight:600;font-size:15px">Paste AV script rows</div>
      <div style="color:#8A877F;font-size:12px;margin:6px 0 10px;line-height:1.5">
        Copy the rows from Excel / Google Sheets (or tab-separated text) and paste below.
        Columns: <b>VIDEO ⇥ AUDIO</b> — or start with a header row naming the columns,
        and an optional first column with a time like <b>0:30</b>.
      </div>
      <textarea id="avPasteTa" rows="10" spellcheck="false"
        style="width:100%;border:1px solid #E5E3DE;border-radius:8px;padding:10px;
               font:12px ui-monospace,Menlo,monospace;box-sizing:border-box"></textarea>
      <label style="display:flex;gap:7px;align-items:center;font-size:12px;color:#4A4636;margin-top:8px;cursor:pointer">
        <input id="avPasteSwap" type="checkbox"> First column is AUDIO (swap the two)
      </label>
      <div id="avPasteMsg" style="color:#8A877F;font-size:12px;margin-top:8px;min-height:15px"></div>
      <div style="display:flex;gap:8px;margin-top:6px">
        <button id="avPasteGo" style="flex:1;background:#4B6BFB;color:#fff;border:none;border-radius:8px;
          padding:10px;font-size:13px;font-weight:600;cursor:pointer">Import rows</button>
        <button id="avPasteNo" style="flex:0 0 90px;background:#fff;border:1px solid #E5E3DE;
          border-radius:8px;padding:10px;font-size:13px;cursor:pointer">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#avPasteNo').addEventListener('click', ()=>el.remove());
  el.addEventListener('pointerdown', e=>{ if(e.target === el) el.remove(); });
  el.querySelector('#avPasteTa').focus();
  el.querySelector('#avPasteGo').addEventListener('click', ()=>{
    const txt = el.querySelector('#avPasteTa').value;
    let lines = txt.split(/\r?\n/).map(l=>l.replace(/\s+$/,'')).filter(l=>l.trim());
    if(!lines.length){ el.querySelector('#avPasteMsg').textContent = 'Nothing to import yet.'; return; }
    const isTime = c => /^\d{1,2}[:.]\d{2}$/.test(c.trim()) || /^\d{1,3}\s?s?$/.test(c.trim());
    let vFirst = !el.querySelector('#avPasteSwap').checked;
    // header row names the columns? derive the order from it and skip it
    const head = lines[0].toLowerCase();
    if(/audio/.test(head) && /video|beeld/.test(head)){
      const cells0 = lines[0].toLowerCase().split('\t');
      const vi = cells0.findIndex(c=>/video|beeld/.test(c));
      const ai = cells0.findIndex(c=>/audio/.test(c));
      if(vi > -1 && ai > -1) vFirst = vi < ai;
      lines = lines.slice(1);
    }
    const made = [];
    for(const line of lines){
      let cells = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}|\s\|\s/);
      cells = cells.map(c=>c.trim());
      let time = '';
      if(cells.length > 1 && isTime(cells[0])) time = cells.shift();
      const a = cells.length > 1 ? (vFirst ? cells[1] : cells[0]) : '';
      const v = cells.length > 1 ? (vFirst ? cells[0] : cells[1]) : cells[0] || '';
      if(!a && !v) continue;
      made.push({id:uid(), no:'', time, audio:a, video:v, notes:'', imgId:null});
    }
    if(!made.length){ el.querySelector('#avPasteMsg').textContent = 'Could not find any rows in that.'; return; }
    // pristine starter rows get replaced; otherwise the import appends
    const blank = r=>!((r.no||'')+(r.time||'')+(r.audio||'')+(r.video||'')+(r.notes||'')).trim();
    if((o.rows||[]).every(blank)) o.rows = made;
    else o.rows = o.rows.concat(made);
    markDirty(); render(); refreshSelBar();
    el.remove();
    toast(made.length + ' AV row' + (made.length===1?'':'s') + ' imported');
  });
}

// break the AV card down into SCENES — every row (beat) becomes a scene board
// in the Shot designer, exactly like the film-script breakdown
function breakDownAvCard(o){
  const rows = (o.rows||[]).filter(r=>(r.audio||'').trim() || (r.video||'').trim());
  if(!rows.length){ toast('No filled rows on this AV script yet'); return; }
  const durMin = t=>{
    t = String(t||'').trim();
    if(!t) return 0;
    const m = t.match(/^(\d{1,2})[:.](\d{2})$/);
    if(m) return Math.max(1, Math.ceil((+m[1] + +m[2]/60)));
    const n = parseInt(t, 10);
    return n ? Math.max(1, Math.ceil(n/60)) : 0; // bare number = seconds
  };
  const parsed = rows.map((r, i)=>({
    heading: (r.video || r.audio).split('\n')[0].slice(0, 60),
    intExt:'', dayNight:'', characters:[],
    body: [r.video && 'VIDEO: ' + r.video, r.audio && 'AUDIO: ' + r.audio,
           r.notes && 'NOTES: ' + r.notes].filter(Boolean).join('\n'),
  }));
  const scenes = createScenesFromBreakdown(parsed);
  scenes.forEach((sc, i)=>{
    const d = durMin(rows[i].time);
    if(d) sc.duration = d;
  });
  // storyboard rows to the right of the card, like the script-block breakdown
  const board = activeScene();
  const x0 = o.x + o.w/2 + 340;
  let y = o.y - o.h/2 + 60;
  scenes.forEach((sc, i)=>{
    board.objects.push({id:uid(), cat:'sbrow', kind:'sbrow',
      x:x0, y:y + i*140, rot:0, w:560, h:120,
      title:(sc.scene ? 'Scene ' + sc.scene : sc.name) + (sc.sceneDesc ? ' — ' + sc.sceneDesc : ''),
      desc:'', imgId:null, sceneId:sc.id,
      color:COLORS[i % COLORS.length], label:'', path:[]});
  });
  markDirty(); render(); refreshSelBar();
  toast(scenes.length + ' scene' + (scenes.length===1?'':'s') +
    ' broken down from the AV script — each beat has its own board now');
}

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
  pop.innerHTML = '<div class="xp-title">This production</div>';
  const nameIn = document.createElement('input');
  nameIn.className = 'proj-name';
  nameIn.placeholder = 'Name this production\u2026';
  nameIn.value = project.shootName || '';
  nameIn.addEventListener('input', ()=>{
    project.shootName = nameIn.value;
    markDirty(); syncProjBtn();
    const el0 = document.getElementById('iShoot');
    if(el0) el0.value = nameIn.value;
  });
  nameIn.addEventListener('keydown', e=>{ if(e.key==='Enter') nameIn.blur(); e.stopPropagation(); });
  pop.appendChild(nameIn);
  const st = document.createElement('div');
  st.style.cssText = 'font-size:10px;color:var(--ink2);margin:4px 2px 10px;';
  st.textContent = 'Autosaves as you work \u2014 switch below at any time.';
  pop.appendChild(st);
  pop.insertAdjacentHTML('beforeend', '<div class="xp-title">All productions</div>');
  idx.forEach(p=>{
    const row = document.createElement('button');
    row.className = 'proj-row' + (p.id === currentProjectId ? ' on' : '');
    const isShared = p.shared || (window.FLOOR_SHARED && window.FLOOR_SHARED.has(p.id));
    row.textContent = (p.name || 'Untitled production') + (isShared ? '  ⇄' : '');
    if(isShared) row.title = 'Shared production — co-editors work on the same data';
    row.addEventListener('click', async ()=>{
      if(p.id === currentProjectId){ pop.classList.remove('show'); return; }
      await flushSave();
      await window.storage.set('sd:current', p.id);
      location.reload();
    });
    pop.appendChild(row);
  });
  // ---- .floorproj: backup / "send a frozen copy" ----
  const exRow = document.createElement('div');
  exRow.style.cssText = 'display:flex;gap:6px;margin-top:10px;';
  const exB = document.createElement('button');
  exB.className = 'btn'; exB.style.flex = '1';
  exB.textContent = 'Export .floorproj';
  exB.addEventListener('click', ()=>exportFloorproj());
  const imB = document.createElement('button');
  imB.className = 'btn'; imB.style.flex = '1';
  imB.textContent = 'Import…';
  imB.addEventListener('click', ()=>{
    const fi = document.createElement('input');
    fi.type = 'file'; fi.accept = '.floorproj,application/json';
    fi.addEventListener('change', ()=>{ if(fi.files && fi.files[0]) importFloorproj(fi.files[0]); });
    fi.click();
  });
  exRow.appendChild(exB); exRow.appendChild(imB);
  pop.appendChild(exRow);
  const mgB = document.createElement('button');
  mgB.className = 'btn';
  mgB.style.cssText = 'width:100%;margin-top:6px;';
  mgB.textContent = 'Merge .floorproj into current…';
  mgB.title = 'Append another production’s scenes, people and locations to THIS one';
  mgB.addEventListener('click', ()=>{
    pop.classList.remove('show');
    const fi = document.createElement('input');
    fi.type = 'file'; fi.accept = '.floorproj,application/json';
    fi.addEventListener('change', ()=>{ if(fi.files && fi.files[0]) mergeFloorproj(fi.files[0]); });
    fi.click();
  });
  pop.appendChild(mgB);

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
    const curShared = window.FLOOR_SHARED && window.FLOOR_SHARED.has(currentProjectId);
    const curRole = curShared ? window.FLOOR_SHARED.get(currentProjectId).role : null;
    del.textContent = curShared && curRole !== 'owner'
      ? 'Leave this shared production\u2026'
      : 'Delete current production\u2026';
    del.addEventListener('click', async ()=>{
      if(curShared && curRole !== 'owner'){
        // editor: leave \u2014 the production keeps existing for everyone else
        if(!confirm('Leave "' + (project.shootName || 'this production') + '"? You can rejoin with a new invite.')) return;
        await window.FLOOR_SB.from('production_members').delete()
          .eq('production_id', currentProjectId).eq('user_id', window.FLOOR_USER.id);
      } else {
        const warn = curShared
          ? 'Delete "' + (project.shootName || 'Untitled production') + '" permanently FOR ALL CO-EDITORS? This cannot be undone.'
          : 'Delete "' + (project.shootName || 'Untitled production') + '" permanently? This cannot be undone.';
        if(!confirm(warn)) return;
        if(curShared) await window.FLOOR_SB.from('productions').delete().eq('id', currentProjectId);
        await window.storage.delete('sd:project:' + currentProjectId).catch(()=>{});
      }
      const idx2 = ((await loadProjectIndex()) || []).filter(p=>p.id !== currentProjectId);
      await saveProjectIndex(idx2);
      await window.storage.set('sd:current', idx2[0].id);
      location.reload();
    });
    pop.appendChild(del);
  }
  // account & privacy — profile, data export, sign out, delete account (cloud mode only)
  if(window.FLOOR_ACCOUNT){
    const acc = document.createElement('button');
    acc.className = 'btn';
    acc.style.cssText = 'width:100%;margin-top:6px;';
    acc.textContent = 'Account & privacy…';
    acc.addEventListener('click', ()=>{
      pop.classList.remove('show');
      window.FLOOR_ACCOUNT.open();
    });
    pop.appendChild(acc);
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
