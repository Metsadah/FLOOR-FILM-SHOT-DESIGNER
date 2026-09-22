// Floorboard — 12-media.js · media on the board
// 1. A DOM "media layer" over the canvas: animated GIFs and playing videos
//    can't be drawn frame-by-frame with drawImage, so an <img>/<video> rides
//    on top of the board, positioned with the same view transform every
//    render (pointer-events:none — the canvas keeps every hit).
// 2. Video cards: an image object with videoId (poster = imgId) + ▸ Play.
// 3. The "+ Media" toolbar button: photos, GIFs, video, audio, PDFs, files.
// 4. Import script… (file → scenes, AV tables included) next to Write script….
'use strict';
const GIF_MAX = 3 * 1024 * 1024;        // GIFs are stored untouched (re-encoding kills the animation)
const VIDEO_MAX = 4.5 * 1024 * 1024;    // same ceiling as file cards (cloud rows have limits)
let _mediaLayer = null;
const _mediaEls = {};                   // object id → {el, kind, src}
const _videoSrc = {};                   // videoId → dataURL (loaded once)

function mediaLayer(){
  if(_mediaLayer) return _mediaLayer;
  const wrap = document.getElementById('canvasWrap');
  if(!wrap) return null;
  _mediaLayer = document.createElement('div');
  _mediaLayer.id = 'mediaLayer';
  wrap.insertBefore(_mediaLayer, wrap.querySelector('#toolbar'));
  return _mediaLayer;
}
function isGifImg(im){ return !!(im && im.src && im.src.startsWith('data:image/gif')); }
// keep <img>/<video> elements in step with the board — called after every render
function syncMediaLayer(){
  const layer = mediaLayer();
  if(!layer) return;
  const want = {};
  const board = (typeof activeScene === 'function') ? activeScene() : null;
  const objs = (board && !window.VIEW_ONLY_EXPORT) ? (board.objects || []) : [];
  const W = cv.clientWidth, H = cv.clientHeight;
  for(const o of objs){
    if(o.cat !== 'image') continue;
    const im = imgCache[o.imgId];
    const gif = isGifImg(im);
    const vid = o.videoId && o.playing;
    if(!gif && !vid) continue;
    const p = toScreen(o.x, o.y);
    const sw = o.w * view.scale, sh = o.h * view.scale;
    if(p.x + sw/2 < 0 || p.y + sh/2 < 0 || p.x - sw/2 > W || p.y - sh/2 > H) continue; // off-screen
    want[o.id] = 1;
    let m = _mediaEls[o.id];
    const kind = vid ? 'video' : 'gif';
    if(m && m.kind !== kind){ m.el.remove(); m = null; delete _mediaEls[o.id]; }
    if(!m){
      let el;
      if(kind === 'gif'){ el = document.createElement('img'); el.src = im.src; }
      else {
        el = document.createElement('video');
        el.muted = !!o.muted; el.loop = true; el.playsInline = true; el.setAttribute('playsinline', '');
        // autoplay with sound is blocked outside a tap — fall back to muted rather than silent failure
        const tryPlay = ()=>el.play().catch(()=>{ el.muted = true; o.muted = true; el.play().catch(()=>{}); if(typeof refreshSelBar === 'function') refreshSelBar(); });
        const src = _videoSrc[o.videoId];
        if(src){ el.src = src; tryPlay(); }
        else loadVideoSrc(o.videoId).then(s=>{ if(s && _mediaEls[o.id] && _mediaEls[o.id].el === el){ el.src = s; tryPlay(); } });
      }
      el.className = 'media-el';
      layer.appendChild(el);
      m = _mediaEls[o.id] = {el, kind};
    }
    const el = m.el;
    el.style.width = sw + 'px'; el.style.height = sh + 'px';
    el.style.transform = `translate(${(p.x - sw/2).toFixed(1)}px, ${(p.y - sh/2).toFixed(1)}px) rotate(${o.rot || 0}rad)`;
    el.style.opacity = o.underlay ? .55 : 1;
    if(kind === 'video') el.muted = !!o.muted;
  }
  for(const id in _mediaEls) if(!want[id]){ _mediaEls[id].el.remove(); delete _mediaEls[id]; }
}
async function loadVideoSrc(videoId){
  if(_videoSrc[videoId]) return _videoSrc[videoId];
  try{
    const r = await window.storage.get('sd:file:' + videoId);
    if(r && r.value){ _videoSrc[videoId] = r.value; return r.value; }
  }catch(_){}
  return null;
}
// render() gains the layer sync — every caller (drags, zoom, tab switches) comes through here
(function(){
  const render0 = render;
  render = function(){ const r = render0.apply(this, arguments); try{ syncMediaLayer(); }catch(_){} return r; };
})();
document.addEventListener('floor-theme-changed', ()=>syncMediaLayer());

// ---------------------------------------------------------------- GIF / video ingest
// GIF: keep the bytes (downscale() would flatten it to one JPEG frame)
async function storeGifFile(file){
  if(file.size > GIF_MAX) return null; // caller falls back to a still
  const dataURL = await new Promise((ok, bad)=>{ const r = new FileReader(); r.onload = ()=>ok(r.result); r.onerror = ()=>bad(r.error); r.readAsDataURL(file); });
  const id = uid();
  await window.storage.set('sd:img:' + id, dataURL);
  const img = new Image(); img.src = dataURL;
  await img.decode().catch(()=>{});
  imgCache[id] = img;
  return id;
}
function videoPoster(file){ // first frame ~0.4s in → JPEG dataURL + aspect
  return new Promise((ok, bad)=>{
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    const url = URL.createObjectURL(file);
    const done = ()=>{
      try{
        const k = Math.min(1, 800 / Math.max(v.videoWidth, v.videoHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(v.videoWidth * k)); c.height = Math.max(1, Math.round(v.videoHeight * k));
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        ok({dataURL:c.toDataURL('image/jpeg', .8), ar:v.videoHeight / v.videoWidth || .5625});
      }catch(e){ bad(e); }
      URL.revokeObjectURL(url);
    };
    v.onloadeddata = ()=>{ try{ v.currentTime = Math.min(0.4, (v.duration || 1) / 2); }catch(_){ done(); } };
    v.onseeked = done;
    v.onerror = ()=>{ URL.revokeObjectURL(url); bad(new Error('video decode failed')); };
    v.src = url;
    setTimeout(()=>bad(new Error('video poster timeout')), 8000);
  });
}
async function addBoardVideoAt(file, x, y){
  if(file.size > VIDEO_MAX){
    toast('Videos up to ~4 MB live on the board — for this one, add a Link card to where it is hosted');
    return;
  }
  try{
    const dataURL = await new Promise((ok, bad)=>{ const r = new FileReader(); r.onload = ()=>ok(r.result); r.onerror = ()=>bad(r.error); r.readAsDataURL(file); });
    const videoId = uid();
    await window.storage.set('sd:file:' + videoId, dataURL);
    _videoSrc[videoId] = dataURL;
    let poster = null;
    try{ poster = await videoPoster(file); }catch(e){ console.warn('poster failed', e); }
    let imgId = null, ar = poster ? poster.ar : .5625;
    if(poster){
      imgId = uid();
      await window.storage.set('sd:img:' + imgId, poster.dataURL);
      const im = new Image(); im.src = poster.dataURL; await im.decode().catch(()=>{}); imgCache[imgId] = im;
    }
    const o = {id:uid(), cat:'image', kind:'image', imgId, videoId, name:file.name, mime:file.type, size:file.size,
      x, y, rot:0, w:320, h:320 * ar, color:'#5B6472', label:'', path:[], playing:false, muted:false};
    activeScene().objects.push(o);
    sel = {type:'object', id:o.id};
    if(typeof setTool === 'function') setTool('select');
    markDirty(); render(); refreshSelBar();
    toast('Video on the board — ▸ Play in the selection bar');
  }catch(e){
    console.error('video failed', e);
    toast('Could not store that video — ' + (e.message || e));
  }
}
function toggleBoardVideo(o){
  o.playing = !o.playing;
  render(); refreshSelBar();
}

// ---------------------------------------------------------------- + Media button
function addMediaFromPicker(){
  const fi = document.createElement('input');
  fi.type = 'file'; fi.multiple = true;
  fi.accept = 'image/*,video/*,audio/*,application/pdf,.pdf,.gif,.mp4,.mov,.m4v,.webm,.mp3,.m4a,.wav,.aac,.txt,.md,.csv,.docx,.xlsx,.key,.pages';
  fi.addEventListener('change', async ()=>{
    const files = [...(fi.files || [])];
    if(!files.length) return;
    // drop them around the middle of the view
    const c = toWorld(cv.clientWidth / 2, cv.clientHeight / 2);
    if(typeof addFilesAt === 'function') await addFilesAt(files, c.x - 30 * (files.length - 1), c.y - 30 * (files.length - 1));
  });
  fi.click();
}

// ---------------------------------------------------------------- Import script… (file → scenes)
// A screenplay (.txt/.fountain/.fdx/.pdf) becomes scenes by its headings; a
// tab- or semicolon-separated AV table (.tsv/.csv/.txt from Excel/Sheets)
// becomes an AV script card on the 1st floor AND scenes by its SC numbers.
function avRowsFromTable(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  if(lines.length < 2) return null;
  const sep = lines[0].includes('\t') ? '\t' : (lines[0].split(';').length > 2 ? ';' : (lines[0].split(',').length > 2 ? ',' : null));
  if(!sep) return null;
  const head = lines[0].toLowerCase().split(sep).map(s=>s.trim().replace(/^"|"$/g, ''));
  const col = (...names)=>head.findIndex(h=>names.some(n=>h === n || h.startsWith(n)));
  const iNo = col('sc', 'scene', 'nr', '#'), iVideo = col('video', 'beeld', 'visual', 'see'), iAudio = col('audio', 'geluid', 'sound', 'tekst', 'vo', 'hear'),
        iDur = col('sec', 'time', 'dur', 'tijd'), iNotes = col('note', 'regie', 'remark', 'opmerking');
  if(iVideo < 0 && iAudio < 0) return null; // not an AV table
  const rows = [];
  for(const line of lines.slice(1)){
    const cells = line.split(sep).map(s=>s.trim().replace(/^"|"$/g, ''));
    const r = {id:uid(), no:iNo >= 0 ? cells[iNo] || '' : '', video:iVideo >= 0 ? cells[iVideo] || '' : '', audio:iAudio >= 0 ? cells[iAudio] || '' : '',
      dur:iDur >= 0 ? cells[iDur] || '' : '', notes:iNotes >= 0 ? cells[iNotes] || '' : '', imgs:[]};
    if(r.video || r.audio || r.no) rows.push(r);
  }
  return rows.length ? rows : null;
}
function importScriptFile(){
  const fi = document.createElement('input');
  fi.type = 'file';
  fi.accept = '.txt,.fountain,.fdx,.pdf,.tsv,.csv,text/plain,application/pdf,text/tab-separated-values,text/csv';
  fi.addEventListener('change', async ()=>{
    const f = fi.files && fi.files[0]; if(!f) return;
    toast('Reading ' + f.name + '…');
    let text = '';
    try{ text = /\.pdf$/i.test(f.name) ? await extractPdfText(f) : await f.text(); }
    catch(e){ toast('Could not read that file: ' + (e.message || e)); return; }
    if(!text || !text.trim()){ toast('No text found in ' + f.name); return; }
    const film = f.name.replace(/\.[^.]+$/, '');
    const avRows = /\.(tsv|csv)$/i.test(f.name) || text.split('\n').slice(0, 3).every(l=>l.includes('\t')) ? avRowsFromTable(text) : null;
    if(avRows){
      ensureScriptBoard();
      const b = project.scriptboard;
      const below = b.objects.reduce((m, o)=>Math.max(m, o.y + (o.h || 0) / 2), 0);
      const card = {id:uid(), cat:'avscript', kind:'avscript', x:0, y:below + 200, rot:0, w:560, h:150, color:'#8B5CF6',
        label:film, cols:{no:true, still:false, notes:avRows.some(r=>r.notes)}, rows:avRows};
      b.objects.push(card);
      const n = typeof breakDownAvCard === 'function' ? breakDownAvCard(card) : 0;
      markDirty(); if(typeof buildShotList === 'function') buildShotList(); if(typeof buildInfo === 'function') buildInfo(); render();
      toast('AV script "' + film + '" imported — ' + avRows.length + ' rows' + (project.scenes.length ? ', scenes updated by SC number' : ''));
      return;
    }
    const parsed = parseScreenplay(text);
    if(!parsed.length){ toast('No scene headings found — lines like INT. KITCHEN — DAY start a scene. Use Write script… to paste and fix it.'); return; }
    const scenes = createScenesFromBreakdown(parsed);
    scenes.forEach(sc=>{ sc.film = film; sc.filmSrc = 'script:' + film; });
    markDirty(); buildShotList(); buildInfo();
    if(scenes[0]) switchShot(scenes[0].id);
    toast(scenes.length + ' scene' + (scenes.length === 1 ? '' : 's') + ' from "' + film + '" — pick one on the left');
  });
  fi.click();
}
// wiring (buttons live in the topbar; CSS decides where they show)
(function(){
  const imp = document.getElementById('importScriptBtn');
  const wr = document.getElementById('writeScriptBtn');
  const md = document.getElementById('mediaBtn');
  if(imp) imp.addEventListener('click', importScriptFile);
  if(wr) wr.addEventListener('click', ()=>loadScriptOverlay());
  if(md) md.addEventListener('click', addMediaFromPicker);
})();
