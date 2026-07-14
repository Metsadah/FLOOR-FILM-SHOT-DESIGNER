// FLOOR — 04-ui.js
// Extracted from the original single-file build. All files share global scope
// (loaded as classic scripts, in order). True ES modules come with the build step later.
'use strict';
// ---------------------------------------------------------------- selection bar
const selBar = document.getElementById('selBar');
const CAM_TYPES = [['cam_std','Standard'],['cam_steadi','Steadicam'],['cam_gimbal','Gimbal'],['cam_gopro','GoPro / crash'],['cam_drone','Drone']];
// things that plausibly move during a shot: vehicles + grip & stage lights (not furniture, tech, set dressing, outdoor)
const MOVE_KINDS = new Set(['bicycle','motorcycle','car','car_small','car_suv','car_police','minivan','bus',
  'cstand','light','kino','ledpanel','fresnel','hmi','tube','bounce','negfill','flag','reflector','dolly','jib','technocrane','monitor','camcart']);
function canMove(o){
  return o.cat === 'camera' || o.cat === 'actor' || (o.cat === 'prop' && MOVE_KINDS.has(o.kind));
}

async function fetchLinkThumb(o){
  const tu = videoThumbUrl(o.url);
  if(!tu){
    o.imgId = null; markDirty(); render();
    return;
  }
  try{
    const res = await fetch(tu, {mode:'cors'});
    if(!res.ok) throw new Error('http ' + res.status);
    const blob = await res.blob();
    const dataURL = await new Promise((ok, bad)=>{
      const r = new FileReader();
      r.onload = ()=>ok(r.result); r.onerror = ()=>bad(r.error);
      r.readAsDataURL(blob);
    });
    const id = uid();
    await window.storage.set('sd:img:' + id, dataURL);
    const im = new Image();
    im.src = dataURL;
    imgCache[id] = im;
    im.onload = ()=>render();
    o.imgId = id;
    o.w = Math.max(o.w, 180); // renderer keeps the preview square
    markDirty(); render(); refreshSelBar();
    toast('Video thumbnail added');
  }catch(e){
    console.warn('thumb fetch failed', e);
    // preview is a bonus — the plain pill still works
  }
}
function sbtn(label, fn, danger){
  const b = document.createElement('button');
  b.className = 'sbtn' + (danger ? ' danger' : '');
  b.textContent = label;
  b.addEventListener('click', fn);
  selBar.appendChild(b);
  return b;
}
function vsep(){ selBar.insertAdjacentHTML('beforeend','<div class="vsep"></div>'); }

function refreshSelBar(){
  selBar.innerHTML = '';
  if(!sel){ selBar.classList.remove('show'); return; }
  const shot = activeShot();

  if(sel.type === 'sun'){
    const su = shot.sun;
    if(!su || !su.on){ sel=null; selBar.classList.remove('show'); return; }
    const lab = document.createElement('span');
    lab.style.cssText='font-size:11.5px;color:var(--ink2);padding:0 4px;';
    lab.textContent = 'Sun · time of day';
    selBar.appendChild(lab);
    const tm = document.createElement('input');
    tm.type='time'; tm.step=900; tm.value = formatHour(su.hour);
    tm.style.cssText='border:1px solid var(--border);border-radius:7px;padding:3px 6px;font-size:11.5px;';
    tm.addEventListener('change', ()=>{
      const m = tm.value.split(':');
      if(m.length===2){ su.hour = clamp((+m[0]) + (+m[1])/60, 4, 22); markDirty(); render(); }
    });
    tm.addEventListener('keydown', e=>e.stopPropagation());
    selBar.appendChild(tm);
    vsep();
    sbtn('Hide sun', ()=>{ su.on=false; sel=null; markDirty(); syncSunBtn(); render(); refreshSelBar(); }, true);
    selBar.classList.add('show');
    updateSelBarPos();
    return;
  }

  if(sel.type === 'multi'){
    const lab = document.createElement('span');
    lab.style.cssText = 'font-size:11.5px;color:var(--ink2);padding:0 6px;font-weight:600;';
    const nW = (sel.wallIds || []).length;
    lab.textContent = (sel.ids.length + nW) + ' selected' + (nW ? ' (incl. ' + nW + ' walls)' : '') +
      ' — drag to move, ⌘C to copy';
    selBar.appendChild(lab);
    sbtn('Duplicate', duplicateSelection);
    sbtn('Delete all', deleteSelection, true);
    selBar.classList.add('show');
    updateSelBarPos();
    return;
  }

  if(sel.type === 'object'){
    const o = shot.objects.find(x=>x.id===sel.id);
    if(!o){ sel=null; selBar.classList.remove('show'); return; }
    if(o.locked){
      const info=document.createElement('span');
      info.style.cssText='font-size:11.5px;color:var(--ink2);padding:0 4px;';
      info.textContent='\ud83d\udd12 Locked';
      selBar.appendChild(info);
      sbtn('Unlock', ()=>{ o.locked=false; markDirty(); render(); refreshSelBar(); });
      selBar.classList.add('show'); updateSelBarPos();
      return;
    }
    // no swatches where recoloring changes nothing on canvas
    const colorless = ['image','infocard','colorcard','script','fieldcard'].includes(o.cat) ||
                      (o.cat === 'prop' && o.kind === 'negfill');
    if(!colorless){
      for(const c of COLORS){
        const sw = document.createElement('button');
        sw.className = 'sw' + (o.color===c ? ' on' : '');
        sw.style.background = c;
        sw.addEventListener('click', ()=>{ o.color=c; markDirty(); render(); refreshSelBar(); });
        selBar.appendChild(sw);
      }
      vsep();
    }

    if(o.cat === 'image'){
      sbtn(o.underlay ? 'Underlay: on' : 'Underlay: off', ()=>{
        o.underlay = !o.underlay; markDirty(); render(); refreshSelBar();
      });
    }

    if(o.cat === 'note' || o.cat === 'text'){
      const bB = sbtn('B', ()=>{ o.bold=!o.bold; markDirty(); render(); positionNoteEditor(); refreshSelBar(); });
      bB.style.fontWeight='800';
      if(o.bold){ bB.style.background='var(--accent-soft)'; bB.style.color='var(--accent)'; }
      const bI = sbtn('I', ()=>{ o.italic=!o.italic; markDirty(); render(); positionNoteEditor(); refreshSelBar(); });
      bI.style.fontStyle='italic';
      if(o.italic){ bI.style.background='var(--accent-soft)'; bI.style.color='var(--accent)'; }
      const sz = document.createElement('select');
      sz.title = 'Text size';
      for(const f of [11,13,15,18,22,28,36]) sz.insertAdjacentHTML('beforeend', `<option value="${f}">${f}px</option>`);
      sz.value = o.fontSize || (o.cat==='text' ? 18 : 13);
      sz.addEventListener('change', ()=>{ o.fontSize=+sz.value; markDirty(); render(); positionNoteEditor(); });
      selBar.appendChild(sz);
    }
    if(o.cat === 'line'){
      const wsel = document.createElement('select');
      wsel.title = 'Line weight';
      for(const [v,n] of [[1.5,'Thin'],[2.5,'Regular'],[4,'Medium'],[6,'Bold'],[9,'Heavy']])
        wsel.insertAdjacentHTML('beforeend', `<option value="${v}">${n}</option>`);
      wsel.value = o.weight || 2.5;
      wsel.addEventListener('change', ()=>{ o.weight=+wsel.value; markDirty(); render(); });
      selBar.appendChild(wsel);
      sbtn(o.dashed ? 'Dash: on' : 'Dash: off', ()=>{ o.dashed=!o.dashed; markDirty(); render(); refreshSelBar(); });
      sbtn(o.arrow ? 'Arrow: on' : 'Arrow: off', ()=>{ o.arrow=!o.arrow; markDirty(); render(); refreshSelBar(); });
      if(o.mid) sbtn('Straighten', ()=>{ o.mid=null; markDirty(); render(); refreshSelBar(); });
    }
    if(o.cat === 'ink'){
      const wsel = document.createElement('select');
      wsel.title = 'Stroke weight';
      for(const v of [2,3,5,8,12]) wsel.insertAdjacentHTML('beforeend', `<option value="${v}">${v}px</option>`);
      wsel.value = o.weight || 3;
      wsel.addEventListener('change', ()=>{ o.weight=+wsel.value; inkWeight=+wsel.value; markDirty(); render(); });
      selBar.appendChild(wsel);
    }
    if(o.cat === 'link'){
      const url = document.createElement('input');
      url.className = 'lbl'; url.style.width = '170px';
      url.placeholder = 'https://…';
      url.value = o.url || '';
      url.addEventListener('input', ()=>{
        o.url = url.value.trim();
        markDirty(); render();
        clearTimeout(o._thumbT);
        o._thumbT = setTimeout(()=>fetchLinkThumb(o), 650); // preview fetches itself
      });
      url.addEventListener('keydown', e=>{ if(e.key==='Enter') url.blur(); e.stopPropagation(); });
      selBar.appendChild(url);
      sbtn('Open \u2197', ()=>{
        if(o.url) window.open(/^https?:\/\//i.test(o.url) ? o.url : 'https://'+o.url, '_blank');
        else toast('Add a URL first');
      });
    }

    if(o.cat === 'image' && !o.underlay){
      const cap = document.createElement('input');
      cap.className = 'lbl'; cap.style.width = '150px';
      cap.placeholder = 'Caption\u2026';
      cap.value = o.caption || '';
      cap.addEventListener('input', ()=>{ o.caption = cap.value; markDirty(); render(); });
      cap.addEventListener('keydown', e=>{ if(e.key==='Enter') cap.blur(); e.stopPropagation(); });
      selBar.appendChild(cap);
    }
    if(o.cat === 'colorcard'){
      // the full picker (color wheel on macOS/iPadOS) + the hex field, synced
      const expand = h => /^#[0-9a-f]{3}$/i.test(h)
        ? '#' + h[1]+h[1] + h[2]+h[2] + h[3]+h[3] : h;
      const pick = document.createElement('input');
      pick.type = 'color';
      pick.title = 'Pick any color';
      pick.value = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(o.hex||'') ? expand(o.hex) : '#E8604C';
      pick.style.cssText = 'width:34px;height:26px;border:1px solid var(--border);' +
        'border-radius:2px;padding:1px;background:#fff;cursor:pointer;';
      selBar.appendChild(pick);
      const hx = document.createElement('input');
      hx.className = 'lbl'; hx.style.width = '84px';
      hx.placeholder = '#RRGGBB';
      hx.value = o.hex || '';
      pick.addEventListener('input', ()=>{
        o.hex = pick.value;
        hx.value = pick.value;
        markDirty(); render();
      });
      hx.addEventListener('input', ()=>{
        let v = hx.value.trim();
        if(v && !v.startsWith('#')) v = '#' + v;
        if(/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)){
          o.hex = v;
          pick.value = expand(v);
          markDirty(); render();
        }
      });
      hx.addEventListener('keydown', e=>{ if(e.key==='Enter') hx.blur(); e.stopPropagation(); });
      selBar.appendChild(hx);
    }
    if(o.cat === 'todo'){
      sbtn('+ Item', ()=>{
        o.items = o.items || [];
        o.items.push({t:'', done:false});
        markDirty(); render();
        openTodoItem(o, o.items.length-1);
      });
      sbtn('Edit as text', ()=>openNoteEditor(o, 'todo'));
    }
    if(o.cat === 'table'){
      sbtn('\u2212 Row', ()=>{ if(o.cells.length>2){ o.cells.pop(); markDirty(); render(); } });
      sbtn('\u2212 Col', ()=>{ if(o.cells[0].length>1){ o.cells.forEach(r=>r.pop()); markDirty(); render(); } });
      const hint = document.createElement('span');
      hint.style.cssText='font-size:10.5px;color:var(--ink2);padding:0 4px;';
      hint.textContent = 'Drag the corner handle to add/remove rows & cols \u00b7 Tab/Enter hop cells';
      selBar.appendChild(hint);
    }
    if(o.cat === 'prop' && (o.kind === 'stairs' || o.kind === 'stairs_curved')){
      sbtn(o.kind === 'stairs_curved' ? 'Curved: on' : 'Curved: off', ()=>{
        const sc = o.w / PROPS[o.kind].w; // keep the current scale
        o.kind = o.kind === 'stairs' ? 'stairs_curved' : 'stairs';
        o.w = PROPS[o.kind].w * sc;
        o.h = PROPS[o.kind].h * sc;
        markDirty(); render(); refreshSelBar();
      });
    }
    if(o.cat === 'prop' && LIGHT_BEAMS[o.kind]){
      sbtn(o.beam === false ? 'Beam: off' : 'Beam: on', ()=>{
        o.beam = o.beam === false;
        markDirty(); render(); refreshSelBar();
      });
      if(o.beam !== false && !LIGHT_BEAMS[o.kind].omni){
        if(o.beamSpread || o.beamRange)
          sbtn('Reset beam', ()=>{ o.beamSpread = null; o.beamRange = null; markDirty(); render(); refreshSelBar(); });
        const bh = document.createElement('span');
        bh.style.cssText='font-size:10.5px;color:var(--ink2);padding:0 4px;';
        bh.textContent = 'Drag the amber handles to shape the beam';
        selBar.appendChild(bh);
      }
    }
    if(o.cat === 'listcard'){
      sbtn('+ Person', ()=>addListPerson(o));
      sbtn('Paste list\u2026', ()=>showPasteImport(o));
      const hint = document.createElement('span');
      hint.style.cssText='font-size:10.5px;color:var(--ink2);padding:0 4px;';
      hint.textContent = 'Live view of the People registry \u2014 edits sync across cards';
      selBar.appendChild(hint);
    }
    if(o.cat === 'fieldcard'){
      const hint = document.createElement('span');
      hint.style.cssText='font-size:10.5px;color:var(--ink2);padding:0 4px;';
      hint.textContent = o.kind === 'prodinfo'
        ? 'Live view of the production info \u2014 Tab hops fields'
        : 'One location from the production \u2014 Tab hops fields';
      selBar.appendChild(hint);
    }
    if(o.cat === 'callsheet'){
      if(!o.inc) o.inc = {location:true, schedule:true, crew:true, cast:true, client:true, weather:true};
      sbtn('Export PDF ↓', ()=>exportCallSheetPDF(o));
      sbtn('Mail crew ✉', ()=>mailCallSheet(o));
      sbtn('Copy emails', ()=>copySheetEmails(o));
      for(const [key, lab] of [['location','Location'],['schedule','Schedule'],['crew','Crew'],
                               ['cast','Cast'],['client','Client'],['weather','Weather']]){
        sbtn((o.inc[key] ? '✓ ' : '') + lab, ()=>{
          o.inc[key] = !o.inc[key];
          markDirty(); render(); refreshSelBar();
        });
      }
      sbtn('Weather ↻', ()=>{ o.wx = null; markDirty(); render(); });
    }
    if(o.cat === 'schedule'){
      sbtn('+ Break', ()=>addSchedBlock(o, 'break'));
      sbtn('+ Location change', ()=>addSchedBlock(o, 'move'));
      sbtn('+ Prep', ()=>addSchedBlock(o, 'prep'));
      const hint = document.createElement('span');
      hint.style.cssText = 'font-size:10.5px;color:var(--ink2);padding:0 4px;';
      hint.textContent = 'Drag rows to reorder · click a time to pin it · click a name to rename';
      selBar.appendChild(hint);
    }
    if(o.cat === 'avscript'){
      sbtn('+ Row', ()=>addAvRow(o));
      o.cols = o.cols || {no:false, still:false, notes:false};
      const tgl = (label, key)=>sbtn((o.cols[key] ? '✓ ' : '') + label, ()=>{
        o.cols[key] = !o.cols[key];
        markDirty(); render(); refreshSelBar();
      });
      tgl('Scene #', 'no');
      tgl('Stills', 'still');
      tgl('Notes', 'notes');
      const hint = document.createElement('span');
      hint.style.cssText = 'font-size:10.5px;color:var(--ink2);padding:0 4px;';
      hint.textContent = 'Click a cell to write · Tab hops cells · Enter = new line';
      selBar.appendChild(hint);
    }
    if(o.cat === 'dayheader'){
      const dt = document.createElement('input');
      dt.type = 'date'; dt.className = 'lbl'; dt.style.width = '130px';
      dt.value = o.date || '';
      dt.addEventListener('change', ()=>{ o.date = dt.value; markDirty(); render(); });
      dt.addEventListener('keydown', e=>e.stopPropagation());
      selBar.appendChild(dt);
      sbtn('Sun from location \u21bb', ()=>dayheaderSunFetch(o));
      const hint = document.createElement('span');
      hint.style.cssText='font-size:10.5px;color:var(--ink2);padding:0 4px;';
      hint.textContent = 'Click the times to edit \u2014 Tab hops call \u2192 wrap';
      selBar.appendChild(hint);
    }
    if(o.cat === 'audio'){
      sbtn('\u25b8 Play / stop', ()=>{ if(typeof toggleAudio==='function') toggleAudio(o); });
      sbtn('Download', async ()=>{
        try{
          const r = await window.storage.get('sd:file:' + o.fileId);
          if(!r || !r.value){ toast('Audio data not found'); return; }
          const blob = await (await fetch(r.value)).blob();
          const a = document.createElement('a');
          a.download = o.name || 'audio';
          a.href = URL.createObjectURL(blob);
          a.click();
          setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
        }catch(e){ toast('Could not read the audio file'); }
      });
    }
    if(o.cat === 'file'){
      sbtn('Download', async ()=>{
        try{
          const r = await window.storage.get('sd:file:' + o.fileId);
          if(!r || !r.value){ toast('File data not found'); return; }
          const blob = await (await fetch(r.value)).blob();
          const a = document.createElement('a');
          a.download = o.name || 'file';
          a.href = URL.createObjectURL(blob);
          a.click();
          setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
        }catch(e){ toast('Could not read the file'); }
      });
    }
    if(o.cat === 'weather'){
      const pl = document.createElement('input');
      pl.className='lbl'; pl.style.width='120px';
      pl.placeholder='Place (e.g. Elburg)';
      pl.value = o.place || '';
      pl.addEventListener('input', ()=>{ o.place = pl.value; markDirty(); render(); });
      pl.addEventListener('keydown', e=>{ if(e.key==='Enter') pl.blur(); e.stopPropagation(); });
      selBar.appendChild(pl);
      const dt = document.createElement('input');
      dt.type='date'; dt.className='lbl'; dt.style.width='130px';
      dt.value = o.date || '';
      dt.addEventListener('change', ()=>{ o.date = dt.value; markDirty(); render(); });
      selBar.appendChild(dt);
      sbtn('Fetch \u21bb', ()=>fetchWeatherFor(o));
    }
    if(o.cat === 'script'){
      sbtn('Import\u2026', ()=>importIntoScriptBlock(o));
      sbtn('Break down', ()=>breakDownScriptBlock(o));
      sbtn('Export .txt', ()=>{
        const text = o.mode==='av'
          ? 'VIDEO\n\n' + (o.text||'') + '\n\nAUDIO\n\n' + (o.textR||'')
          : (o.text||'');
        if(!text.trim()){ toast('Nothing to export yet'); return; }
        const a = document.createElement('a');
        a.download = 'script.txt';
        a.href = URL.createObjectURL(new Blob([text], {type:'text/plain'}));
        a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
      });
    }
    if(o.cat === 'sbrow'){
      sbtn('+ Row below', ()=>addSbRowBelow(o));
      const sc0 = o.sceneId && project.scenes.find(x=>x.id===o.sceneId);
      if(sc0){
        sbtn('Open scene \u2197', ()=>{ switchShot(sc0.id); switchTab('design'); });
      } else {
        sbtn('Create scene board', ()=>{
          const sc = newShot(project.scenes.length + 1);
          sc.name = o.title || ('Scene ' + (project.scenes.length + 1));
          sc.sceneDesc = '';
          project.scenes.push(sc);
          o.sceneId = sc.id;
          markDirty(); buildShotList(); refreshSelBar(); render();
          toast('Scene board created \u2014 every camera you place on it maps to a shot');
        });
      }
      sbtn(o.imgId ? 'Replace image\u2026' : 'Add image\u2026', ()=>pickSbImage(o));
      if(o.imgId) sbtn('Remove image', ()=>{ o.imgId = null; markDirty(); render(); refreshSelBar(); });
    }

    if(o.kind === 'track'){
      sbtn('+ Track point', ()=>{
        const pts = o.pts;
        const a = pts[pts.length-2], b = pts[pts.length-1];
        const ang = Math.atan2(b.y-a.y, b.x-a.x);
        pts.push({x:b.x+Math.cos(ang)*180, y:b.y+Math.sin(ang)*180});
        trackCentroid(o);
        markDirty(); render(); refreshSelBar();
      });
      if(o.pts.length > 2)
        sbtn('– Point', ()=>{ o.pts.pop(); trackCentroid(o); markDirty(); render(); refreshSelBar(); });
      const hint = document.createElement('span');
      hint.style.cssText='font-size:10.5px;color:var(--ink2);padding:0 4px;';
      hint.textContent = 'Drop a camera on an end to snap it on';
      selBar.appendChild(hint);
      vsep();
      sbtn('Duplicate', duplicateSelection);
      sbtn('Delete', deleteSelection, true);
      selBar.classList.add('show');
      updateSelBarPos();
      return;
    }

    if(o.cat === 'camera'){
      const typ = document.createElement('select');
      typ.title = 'Camera type';
      for(const [v,n] of CAM_TYPES) typ.insertAdjacentHTML('beforeend', `<option value="${v}">${n}</option>`);
      typ.value = CAMS[o.kind] ? o.kind : 'cam_std';
      typ.addEventListener('change', ()=>{
        o.kind = typ.value;
        o.w = CAMS[o.kind].w; o.h = CAMS[o.kind].h;
        markDirty(); render();
      });
      selBar.appendChild(typ);
      const lens = document.createElement('select');
      lens.title = 'Lens preset (full frame)';
      lens.insertAdjacentHTML('beforeend', `<option value="">Lens: custom</option>`);
      for(const f of LENSES) lens.insertAdjacentHTML('beforeend', `<option value="${f}">${f} mm</option>`);
      lens.value = o.lens || '';
      lens.addEventListener('change', ()=>{
        if(lens.value){ o.lens = +lens.value; o.fov = fovForLens(o.lens); }
        else o.lens = null;
        markDirty(); render();
      });
      selBar.appendChild(lens);
      const shSel = document.createElement('select');
      shSel.title = 'Which shot this camera films';
      shSel.insertAdjacentHTML('beforeend', `<option value="">\u2014 shot\u2026</option>`);
      (shot.shots||[]).forEach(sh=>{
        shSel.insertAdjacentHTML('beforeend',
          `<option value="${sh.id}">${esc(sh.name||'Shot')}</option>`);
      });
      shSel.insertAdjacentHTML('beforeend', `<option value="__new">+ New shot\u2026</option>`);
      shSel.value = (shot.shots||[]).some(x=>x.id===o.shotId) ? o.shotId : '';
      shSel.addEventListener('change', ()=>{
        if(shSel.value === '__new'){
          const sh = addShotEntity(o.label ? o.label : undefined);
          o.shotId = sh.id;
        } else {
          o.shotId = shSel.value || null;
        }
        markDirty(); buildShotEnts(); refreshSelBar();
      });
      selBar.appendChild(shSel);
      const frm = document.createElement('select');
      frm.title = 'Framing';
      for(const f of FRAMINGS) frm.insertAdjacentHTML('beforeend', `<option value="${f}">${f||'Framing…'}</option>`);
      frm.value = o.framing || '';
      frm.addEventListener('change', ()=>{ o.framing = frm.value; markDirty(); render(); });
      selBar.appendChild(frm);
      const sup = document.createElement('select');
      sup.title = 'Camera support';
      for(const f of SUPPORTS) sup.insertAdjacentHTML('beforeend', `<option value="${f}">${f||'Support…'}</option>`);
      sup.value = o.support || '';
      sup.addEventListener('change', ()=>{ o.support = sup.value; markDirty(); render(); });
      selBar.appendChild(sup);
      const dsc = document.createElement('input');
      dsc.className = 'lbl'; dsc.style.width = '170px';
      dsc.placeholder = 'Shot description\u2026';
      dsc.value = o.desc || '';
      dsc.addEventListener('input', ()=>{ o.desc = dsc.value; markDirty(); });
      dsc.addEventListener('keydown', e=>{ if(e.key==='Enter') dsc.blur(); e.stopPropagation(); });
      selBar.appendChild(dsc);
      sbtn(o.imgId ? 'Frame \u2713' : 'Frame\u2026', ()=>{
        const fi = document.createElement('input');
        fi.type = 'file'; fi.accept = 'image/*';
        fi.addEventListener('change', async ()=>{
          if(!fi.files || !fi.files[0]) return;
          try{
            const id = await storeImageFile(fi.files[0]);
            o.imgId = id;
            markDirty(); render(); refreshSelBar();
            toast('Frame attached \u2014 drag the little picture to reposition it');
          }catch(e){ toast('That image could not be stored \u2014 try a smaller one'); }
        });
        fi.click();
      });
      if(o.imgId){
        sbtn('Remove frame', ()=>{ o.imgId = null; markDirty(); render(); refreshSelBar(); });
      }
      vsep();
    }

    if(!['text','ink','infocard','script','sbrow','table','listcard','fieldcard','dayheader','colcard','callsheet','schedule','file','colorcard','audio'].includes(o.cat)){
      const inp = document.createElement('input');
      inp.className = 'lbl';
      inp.placeholder = o.cat==='note' ? 'Title'
        : o.cat==='actor' ? 'Character / actor'
        : o.cat==='camera' ? 'Cam label' : 'Label';
      inp.value = o.label || '';
      inp.addEventListener('input', ()=>{ o.label = inp.value; markDirty(); render(); });
      inp.addEventListener('keydown', e=>{ if(e.key==='Enter') inp.blur(); e.stopPropagation(); });
      selBar.appendChild(inp);
    }
    if(o.cat === 'note' || o.cat === 'text'){
      sbtn('Edit text', ()=>openNoteEditor(o));
    }

    if(canMove(o)){
      vsep();
      if(isCrane(o) && o.rail){
        sbtn('Release from track', ()=>{
          o.rail = null; o.path = [];
          markDirty(); render(); refreshSelBar();
        });
        const rh = document.createElement('span');
        rh.style.cssText = 'font-size:10.5px;color:var(--ink2);padding:0 4px;';
        rh.textContent = 'On rails — drag to slide, purple handle swings / extends';
        selBar.appendChild(rh);
      } else {
      const moveLabel = isCrane(o)
        ? ((o.path && o.path.length) ? '+ Arm keyframe' : '→ Animate arm')
        : ((o.path && o.path.length) ? '+ Move point' : '→ Add movement');
      sbtn(moveLabel, ()=>{
        o.path = o.path || [];
        if(isCrane(o)){
          // new keyframe: base stays where it is, arm swings on; drag its handles to taste
          const lastP = o.path.length ? o.path[o.path.length-1] : null;
          const b  = lastP ? {x:lastP.x, y:lastP.y} : jibBasePos(o);
          const r0 = lastP ? (lastP.rot ?? o.rot) : o.rot;
          const l0 = lastP ? (lastP.len ?? armLen(o)) : armLen(o);
          o.path.push({x:b.x, y:b.y, rot:norm(r0 + rad(30)), len:l0});
        } else {
          const last = o.path.length ? o.path[o.path.length-1] : {x:o.x, y:o.y};
          let a;
          if(o.path.length){
            a = prot(o, o.path.length-1);
            if(o.path.length===1 && (o.path[0].rot===undefined||o.path[0].rot===null))
              a = Math.atan2(last.y-o.y, last.x-o.x);
          } else a = o.rot;
          o.path.push({x:last.x+Math.cos(a)*170, y:last.y+Math.sin(a)*170});
        }
        markDirty(); render(); refreshSelBar();
      });
      if(o.path && o.path.length){
        sbtn(o.pathStraight ? 'Path: straight' : 'Path: curved', ()=>{
          o.pathStraight = !o.pathStraight; markDirty(); render(); refreshSelBar();
        });
        sbtn('– Point', ()=>{
          o.path.pop();
          markDirty(); render(); refreshSelBar();
        });
        sbtn('Clear move', ()=>{ o.path=[]; markDirty(); render(); refreshSelBar(); });
      }
      }
    }
    vsep();
    sbtn('\u25b2', ()=>{ // to front
      const i = shot.objects.indexOf(o);
      if(i>-1){ shot.objects.splice(i,1); shot.objects.push(o); markDirty(); render(); }
    }).title = 'Bring to front';
    sbtn('\u25bc', ()=>{ // to back
      const i = shot.objects.indexOf(o);
      if(i>-1){ shot.objects.splice(i,1); shot.objects.unshift(o); markDirty(); render(); }
    }).title = 'Send to back';
    sbtn('Lock', ()=>{ o.locked = true; markDirty(); render(); refreshSelBar(); });
    sbtn('Duplicate', duplicateSelection);
    sbtn('Delete', deleteSelection, true);
  }
  else if(sel.type === 'wall'){
    const w = shot.walls.find(x=>x.id===sel.id);
    if(w){
      if(w.locked){
        const info=document.createElement('span');
        info.style.cssText='font-size:11.5px;color:var(--ink2);padding:0 4px;';
        info.textContent='\ud83d\udd12 Locked';
        selBar.appendChild(info);
      }
      sbtn(w.locked ? 'Unlock' : 'Lock', ()=>{ w.locked=!w.locked; markDirty(); render(); refreshSelBar(); });
      if(!w.locked && w.mid)
        sbtn('Straighten', ()=>{ w.mid = null; markDirty(); render(); refreshSelBar(); });
      if(!w.locked){
        const comp = wallComponent(shot, w);
        if(comp.length > 1){
          sbtn(wallGroupDrag ? ('Drag moves: all ' + comp.length + ' walls') : 'Drag moves: this wall',
            ()=>{ wallGroupDrag = !wallGroupDrag; refreshSelBar(); });
        }
      }
    }
    sbtn('Delete wall', deleteSelection, true);
  }
  else if(sel.type === 'opening'){
    const w = shot.walls.find(w=>w.id===sel.wallId);
    const op = w && w.openings[sel.index];
    if(!op){ sel=null; selBar.classList.remove('show'); return; }
    const info = document.createElement('span');
    info.style.cssText='font-size:11.5px;color:var(--ink2);padding:0 4px;text-transform:capitalize;';
    info.textContent = op.type;
    selBar.appendChild(info);
    if(op.type === 'door'){
      sbtn('Flip swing', ()=>{ op.flip=!op.flip; markDirty(); render(); });
      sbtn('Flip hinge', ()=>{ op.hinge=!op.hinge; markDirty(); render(); });
    }
    if(op.type === 'window'){
      sbtn(op.curtain ? 'Curtain: on' : 'Curtain: off', ()=>{
        op.curtain = !op.curtain; markDirty(); render(); refreshSelBar();
      });
      if(op.curtain)
        sbtn('Flip side', ()=>{ op.flip=!op.flip; markDirty(); render(); });
    }
    sbtn('Wider', ()=>{ op.w=clamp(op.w+15,40,400); markDirty(); render(); });
    sbtn('Narrower', ()=>{ op.w=clamp(op.w-15,40,400); markDirty(); render(); });
    sbtn('Delete', deleteSelection, true);
  }
  selBar.classList.add('show');
  updateSelBarPos();
}
function updateSelBarPos(){
  if(!sel || !selBar.classList.contains('show')) return;
  const shot = activeShot();
  let wx, wy, r = 0;
  if(sel.type === 'sun'){
    const su = shot.sun; if(!su||!su.on) return;
    wx = su.x; wy = su.y; r = 60;
  } else if(sel.type === 'multi'){
    let mnx=Infinity, mny=Infinity, mxx=-Infinity, mxy=-Infinity;
    for(const id of sel.ids){
      const o = shot.objects.find(x=>x.id===id); if(!o) continue;
      mnx = Math.min(mnx, o.x-(o.w||20)/2); mxx = Math.max(mxx, o.x+(o.w||20)/2);
      mny = Math.min(mny, o.y-(o.h||20)/2); mxy = Math.max(mxy, o.y+(o.h||20)/2);
    }
    for(const id of (sel.wallIds || [])){
      const w = shot.walls.find(x=>x.id===id); if(!w) continue;
      mnx = Math.min(mnx, w.x1, w.x2); mxx = Math.max(mxx, w.x1, w.x2);
      mny = Math.min(mny, w.y1, w.y2); mxy = Math.max(mxy, w.y1, w.y2);
    }
    if(mnx === Infinity) return;
    wx = (mnx+mxx)/2; wy = (mny+mxy)/2; r = (mxy-mny)/2;
  } else if(sel.type === 'object'){
    const o = shot.objects.find(x=>x.id===sel.id); if(!o) return;
    wx=o.x; wy=o.y;
    r = o.kind==='track' ? 40 : Math.max(o.w,o.h)/2;
  } else if(sel.type === 'wall'){
    const w = shot.walls.find(x=>x.id===sel.id); if(!w) return;
    const m = w.mid || {x:(w.x1+w.x2)/2, y:(w.y1+w.y2)/2};
    wx = m.x; wy = m.y;
  } else if(sel.type === 'opening'){
    const w = shot.walls.find(x=>x.id===sel.wallId); if(!w || !w.openings[sel.index]) return;
    const op = w.openings[sel.index];
    const geom = wallGeom(w);
    const pc = wallPointAt(geom, op.t*geom.L);
    wx = pc.x; wy = pc.y; r = op.w/2;
  } else return;
  const p = toScreen(wx, wy);
  const bw = selBar.offsetWidth, bh = selBar.offsetHeight;
  let left = clamp(p.x - bw/2, 8, wrap.clientWidth - bw - 8);
  let top = p.y + r*view.scale + 26;
  if(top + bh > wrap.clientHeight - 8) top = p.y - r*view.scale - bh - 26;
  top = clamp(top, 8, wrap.clientHeight - bh - 8);
  selBar.style.left = left+'px';
  selBar.style.top = top+'px';
}

// ---------------------------------------------------------------- note editor
function editorGetValue(o, field){
  if(field === 'todo') return (o.items||[]).map(i=>i.t).join('\n');
  if(field && field.startsWith('item:')){
    const i = +field.split(':')[1];
    return (o.items && o.items[i]) ? o.items[i].t : '';
  }
  if(field && field.startsWith('cell:')){
    const [,r,c] = field.split(':');
    return (o.cells && o.cells[+r] && o.cells[+r][+c]) || '';
  }
  if(field && field.startsWith('person:')){
    const [,pid,key] = field.split(':');
    const p = peopleReg().find(x=>x.id===pid);
    return (p && p[key]) || '';
  }
  if(field && field.startsWith('fval:')){
    const spec = FIELD_CARDS[o.kind] || FIELD_CARDS.prodinfo;
    const row = spec.rows[+field.split(':')[1]];
    return row ? fieldGet(o, row.key) : '';
  }
  if(field && field.startsWith('dh:')) return o[field.slice(3)] || '';
  if(field && field.startsWith('avr:')){
    const [,rid,key] = field.split(':');
    const r = (o.rows||[]).find(x=>x.id===rid);
    return (r && r[key]) || '';
  }
  if(field && field.startsWith('cc:')) return o[field.slice(3)] || '';
  if(field && field.startsWith('sch:')){
    const [,iid,key] = field.split(':');
    const it = (o.items||[]).find(x=>x.id===iid);
    if(!it) return '';
    if(key === 'dur') return String(it.dur || 30);
    return it[key] || '';
  }
  return o[field || 'text'] || '';
}
function editorSetValue(o, field, v){
  if(field && field.startsWith('item:')){
    const i = +field.split(':')[1];
    if(o.items && o.items[i]) o.items[i].t = v.replace(/\n/g,' ');
    return;
  }
  if(field === 'todo'){
    const prev = o.items || [];
    o.items = v.split('\n').filter(l=>l.trim() !== '' || true).filter((l,i,a)=>!(l==='' && i===a.length-1))
      .map((t,i)=>({t, done: prev[i] ? prev[i].done : false}));
    return;
  }
  if(field && field.startsWith('cell:')){
    const [,r,c] = field.split(':');
    if(o.cells && o.cells[+r]) o.cells[+r][+c] = v.replace(/\n/g,' ');
    return;
  }
  if(field && field.startsWith('person:')){
    // writes go straight into the registry — every card viewing this person syncs
    const [,pid,key] = field.split(':');
    const p = peopleReg().find(x=>x.id===pid);
    if(p) p[key] = v.replace(/\n/g,' ');
    return;
  }
  if(field && field.startsWith('fval:')){
    // writes go straight into production / its bound location
    const spec = FIELD_CARDS[o.kind] || FIELD_CARDS.prodinfo;
    const row = spec.rows[+field.split(':')[1]];
    if(row) fieldSet(o, row.key, v.replace(/\n/g,' '));
    return;
  }
  if(field && field.startsWith('dh:')){
    o[field.slice(3)] = v.replace(/\n/g,' ').trim();
    return;
  }
  if(field && field.startsWith('avr:')){
    const [,rid,key] = field.split(':');
    const r = (o.rows||[]).find(x=>x.id===rid);
    if(r) r[key] = (key==='time' || key==='no') ? v.replace(/\n/g,' ').trim() : v;
    return;
  }
  if(field && field.startsWith('cc:')){
    o[field.slice(3)] = field === 'cc:title' ? v.replace(/\n/g,' ') : v;
    return;
  }
  if(field && field.startsWith('sch:')){
    const [,iid,key] = field.split(':');
    const it = (o.items||[]).find(x=>x.id===iid);
    if(!it) return;
    const clean = v.replace(/\n/g,' ').trim();
    if(key === 'dur'){
      // "45", "45m" or "1:30" all work
      it.dur = clean.includes(':') ? (toMinutes(clean) || 30)
             : Math.max(5, parseInt(clean, 10) || 30);
    } else if(key === 'time'){
      it.time = clean; // empty = back to auto-chaining
    } else it.label = clean; // empty = back to the scene's own tag line
    return;
  }
  o[field || 'text'] = v;
}
function openTodoItem(o, i){
  const rowH = 32, top = o.label ? 36 : 8;
  openNoteEditor(o, 'item:'+i,
    {x:-o.w/2+30, y:-o.h/2+top + i*rowH + 3, w:o.w-40, h:rowH-6}, 12.5);
}
function openTableCell(o, r, c){
  const headH = 30, rowH = 28;
  const ws = o._colWs || o.cells[0].map(()=>o.w/o.cells[0].length);
  let x0 = -o.w/2;
  for(let k=0;k<c;k++) x0 += ws[k];
  const cy = r===0 ? 0 : headH + (r-1)*rowH;
  openNoteEditor(o, 'cell:'+r+':'+c,
    {x:x0+3, y:-o.h/2+cy+3, w:ws[c]-6, h:(r===0?headH:rowH)-6}, 12);
}
// ---- list cards (Crew / Cast / Client — live views of the People registry) ----
function listCellAt(o, wx, wy){
  const spec = LIST_CARDS[o.kind] || LIST_CARDS.crew;
  const G = LIST_GEO;
  const rows = cardPeople(o);
  const lx = wx - o.x + o.w/2, ly = wy - o.y + o.h/2;
  if(ly < G.titleH + G.headH || lx < G.grip) return null;
  const r = Math.floor((ly - G.titleH - G.headH)/G.rowH);
  if(r < 0 || r >= rows.length) return null;
  const ws = o._colWs || spec.cols.map(cc=>cc.min);
  let acc = G.grip, c = 0;
  for(; c < spec.cols.length-1; c++){ acc += ws[c]; if(lx < acc) break; }
  return {r, c};
}
function openListCell(o, r, c){
  const spec = LIST_CARDS[o.kind] || LIST_CARDS.crew;
  const rows = cardPeople(o);
  const p = rows[r]; if(!p) return;
  const G = LIST_GEO;
  const ws = o._colWs || spec.cols.map(cc=>cc.min);
  let x0 = -o.w/2 + G.grip;
  for(let k=0;k<c;k++) x0 += ws[k];
  openNoteEditor(o, 'person:' + p.id + ':' + spec.cols[c].key,
    {x:x0+3, y:-o.h/2 + G.titleH + G.headH + r*G.rowH + 2, w:ws[c]-6, h:G.rowH-4}, 12);
}
function addListPerson(o, open){
  const spec = LIST_CARDS[o.kind] || LIST_CARDS.crew;
  peopleReg().push({id:uid(), name:'', role:'', phone:'', email:'', tag:spec.tag, call:''});
  markDirty(); render();
  if(open !== false) setTimeout(()=>openListCell(o, cardPeople(o).length-1, 0), 0);
}
function removeListPerson(personId){
  const people = peopleReg();
  const i = people.findIndex(p=>p.id===personId);
  if(i < 0) return;
  people.splice(i, 1);
  markDirty(); render(); refreshSelBar();
}

// ---- storyboard rows: chain shot ideas per scene ----
// New row lands right under this one, same scene; EVERYTHING below shifts
// down by the same amount so later scenes never get overlapped.
function addSbRowBelow(o){
  const shot = activeShot();
  const dy = o.h + 14;
  for(const ob of shot.objects){
    if(ob === o || ob.y <= o.y + 1) continue;
    ob.y += dy;
    if(ob.p1){ ob.p1.y += dy; } if(ob.p2){ ob.p2.y += dy; }
    if(ob.mid){ ob.mid.y += dy; }
    if(ob.pts) ob.pts.forEach(p=>p.y += dy);
    if(ob.path) ob.path.forEach(p=>p.y += dy);
  }
  // same scene, next board: carry the scene number/title along
  const n = {id:uid(), cat:'sbrow', kind:'sbrow', x:o.x, y:o.y + dy, rot:0,
    w:o.w, h:o.h, title:o.title || '', desc:'', imgId:null, sceneId:o.sceneId || null,
    color:o.color, label:'', path:[]};
  shot.objects.push(n);
  sel = {type:'object', id:n.id};
  markDirty(); render(); refreshSelBar();
  return n;
}

// ---- AV script card (rows: time | audio | video, optional sc#/still/notes) ----
function avCellAt(o, wx, wy){
  const G = AVS;
  const cols = o._avCols || avCols(o);
  const hs = o._rowHs || [];
  const lx = wx - o.x + o.w/2, ly0 = wy - o.y + o.h/2;
  if(ly0 < G.titleH + G.headH || lx < G.grip) return null;
  let ly = ly0 - G.titleH - G.headH, ri = 0;
  for(; ri < hs.length; ri++){ if(ly <= hs[ri]) break; ly -= hs[ri]; }
  if(ri >= o.rows.length) return null;
  let acc = G.grip, key = cols[cols.length-1][0];
  for(const [k,,wd] of cols){ acc += wd; if(lx < acc){ key = k; break; } }
  return {rowId:o.rows[ri].id, key, rowIdx:ri};
}
function openAvCell(o, rowId, key){
  const G = AVS;
  const cols = o._avCols || avCols(o);
  const hs = o._rowHs || [];
  const ri = o.rows.findIndex(r=>r.id===rowId);
  if(ri < 0 || key === 'still') return;
  let yTop = -o.h/2 + G.titleH + G.headH;
  for(let i=0;i<ri;i++) yTop += hs[i];
  let x0 = -o.w/2 + G.grip, wd = 100;
  for(const [k,,cw] of cols){ if(k === key){ wd = cw; break; } x0 += cw; }
  openNoteEditor(o, 'avr:' + rowId + ':' + key,
    {x:x0+3, y:yTop+2, w:wd-6, h:(hs[ri]||G.minRowH)-4}, 12);
}
function addAvRow(o, openIt){
  o.rows.push({id:uid(), no:'', time:'', audio:'', video:'', notes:'', imgId:null});
  markDirty(); render();
  if(openIt !== false){
    const r = o.rows[o.rows.length-1];
    setTimeout(()=>openAvCell(o, r.id, o.cols && o.cols.no ? 'no' : 'time'), 0);
  }
}

// ---- column card (title strip + text body) ----
function colCellAt(o, wx, wy){
  const ly = wy - o.y + o.h/2;
  return ly < 26 ? 'title' : 'text';
}
function openColCell(o, key){
  if(key === 'title')
    openNoteEditor(o, 'cc:title', {x:-o.w/2+4, y:-o.h/2+2, w:o.w-8, h:22}, 11);
  else
    openNoteEditor(o, 'cc:text', {x:-o.w/2+4, y:-o.h/2+30, w:o.w-8, h:o.h-36}, 12.5);
}

// ---- day schedule (the flexible strip) ----
function openSchedCell(o, itemId, key){
  const items = schedItems(o);
  const i = items.findIndex(x=>x.id === itemId);
  if(i < 0) return;
  if(key === 'dur' && items[i].type === 'scene') return; // scene length lives on the scene
  const rowH = 24, grip = 14, pad = 10;
  const headH = 26 + pad + 26; // title + calls line
  const cy = -o.h/2 + headH + i*rowH;
  const cbX = -o.w/2 + grip + 2, tX = cbX + 24, lX = tX + 46, dX = o.w/2 - 52;
  const rect = key === 'time' ? {x:tX - 2, y:cy + 1, w:46, h:rowH - 4}
             : key === 'dur'  ? {x:dX, y:cy + 1, w:44, h:rowH - 4}
             : {x:lX - 2, y:cy + 1, w:dX - lX, h:rowH - 4};
  openNoteEditor(o, 'sch:' + itemId + ':' + key, rect, 11.5);
}
function addSchedBlock(o, type){
  const items = schedItems(o);
  items.push({id:uid(), type, sceneId:null, on:true, label:'', time:'',
    dur: type === 'break' ? 45 : 30});
  markDirty(); render();
}

// ---- day header (the call-time block) ----
function dayCellAt(o, wx, wy){
  const G = DAYH;
  const lx = wx - o.x + o.w/2, ly = wy - o.y + o.h/2;
  if(ly < G.titleH) return null;
  if(ly < G.titleH + G.bigH) return 'call';
  if(ly < G.titleH + G.bigH + G.rowH) return lx < o.w/2 ? 'shootCall' : 'wrap';
  return null; // sun row is computed, not edited
}
function openDayCell(o, key){
  const G = DAYH;
  if(key === 'call'){
    openNoteEditor(o, 'dh:call',
      {x:-60, y:-o.h/2 + G.titleH + G.bigH/2 - 16, w:120, h:34}, 24);
  } else {
    const r1 = -o.h/2 + G.titleH + G.bigH;
    openNoteEditor(o, 'dh:' + key,
      {x:(key==='shootCall' ? -o.w/2 + 96 : 76), y:r1 + 3, w:o.w/2 - 100, h:G.rowH - 6}, 13);
  }
}
// geocode the Location card's place once (Open-Meteo, like the weather card),
// cache lat/lon on the day header; sunrise/sunset then computes client-side
async function dayheaderSunFetch(o){
  normalizeProduction();
  const loc = project.production.locations.find(l=>l.town || l.name || l.street);
  // the TOWN is what geocoders want; street or name only as fallback
  const q = loc ? (loc.town || loc.name || loc.street) : '';
  if(!q){ toast('Fill a Location card first (town works best) — the sun needs a place'); return; }
  toast('Looking up ' + q + '…');
  try{
    const g = await (await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=nl&name=' +
      encodeURIComponent(q.split(',')[0]))).json();
    const hit = g.results && g.results[0];
    if(!hit){ toast('Place not found — try just the town name in the Location card'); return; }
    o.lat = hit.latitude; o.lon = hit.longitude;
    o.place = hit.name + (hit.admin1 ? ', ' + hit.admin1 : '');
    markDirty(); render(); refreshSelBar();
    toast('Sunrise/sunset from ' + o.place);
  }catch(e){ toast('Could not reach the geocoding service'); }
}

// ---- field cards (Production info / Location — windows onto production data) ----
function fieldCellAt(o, wx, wy){
  const spec = FIELD_CARDS[o.kind] || FIELD_CARDS.prodinfo;
  const ly = wy - o.y + o.h/2;
  if(ly < FIELD_GEO.titleH) return null;
  const i = Math.floor((ly - FIELD_GEO.titleH)/FIELD_GEO.rowH);
  return (i >= 0 && i < spec.rows.length) ? i : null;
}
function openFieldCell(o, i){
  const spec = FIELD_CARDS[o.kind] || FIELD_CARDS.prodinfo;
  if(i < 0 || i >= spec.rows.length) return;
  const labW = o._labW || 90;
  openNoteEditor(o, 'fval:' + i,
    {x:-o.w/2 + labW + 3, y:-o.h/2 + FIELD_GEO.titleH + i*FIELD_GEO.rowH + 2,
     w:o.w - labW - 6, h:FIELD_GEO.rowH - 4}, 12);
}

function openNoteEditor(o, field, rect, fs){
  closeNoteEditor(true);
  const ta = document.createElement('textarea');
  const plain = o.cat==='text' || rect;
  ta.className = 'note-ta' + (plain ? ' plain' : '') + (field === 'todo' ? ' solid' : '');
  ta.value = editorGetValue(o, field);
  wrap.appendChild(ta);
  noteEditor = {id:o.id, ta, field: field||'text', rect: rect||null, fs: fs||null};
  positionNoteEditor();
  ta.focus();
  ta.addEventListener('input', ()=>{ editorSetValue(o, noteEditor.field, ta.value); markDirty(); });
  ta.addEventListener('blur', ()=>closeNoteEditor(true));
  ta.addEventListener('keydown', e=>{
    if(e.key === 'Escape'){ closeNoteEditor(true); e.stopPropagation(); return; }
    const fld = noteEditor.field;
    if(fld.startsWith('cell:') && (e.key === 'Enter' || e.key === 'Tab')){
      e.preventDefault();
      const parts = fld.split(':');
      let r = +parts[1], c = +parts[2];
      closeNoteEditor(true);
      const nC = o.cells[0].length;
      if(e.key === 'Tab'){ c++; if(c >= nC){ c = 0; r++; } }
      else { r++; }
      if(r >= o.cells.length){ o.cells.push(o.cells[0].map(()=>'' )); markDirty(); }
      render();
      setTimeout(()=>openTableCell(o, r, c), 0);
      return;
    }
    if(fld.startsWith('person:') && (e.key === 'Enter' || e.key === 'Tab')){
      e.preventDefault();
      const [,pid,key] = fld.split(':');
      const spec = LIST_CARDS[o.kind] || LIST_CARDS.crew;
      const rows = cardPeople(o);
      let r = rows.findIndex(p=>p.id===pid);
      let c = spec.cols.findIndex(cc=>cc.key===key);
      closeNoteEditor(true);
      if(e.key === 'Tab' && e.shiftKey){ c--; if(c < 0){ c = spec.cols.length-1; r--; } }
      else if(e.key === 'Tab'){ c++; if(c >= spec.cols.length){ c = 0; r++; } }
      else r++;
      if(r < 0){ render(); return; }
      if(r >= rows.length){
        // walked off the last row — chain a fresh person, unless this one is still blank
        const last = rows[rows.length-1];
        const blank = last && !((last.name||'')+(last.role||'')+(last.phone||'')+(last.email||'')+(last.call||'')).trim();
        if(blank){ render(); return; }
        addListPerson(o, false);
      }
      render();
      setTimeout(()=>openListCell(o, r, c), 0);
      return;
    }
    if(fld.startsWith('fval:') && (e.key === 'Enter' || e.key === 'Tab')){
      e.preventDefault();
      const spec = FIELD_CARDS[o.kind] || FIELD_CARDS.prodinfo;
      let i = +fld.split(':')[1];
      closeNoteEditor(true);
      i += (e.key === 'Tab' && e.shiftKey) ? -1 : 1;
      render();
      if(i >= 0 && i < spec.rows.length) setTimeout(()=>openFieldCell(o, i), 0);
      return;
    }
    if(fld.startsWith('dh:') && (e.key === 'Enter' || e.key === 'Tab')){
      e.preventDefault();
      const order = ['call','shootCall','wrap'];
      let i = order.indexOf(fld.slice(3));
      closeNoteEditor(true);
      i += (e.key === 'Tab' && e.shiftKey) ? -1 : 1;
      render();
      if(i >= 0 && i < order.length) setTimeout(()=>openDayCell(o, order[i]), 0);
      return;
    }
    if(fld.startsWith('avr:')){
      const [,rid,key] = fld.split(':');
      const single = key === 'time' || key === 'no';
      // Enter = newline in the text cells; Tab (or Enter in time/sc) navigates
      if(e.key === 'Tab' || (e.key === 'Enter' && single)){
        e.preventDefault();
        const keys = (o._avCols || avCols(o)).map(c=>c[0]).filter(k=>k !== 'still');
        let ri = o.rows.findIndex(r=>r.id === rid);
        let ci = keys.indexOf(key);
        closeNoteEditor(true);
        if(e.key === 'Tab' && e.shiftKey){ ci--; if(ci < 0){ ci = keys.length-1; ri--; } }
        else { ci++; if(ci >= keys.length){ ci = 0; ri++; } }
        if(ri < 0){ render(); return; }
        if(ri >= o.rows.length) addAvRow(o, false);
        render();
        const target = o.rows[ri];
        if(target) setTimeout(()=>openAvCell(o, target.id, keys[ci]), 0);
        return;
      }
    }
    if(fld === 'cc:title' && (e.key === 'Enter' || e.key === 'Tab')){
      e.preventDefault();
      closeNoteEditor(true);
      render();
      setTimeout(()=>openColCell(o, 'text'), 0);
      return;
    }
    if(fld.startsWith('sch:') && (e.key === 'Enter' || e.key === 'Tab')){
      e.preventDefault();
      const [,iid,key] = fld.split(':');
      closeNoteEditor(true);
      render();
      if(e.key === 'Tab'){ // time → label → (dur for blocks), then done
        const it = (o.items||[]).find(x=>x.id===iid);
        const next = key === 'time' ? 'label'
                   : (key === 'label' && it && it.type !== 'scene') ? 'dur' : null;
        if(next) setTimeout(()=>openSchedCell(o, iid, next), 0);
      }
      return;
    }
    if(fld.startsWith('item:')){
      const i = +fld.split(':')[1];
      if(e.key === 'Enter'){
        e.preventDefault();
        closeNoteEditor(true);
        o.items.splice(i+1, 0, {t:'', done:false});
        markDirty(); render();
        setTimeout(()=>openTodoItem(o, i+1), 0);
        return;
      }
      if(e.key === 'Backspace' && ta.value === '' && o.items.length > 1){
        e.preventDefault();
        closeNoteEditor(false);
        o.items.splice(i, 1);
        markDirty(); render();
        if(i > 0) setTimeout(()=>openTodoItem(o, i-1), 0);
        return;
      }
    }
    e.stopPropagation();
  });
  render();
}
function positionNoteEditor(){
  if(!noteEditor) return;
  const o = findObj(noteEditor.id);
  if(!o){ closeNoteEditor(false); return; }
  const p = toScreen(o.x - o.w/2, o.y - o.h/2);
  const s = view.scale;
  const ta = noteEditor.ta;
  ta.style.position = 'fixed';
  const cvR = cv.getBoundingClientRect();
  const fs = noteEditor.fs || (o.fontSize || (o.cat==='text' ? 18 : 13));
  if(noteEditor.rect){
    const r = noteEditor.rect;
    const pr = toScreen(o.x + r.x, o.y + r.y);
    ta.style.left = (cvR.left + pr.x) + 'px';
    ta.style.top = (cvR.top + pr.y) + 'px';
    ta.style.width = r.w*s + 'px';
    ta.style.height = Math.max(r.h, fs*2.2)*s + 'px';
    ta.style.fontSize = fs*s + 'px';
    ta.style.lineHeight = '1.4';
    ta.style.fontWeight = '400';
    ta.style.fontStyle = 'normal';
    ta.style.padding = 3*s + 'px';
    return;
  }
  ta.style.left = (cvR.left + p.x) + 'px';
  ta.style.top = (cvR.top + p.y) + 'px';
  ta.style.width = o.w*s + 'px';
  ta.style.height = Math.max(o.h, fs*2.8)*s + 'px';
  ta.style.fontSize = fs*s + 'px';
  ta.style.lineHeight = '1.32';
  ta.style.fontWeight = o.bold ? '700' : '400';
  ta.style.fontStyle = o.italic ? 'italic' : 'normal';
  ta.style.padding = (o.cat==='text' ? 2*s : 10*s) + 'px';
}
function closeNoteEditor(save){
  if(!noteEditor) return;
  const ne = noteEditor;
  noteEditor = null; // clear first — removing the focused textarea re-fires blur → closeNoteEditor
  const o = findObj(ne.id);
  if(o && save){ o.text = ne.ta.value; markDirty(); }
  try{ ne.ta.remove(); }catch(_){}
  render();
}

// ---------------------------------------------------------------- library
function tileCanvas(drawFn, w, h, c, def){
  const t = document.createElement('canvas');
  const s = 44, d = window.devicePixelRatio||1;
  t.width = s*d; t.height = s*d; t.style.width = s+'px'; t.style.height = s+'px';
  const tc = t.getContext('2d');
  tc.setTransform(d,0,0,d,0,0);
  tc.translate(s/2, s/2);
  const k = Math.min((s-12)/w, (s-12)/h);
  tc.scale(k, k);
  tc.lineWidth = 2/k;
  drawFn(tc, w, h, c, def);
  return t;
}
function libTile(spec){
  const el = document.createElement('div');
  el.className = 'lib-item';
  let drawFn, w, h, name, color = '#5B6472';
  if(spec.cat === 'camera'){
    const d = CAMS[spec.kind];
    drawFn = (tc,tw,th,tcol)=>drawCameraKind(tc, spec.kind, tw, th, tcol);
    w=d.w; h=d.h; name=d.name; color='#33322E';
  } else if(spec.cat === 'actor'){
    const d = ACTORS[spec.kind] || ACTORS.actor;
    drawFn = (tc,tw,th,tcol)=>drawActorIcon(tc, tw, th, tcol, spec.kind);
    w=d.w; h=d.h; name=d.name; color='#4B6BFB';
  } else {
    const d = PROPS[spec.kind];
    drawFn = d.draw; w=d.w; h=d.h; name=d.name;
  }
  el.appendChild(tileCanvas(drawFn, w, h, color));
  el.insertAdjacentHTML('beforeend', `<span>${esc(name)}</span>`);
  el.addEventListener('pointerdown', e => {
    const base = {cat:spec.cat, kind:spec.kind, w, h, color};
    if(spec.cat === 'camera'){ base.fov = CAMS[spec.kind].fov; base.range = CAMS[spec.kind].range; }
    startLibDrag(e, base);
  });
  return el;
}
function buildLibrary(){
  const lib = document.getElementById('library');
  lib.innerHTML = '';
  for(const cat of (BOARD_TABS.has(activeTab) ? [] : CATS)){
    const head = document.createElement('div');
    head.className = 'cat-head' + (cat.open ? '' : ' closed');
    head.innerHTML = `<span class="arr">▼</span>${esc(cat.name)}`;
    const grid = document.createElement('div');
    grid.className = 'lib-grid' + (cat.open ? '' : ' hidden');
    head.addEventListener('click', ()=>{
      cat.open = !cat.open;
      head.classList.toggle('closed', !cat.open);
      grid.classList.toggle('hidden', !cat.open);
    });
    for(const it of cat.items) grid.appendChild(libTile(it));
    lib.appendChild(head); lib.appendChild(grid);
  }
  // Board section
  const bh = document.createElement('div');
  bh.className='cat-head'; bh.innerHTML='<span class="arr">▼</span>Board';
  const bg = document.createElement('div');
  bg.className='lib-grid';
  bh.addEventListener('click', ()=>{ bg.classList.toggle('hidden'); bh.classList.toggle('closed'); });
  const noteTile = document.createElement('div');
  noteTile.className='lib-item';
  noteTile.appendChild(tileCanvas((tc,w,h)=>{
    drawNoteShape(tc, {w, h, color:'#E2A93B', text:''}, true);
  }, 120, 110, '#E2A93B'));
  noteTile.insertAdjacentHTML('beforeend','<span>Sticky note</span>');
  noteTile.addEventListener('pointerdown', e => startLibDrag(e, {cat:'note', kind:'note', w:170, h:150, color:'#E2A93B'}));
  bg.appendChild(noteTile);
  const imgTile = document.createElement('div');
  imgTile.className='lib-item';
  imgTile.appendChild(tileCanvas((tc,w,h,c)=>{
    tc.beginPath(); tc.roundRect(-w/2,-h/2,w,h,5);
    tc.fillStyle=c; tc.globalAlpha=.18; tc.fill(); tc.globalAlpha=1; tc.strokeStyle=c; tc.stroke();
    tc.beginPath(); tc.arc(-w*.2,-h*.15,6,0,7); tc.fillStyle=c; tc.globalAlpha=.6; tc.fill(); tc.globalAlpha=1;
    tc.beginPath(); tc.moveTo(-w/2+6,h/2-8); tc.lineTo(-w*.05,-h*.05); tc.lineTo(w*.2,h*.2); tc.lineTo(w*.38,0); tc.lineTo(w/2-6,h/2-8); tc.stroke();
  }, 110, 80, '#5B6472'));
  imgTile.insertAdjacentHTML('beforeend','<span>Image…</span>');
  imgTile.addEventListener('click', ()=>document.getElementById('boardImgInput').click());
  bg.appendChild(imgTile);
  const boardTile = (name, drawFn, w, h, color, spec, onClick) => {
    const el = document.createElement('div');
    el.className = 'lib-item';
    el.appendChild(tileCanvas(drawFn, w, h, color));
    el.insertAdjacentHTML('beforeend', `<span>${esc(name)}</span>`);
    if(onClick) el.addEventListener('click', onClick);
    else el.addEventListener('pointerdown', e => startLibDrag(e, spec));
    bg.appendChild(el);
  };
  boardTile('Text', (tc,w2,h2,c)=>{
    tc.font='700 '+(h2*.9)+'px -apple-system,Segoe UI,sans-serif';
    tc.textAlign='center'; tc.textBaseline='middle';
    tc.fillStyle=c; tc.fillText('T', 0, 2);
    tc.textAlign='left'; tc.textBaseline='alphabetic';
  }, 60, 60, '#33322E', {cat:'text', kind:'text', w:240, h:40, color:'#5B6472'});
  boardTile('Line / arrow', (tc,w2,h2,c)=>{
    tc.strokeStyle=c; tc.lineWidth=5; tc.lineCap='round';
    tc.beginPath(); tc.moveTo(-w2/2,h2/2); tc.lineTo(w2*.3,-h2*.3); tc.stroke();
    tc.beginPath(); tc.moveTo(w2*.3,-h2*.3); tc.lineTo(w2*.05,-h2*.32); tc.moveTo(w2*.3,-h2*.3); tc.lineTo(w2*.33,-h2*.05); tc.stroke();
  }, 90, 90, '#E8604C', {cat:'line', kind:'line', w:220, h:14, color:'#E8604C'});
  boardTile('Link', (tc,w2,h2,c)=>{
    tc.strokeStyle=c; tc.lineWidth=6; tc.lineCap='round';
    tc.beginPath(); tc.ellipse(-w2*.14,h2*.14,w2*.24,h2*.15,-Math.PI/4,0,7); tc.stroke();
    tc.beginPath(); tc.ellipse(w2*.14,-h2*.14,w2*.24,h2*.15,-Math.PI/4,0,7); tc.stroke();
  }, 90, 90, '#4B6BFB', {cat:'link', kind:'link', w:130, h:34, color:'#4B6BFB'});
  // shot info card mirrors the Shot info panel — only meaningful on the designer
  if(activeTab === 'design'){
    boardTile('Shot info card', (tc,w2,h2,c)=>{
      tc.beginPath(); tc.roundRect(-w2/2,-h2/2,w2,h2,4);
      tc.fillStyle='#fff'; tc.fill(); tc.strokeStyle=c; tc.stroke();
      tc.fillStyle=c; tc.globalAlpha=.28;
      tc.fillRect(-w2/2,-h2/2,w2,h2*.2); tc.globalAlpha=1;
      tc.globalAlpha=.55;
      for(const y2 of [h2*.02,h2*.18,h2*.34]) tc.fillRect(-w2*.34,y2,w2*.68,3);
      tc.globalAlpha=1;
    }, 90, 70, '#4B6BFB', {cat:'infocard', kind:'infocard', w:260, h:180, color:'#4B6BFB'});
  }
  boardTile('Column', (tc,w2,h2,c)=>{
    tc.beginPath(); tc.roundRect(-w2/2,-h2/2,w2,h2,4);
    tc.fillStyle='#fff'; tc.fill(); tc.strokeStyle=c; tc.stroke();
    tc.fillStyle=c; tc.globalAlpha=.28;
    tc.fillRect(-w2/2,-h2/2,w2,h2*.2); tc.globalAlpha=1;
    tc.globalAlpha=.5;
    for(const y2 of [h2*.04,h2*.18,h2*.32]) tc.fillRect(-w2*.34,y2,w2*.68,2.5);
    tc.globalAlpha=1;
  }, 90, 110, '#4B6BFB', {cat:'colcard', kind:'colcard', w:240, h:120, color:'#4B6BFB'});
  boardTile('Production', (tc,w2,h2)=>{
    drawNoteShape(tc, {w:w2, h:h2, color:'#5B6472', text:''}, true);
    tc.fillStyle='#5B6472'; tc.globalAlpha=.7;
    for(const y2 of [-h2*.22,-h2*.02,h2*.18]) tc.fillRect(-w2*.32,y2,w2*.64,3);
    tc.globalAlpha=1;
  }, 100, 100, '#5B6472', {cat:'note', kind:'note', w:270, h:340, color:'#5B6472',
    props:{label:'PRODUCTION',
      text:'Company: \nDirector: \nDoP: \nProduction lead: \nCrew call: \n\nLocation: \nAddress: \nParking: \nPower: \n\nContacts: '}});
  boardTile('To-do list', (tc,w2,h2,c2)=>{
    tc.strokeStyle=c2; tc.lineWidth=4;
    for(const y2 of [-h2*.26, 0, h2*.26]){
      tc.strokeRect(-w2*.32, y2-6, 12, 12);
      tc.beginPath(); tc.moveTo(-w2*.06, y2); tc.lineTo(w2*.34, y2); tc.stroke();
    }
  }, 90, 90, '#3E9B6E', {cat:'todo', kind:'todo', w:230, h:120, color:'#3E9B6E'});
  boardTile('Table', (tc,w2,h2,c2)=>{
    tc.strokeStyle=c2; tc.lineWidth=3;
    tc.strokeRect(-w2*.38,-h2*.3,w2*.76,h2*.6);
    tc.beginPath();
    tc.moveTo(-w2*.38,-h2*.1); tc.lineTo(w2*.38,-h2*.1);
    tc.moveTo(-w2*.38,h2*.1); tc.lineTo(w2*.38,h2*.1);
    tc.moveTo(0,-h2*.3); tc.lineTo(0,h2*.3);
    tc.stroke();
  }, 90, 90, '#5B6472', {cat:'table', kind:'table', w:340, h:90, color:'#4B6BFB'});
  boardTile('Color', (tc,w2,h2)=>{
    tc.fillStyle='#E8604C'; tc.beginPath(); tc.roundRect(-w2*.36,-h2*.36,w2*.72,h2*.5,6); tc.fill();
    tc.fillStyle='#8A877F';
    tc.fillRect(-w2*.3, h2*.22, w2*.6, 3);
  }, 90, 90, '#E8604C', {cat:'colorcard', kind:'colorcard', w:160, h:130, color:'#E8604C'});
  boardTile('Audio\u2026', (tc,w2,h2,c2)=>{
    tc.strokeStyle=c2; tc.lineWidth=3.4; tc.lineCap='round';
    tc.beginPath(); tc.arc(-w2*.14,h2*.2,h2*.11,0,7); tc.stroke();
    tc.beginPath(); tc.arc(w2*.18,h2*.14,h2*.11,0,7); tc.stroke();
    tc.beginPath(); tc.moveTo(-w2*.14+h2*.11,h2*.2); tc.lineTo(-w2*.14+h2*.11,-h2*.26);
    tc.lineTo(w2*.18+h2*.11,-h2*.32); tc.lineTo(w2*.18+h2*.11,h2*.14); tc.stroke();
  }, 90, 90, '#8B5CF6', null, ()=>pickBoardAudio());
  boardTile('File\u2026', (tc,w2,h2,c2)=>{
    tc.strokeStyle=c2; tc.lineWidth=3.4;
    tc.beginPath();
    tc.moveTo(-w2*.22,-h2*.34); tc.lineTo(w2*.1,-h2*.34); tc.lineTo(w2*.24,-h2*.18);
    tc.lineTo(w2*.24,h2*.34); tc.lineTo(-w2*.22,h2*.34); tc.closePath(); tc.stroke();
    tc.beginPath(); tc.moveTo(w2*.1,-h2*.34); tc.lineTo(w2*.1,-h2*.18); tc.lineTo(w2*.24,-h2*.18); tc.stroke();
  }, 90, 90, '#5B6472', null, ()=>pickBoardFile());
  lib.appendChild(bh); lib.appendChild(bg);
  if(activeTab === 'org' && typeof buildProdLibSection === 'function') buildProdLibSection(lib);
  if(activeTab === 'write' && typeof buildWriteLibSection === 'function') buildWriteLibSection(lib);
  if(activeTab === 'mood' && typeof buildMoodLibSection === 'function') buildMoodLibSection(lib);

  // Custom section (shot designer only)
  if(activeTab !== 'design') return;
  const ch = document.createElement('div');
  ch.className='cat-head'; ch.innerHTML='<span class="arr">▼</span>Custom props';
  const cg = document.createElement('div');
  cg.className='lib-grid';
  ch.addEventListener('click', ()=>{ cg.classList.toggle('hidden'); ch.classList.toggle('closed'); });
  for(const cp of project.customProps){
    const el = document.createElement('div');
    el.className = 'lib-item';
    el.appendChild(tileCanvas((tc,w,h,c)=>PROPS.custom.draw(tc,w,h,c,cp), cp.w, cp.h, cp.color||'#5B6472'));
    el.insertAdjacentHTML('beforeend', `<span>${esc(cp.name)}</span><button class="del-custom" title="Remove from library">×</button>`);
    el.querySelector('.del-custom').addEventListener('pointerdown', e => {
      e.stopPropagation();
      project.customProps = project.customProps.filter(p=>p.id!==cp.id);
      markDirty(); buildLibrary();
    });
    el.addEventListener('pointerdown', e =>
      startLibDrag(e, {cat:'prop', kind:'custom:'+cp.id, w:cp.w, h:cp.h, color:cp.color, label:cp.name}));
    cg.appendChild(el);
  }
  const add = document.createElement('div');
  add.className = 'lib-item add-custom';
  add.textContent = '+ Custom';
  add.addEventListener('click', showCustomPop);
  cg.appendChild(add);
  lib.appendChild(ch); lib.appendChild(cg);
}

let libGhost = null;
function cancelLibDrag(){
  document.removeEventListener('pointermove', moveLibGhost);
  document.removeEventListener('pointerup', dropLib);
  document.removeEventListener('pointercancel', cancelLibDrag);
  if(libGhost){ libGhost.remove(); libGhost = null; }
  libDrag = null;
}
function startLibDrag(e, spec){
  e.preventDefault();
  if(e.target && e.target.hasPointerCapture && e.target.hasPointerCapture(e.pointerId)){
    try{ e.target.releasePointerCapture(e.pointerId); }catch(_){}
  }
  closeDrawers(); // on phones/tablets the drawer covers the canvas — get it out of the way
  libDrag = spec;
  libGhost = document.createElement('div');
  libGhost.style.cssText = 'position:fixed;z-index:60;pointer-events:none;opacity:.85;transform:translate(-50%,-50%);background:#fff;border:1px solid var(--border);border-radius:9px;padding:6px;box-shadow:var(--shadow);';
  const def = spec.kind.startsWith('custom:')
    ? project.customProps.find(p=>p.id===spec.kind.slice(7))
    : null;
  let drawFn;
  if(spec.cat==='camera') drawFn = (tc,w,h,col)=>drawCameraKind(tc,spec.kind,w,h,col);
  else if(spec.cat==='actor') drawFn = (tc,w2,h2,col)=>drawActorIcon(tc, w2, h2, col, spec.kind);
  else if(spec.cat==='note') drawFn = (tc,w,h)=>drawNoteShape(tc,{w,h,color:spec.color,text:''},true);
  else if(spec.cat==='text') drawFn = (tc,w2,h2,col)=>{
    tc.font='700 '+(Math.min(w2,h2)*.9)+'px -apple-system,Segoe UI,sans-serif';
    tc.textAlign='center'; tc.textBaseline='middle';
    tc.fillStyle=col; tc.fillText('T',0,2);
    tc.textAlign='left'; tc.textBaseline='alphabetic';
  };
  else if(spec.cat==='line') drawFn = (tc,w2,h2,col)=>{
    tc.strokeStyle=col; tc.lineWidth=Math.max(4, h2*.3); tc.lineCap='round';
    tc.beginPath(); tc.moveTo(-w2/2,h2/2); tc.lineTo(w2*.35,-h2/2); tc.stroke();
  };
  else if(spec.cat==='link') drawFn = (tc,w2,h2,col)=>{
    tc.strokeStyle=col; tc.lineWidth=Math.max(4, h2*.2); tc.lineCap='round';
    tc.beginPath(); tc.ellipse(-w2*.14,h2*.14,w2*.24,h2*.15,-Math.PI/4,0,7); tc.stroke();
    tc.beginPath(); tc.ellipse(w2*.14,-h2*.14,w2*.24,h2*.15,-Math.PI/4,0,7); tc.stroke();
  };
  else if(spec.cat==='infocard') drawFn = (tc,w2,h2,col)=>{
    tc.beginPath(); tc.roundRect(-w2/2,-h2/2,w2,h2,6);
    tc.fillStyle='#fff'; tc.fill(); tc.strokeStyle=col; tc.stroke();
    tc.fillStyle=col; tc.fillRect(-w2/2,-h2/2,w2,5);
  };
  else if(['listcard','fieldcard','dayheader','avscript','colcard','callsheet','schedule'].includes(spec.cat)) drawFn = (tc,w2,h2,col)=>{
    tc.beginPath(); tc.roundRect(-w2/2,-h2/2,w2,h2,4);
    tc.fillStyle='#fff'; tc.fill(); tc.strokeStyle=col; tc.stroke();
    tc.fillStyle=col; tc.globalAlpha=.3; tc.fillRect(-w2/2,-h2/2,w2,h2*.24); tc.globalAlpha=1;
    tc.globalAlpha=.55;
    for(const y2 of [h2*.02, h2*.22]) tc.fillRect(-w2*.36, y2, w2*.72, 2.5);
    tc.globalAlpha=1;
  };
  else if(def) drawFn = (tc,w,h,col)=>PROPS.custom.draw(tc,w,h,col,def);
  else if(PROPS[spec.kind]) drawFn = PROPS[spec.kind].draw;
  else drawFn = (tc,w2,h2,col)=>{ tc.strokeStyle=col; tc.strokeRect(-w2/2,-h2/2,w2,h2); };
  libGhost.appendChild(tileCanvas(drawFn, spec.w, spec.h, spec.color||'#5B6472'));
  document.body.appendChild(libGhost);
  moveLibGhost(e);
  document.addEventListener('pointermove', moveLibGhost);
  document.addEventListener('pointerup', dropLib, {once:true});
  document.addEventListener('pointercancel', cancelLibDrag, {once:true});
}
function moveLibGhost(e){
  if(libGhost){ libGhost.style.left = e.clientX+'px'; libGhost.style.top = e.clientY+'px'; }
}
function dropLib(e){
  document.removeEventListener('pointermove', moveLibGhost);
  document.removeEventListener('pointercancel', cancelLibDrag);
  if(libGhost){ libGhost.remove(); libGhost = null; }
  if(!libDrag) return;
  const r = cv.getBoundingClientRect();
  if(e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom){
    const {x, y} = toWorld(e.clientX - r.left, e.clientY - r.top);
    const shot = activeShot();
    let o;
    if(libDrag.cat === 'todo'){
      o = {id:uid(), cat:'todo', kind:'todo', x, y, rot:0, w:230, h:120,
           label:'To-do',
           items:[{t:'To do 1', done:false},{t:'To do 2', done:false},{t:'To do 3', done:false}],
           color:libDrag.color||'#3E9B6E', path:[]};
      if(libDrag.checklist){
        o.label = 'Checklist';
        o.items = [{t:'', done:false}];
        showChecklistPicker(o, e.clientX, e.clientY); // Checklist 2.0: pick a template
      }
    } else if(libDrag.cat === 'table'){
      o = {id:uid(), cat:'table', kind:'table', x, y, rot:0, w:340, h:90,
           cells:[['Column A','Column B'],['','']], color:libDrag.color||'#4B6BFB', label:'', path:[]};
    } else if(libDrag.cat === 'listcard'){
      o = {id:uid(), cat:'listcard', kind:libDrag.kind, x, y, rot:0, w:360, h:74,
           color:(LIST_CARDS[libDrag.kind] || LIST_CARDS.crew).color, label:'', path:[]};
      // a fresh crew starts from the standard call-sheet roles
      if(libDrag.kind === 'crew' && !peopleReg().some(p=>p.tag === 'crew')){
        for(const role of ['Director','DoP','AC','Gaffer','Sound'])
          peopleReg().push({id:uid(), name:'', role, phone:'', email:'', tag:'crew', call:''});
      }
    } else if(libDrag.cat === 'avscript'){
      o = {id:uid(), cat:'avscript', kind:'avscript', x, y, rot:0, w:560, h:150,
           rows:[1,2,3].map(()=>({id:uid(), no:'', time:'', audio:'', video:'', notes:'', imgId:null})),
           cols:{no:false, still:false, notes:false},
           color:libDrag.color || '#8B5CF6', label:'', path:[]};
    } else if(libDrag.cat === 'colcard'){
      o = {id:uid(), cat:'colcard', kind:'colcard', x, y, rot:0, w:libDrag.cw || 240, h:120,
           title:libDrag.title || '', text:libDrag.text || '',
           color:libDrag.color || '#4B6BFB', label:'', path:[]};
    } else if(libDrag.cat === 'callsheet'){
      o = {id:uid(), cat:'callsheet', kind:'callsheet', x, y, rot:0, w:380, h:300,
           inc:{location:true, schedule:true, crew:true, cast:true, client:true, weather:true},
           color:libDrag.color || '#4B6BFB', label:'', path:[]};
    } else if(libDrag.cat === 'schedule'){
      o = {id:uid(), cat:'schedule', kind:'schedule', x, y, rot:0, w:320, h:200,
           on:{}, color:libDrag.color || '#E8934C', label:'', path:[]};
    } else if(libDrag.cat === 'dayheader'){
      o = {id:uid(), cat:'dayheader', kind:'dayheader', x, y, rot:0, w:DAYH.w, h:140,
           date:new Date().toISOString().slice(0,10), call:'', shootCall:'', wrap:'',
           place:'', lat:null, lon:null, color:'#E8604C', label:'', path:[]};
      setTimeout(()=>dayheaderSunFetch(o), 100); // auto-pull sun from the location card if one exists
    } else if(libDrag.cat === 'fieldcard'){
      o = {id:uid(), cat:'fieldcard', kind:libDrag.kind, x, y, rot:0, w:280, h:130,
           color:(FIELD_CARDS[libDrag.kind] || FIELD_CARDS.prodinfo).color, label:'', path:[]};
      if(libDrag.kind === 'location'){
        // bind to the first location no card shows yet; else start a fresh one
        normalizeProduction();
        const bound = new Set();
        const boards = [...project.scenes, project.moodboard, project.prodboard, project.scriptboard];
        for(const b of boards) if(b) for(const ob of b.objects)
          if(ob.cat === 'fieldcard' && ob.kind === 'location' && ob.locId) bound.add(ob.locId);
        const free = project.production.locations.find(l=>!bound.has(l.id));
        if(free) o.locId = free.id;
        else {
          const loc = {id:uid(), name:'', address:'', parking:'', power:'', hospital:'', notes:''};
          project.production.locations.push(loc);
          o.locId = loc.id;
        }
      }
    } else if(libDrag.cat === 'weather'){
      o = {id:uid(), cat:'weather', kind:'weather', x, y, rot:0, w:240, h:225,
           place:'', date:'', data:[], color:'#4CA6E8', label:'', path:[]};
    } else if(libDrag.cat === 'colorcard'){
      o = {id:uid(), cat:'colorcard', kind:'colorcard', x, y, rot:0, w:160, h:130,
           hex:'#E8604C', label:'', color:'#E8604C', path:[]};
    } else if(libDrag.cat === 'script'){
      o = {id:uid(), cat:'script', kind:'script', x, y, rot:0,
           w: libDrag.mode==='av' ? 560 : 430, h:300,
           mode: libDrag.mode||'film', text:'', textR:'', fontSize:12.5,
           color:'#5B6472', label:'', path:[]};
    } else if(libDrag.cat === 'sbrow'){
      o = {id:uid(), cat:'sbrow', kind:'sbrow', x, y, rot:0, w:560, h:120,
           title:'Scene', desc:'', imgId:null, sceneId:null, color:'#4B6BFB', label:'', path:[]};
    } else if(libDrag.cat === 'text'){
      o = {id:uid(), cat:'text', kind:'text', x, y, rot:0, w:240, h:40,
           fontSize:18, bold:false, italic:false, text:'', color:'#5B6472', label:'', path:[]};
    } else if(libDrag.cat === 'line'){
      o = {id:uid(), cat:'line', kind:'line', x, y, rot:0, w:220, h:14,
           p1:{x:x-110, y}, p2:{x:x+110, y},
           weight:2.5, dashed:false, arrow:true, color:libDrag.color||'#E8604C', label:'', path:[]};
    } else if(libDrag.cat === 'link'){
      o = {id:uid(), cat:'link', kind:'link', x, y, rot:0, w:180, h:218,
           label:'', url:'', color:libDrag.color||'#4B6BFB', path:[]};
    } else if(libDrag.cat === 'infocard'){
      o = {id:uid(), cat:'infocard', kind:'infocard', x, y, rot:0, w:260, h:180,
           color:libDrag.color||'#4B6BFB', label:'', path:[]};
    } else if(libDrag.kind === 'track'){
      o = {id:uid(), cat:'prop', kind:'track', x, y, rot:0, w:30, h:30,
           color:libDrag.color||'#5B6472', label:'', path:[],
           pts:[{x:x-160, y}, {x:x+160, y}]};
    } else {
      o = {
        id: uid(), cat: libDrag.cat, kind: libDrag.kind,
        x, y, rot: 0, w: libDrag.w, h: libDrag.h,
        color: libDrag.color || '#5B6472',
        label: libDrag.label || '',
        path: [],
      };
      if(libDrag.cat === 'camera'){ o.fov = libDrag.fov; o.range = libDrag.range; o.lens = null; }
      if(libDrag.cat === 'note'){ o.text = ''; }
      if(libDrag.props) Object.assign(o, libDrag.props);
      if(libDrag.kind === 'actor' && !o.label){
        const n = shot.objects.filter(x=>x.kind==='actor').length + 1;
        o.label = 'Actor ' + n;
      }
    }
    shot.objects.push(o);
    sel = {type:'object', id:o.id};
    setTool('select');
    markDirty(); render(); refreshSelBar();
    if(libDrag.cat === 'note') openNoteEditor(o);
  }
  libDrag = null;
}

// ---------------------------------------------------------------- Checklist 2.0 template picker
function showChecklistPicker(o, cx, cy){
  const old = document.getElementById('chkPop');
  if(old) old.remove();
  const pop = document.createElement('div');
  pop.id = 'chkPop';
  pop.style.cssText = 'position:fixed;z-index:130;background:#fff;border:1px solid var(--line);' +
    'border-radius:3px;box-shadow:0 16px 50px rgba(40,38,32,.18);padding:10px;min-width:170px;';
  pop.style.left = Math.min(cx, window.innerWidth - 200) + 'px';
  pop.style.top = Math.min(cy, window.innerHeight - 240) + 'px';
  pop.insertAdjacentHTML('beforeend',
    '<div style="font-weight:600;font-size:12px;margin-bottom:6px">Checklist template</div>');
  const pick = (label, items)=>{
    const b = document.createElement('button');
    b.className = 'proj-row';
    b.textContent = label;
    b.addEventListener('click', ()=>{
      o.label = label === 'Blank' ? 'Checklist' : label;
      o.items = items.length ? items.map(t=>({t, done:false})) : [{t:'', done:false}];
      markDirty(); render();
      pop.remove();
      if(!items.length) openTodoItem(o, 0);
    });
    pop.appendChild(b);
  };
  for(const [name, items] of Object.entries(CHECKLIST_TEMPLATES)) pick(name, items);
  pick('Blank', []);
  document.body.appendChild(pop);
  setTimeout(()=>{
    const close = ev=>{ if(!pop.contains(ev.target)){ pop.remove(); document.removeEventListener('pointerdown', close, true); } };
    document.addEventListener('pointerdown', close, true);
  }, 0);
}

// ---------------------------------------------------------------- paste-to-import (list cards)
// "I have this in WhatsApp/mail already": paste lines, FLOOR splits each into
// name / role / phone / email / call heuristically, you confirm, registry grows.
function parseContactLine(line){
  let s = ' ' + line + ' ';
  const email = (s.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) || [''])[0];
  if(email) s = s.replace(email, ' ');
  const phone = (s.match(/\+?\d[\d\s\-()\/.]{5,}\d/) || [''])[0];
  if(phone) s = s.replace(phone, ' ');
  let call = '';
  const toks = s.split(/[,;|\t·•–—]+/).map(t=>t.trim().replace(/^[-:\s]+|[-:\s]+$/g,'')).filter(Boolean);
  const rest = [];
  for(const t of toks){
    if(!call && /^\d{1,2}[:.]\d{2}(\s?(h|hr|uur))?$/i.test(t)) call = t.replace('.',':').replace(/\s?(h|hr|uur)$/i,'');
    else rest.push(t);
  }
  return {name: rest[0] || '', role: rest.slice(1).join(', '),
          phone: phone.trim(), email, call};
}
function showPasteImport(card){
  const spec = LIST_CARDS[card.kind] || LIST_CARDS.crew;
  const old = document.getElementById('pastePop');
  if(old) old.remove();
  const wrap2 = document.createElement('div');
  wrap2.id = 'pastePop';
  wrap2.style.cssText = 'position:fixed;inset:0;z-index:140;background:rgba(40,38,32,.25);' +
    'display:flex;align-items:center;justify-content:center;';
  wrap2.innerHTML = `
    <div style="background:#fff;border:1px solid var(--line);border-radius:3px;padding:16px 18px;
                width:520px;max-width:92vw;max-height:82vh;overflow:auto;box-shadow:0 18px 60px rgba(40,38,32,.2)">
      <div style="font-weight:600;margin-bottom:2px">Paste ${esc(spec.title.toLowerCase())} list</div>
      <div style="font-size:10.5px;color:var(--ink2);margin-bottom:10px;line-height:1.5">
        One person per line — e.g. "Arthur Vis, gaffer, +31 6 439 001, arthur@zout.nl".
        FLOOR picks out the name, role, phone, email and call time; check the preview, then add.
      </div>
      <textarea id="ppText" rows="6" placeholder="Paste here…"
        style="width:100%;border:1px solid var(--line);border-radius:2px;padding:8px 10px;
               font-size:12.5px;font-family:inherit;resize:vertical"></textarea>
      <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--ink2);margin:8px 0 2px">
        <input type="checkbox" id="ppSwap"> lines are "role, name" instead of "name, role"
      </label>
      <div id="ppPrev" style="font-size:11.5px;margin:8px 0;line-height:1.6"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button class="btn" id="ppCancel">Cancel</button>
        <button class="btn primary" id="ppAdd" disabled>Add 0 people</button>
      </div>
    </div>`;
  document.body.appendChild(wrap2);
  const ta = wrap2.querySelector('#ppText');
  const prev = wrap2.querySelector('#ppPrev');
  const addB = wrap2.querySelector('#ppAdd');
  const swap = wrap2.querySelector('#ppSwap');
  let parsed = [];
  const paint = ()=>{
    parsed = ta.value.split('\n').map(l=>l.trim()).filter(Boolean).map(parseContactLine);
    if(swap.checked) parsed = parsed.map(p=>({...p, name:p.role.split(',')[0]||p.role, role:p.name}));
    prev.innerHTML = parsed.map(p=>
      '<div style="display:flex;gap:8px;border-bottom:1px solid var(--line);padding:3px 0">' +
      '<b style="flex:1">' + esc(p.name || '—') + '</b>' +
      '<span style="flex:1;color:var(--ink2)">' + esc(p.role || '') + '</span>' +
      '<span style="width:44px">' + esc(p.call || '') + '</span>' +
      '<span style="flex:1">' + esc(p.phone || '') + '</span>' +
      '<span style="flex:1;color:var(--ink2)">' + esc(p.email || '') + '</span></div>').join('');
    addB.disabled = !parsed.length;
    addB.textContent = 'Add ' + parsed.length + (parsed.length === 1 ? ' person' : ' people');
  };
  ta.addEventListener('input', paint);
  swap.addEventListener('change', paint);
  ta.addEventListener('keydown', e=>e.stopPropagation());
  wrap2.querySelector('#ppCancel').addEventListener('click', ()=>wrap2.remove());
  wrap2.addEventListener('pointerdown', e=>{ if(e.target === wrap2) wrap2.remove(); });
  addB.addEventListener('click', ()=>{
    for(const p of parsed){
      peopleReg().push({id:uid(), name:p.name, role:p.role, phone:p.phone,
        email:p.email, tag:spec.tag, call:p.call});
    }
    markDirty(); render(); refreshSelBar();
    toast(parsed.length + ' added to the People registry');
    wrap2.remove();
  });
  ta.focus();
}

// ---------------------------------------------------------------- custom prop popover + drawn outlines
const pop = document.getElementById('customPop');
function showCustomPop(){
  pop.innerHTML = `
    <div style="font-weight:600;margin-bottom:2px">New custom prop</div>
    <label>Name</label><input id="cpName" placeholder="e.g. Piano" maxlength="30">
    <div class="row">
      <div style="flex:1"><label>Width (cm)</label><input id="cpW" type="number" value="80" min="10" max="4000"></div>
      <div style="flex:1"><label>Depth (cm)</label><input id="cpH" type="number" value="60" min="10" max="4000"></div>
    </div>
    <label>Shape</label>
    <select id="cpShape"><option value="rect">Rectangle</option><option value="circle">Circle</option></select>
    <div class="actions">
      <button class="btn" id="cpDraw" title="Click points on the canvas to draw any outline">✏ Draw</button>
      <button class="btn primary" id="cpAdd">Add</button>
    </div>
    <div style="margin-top:8px;font-size:10.5px;color:var(--ink2);line-height:1.45">
      ✏ Draw: click the outline point by point on the canvas, double-click or Enter to close.
    </div>`;
  pop.classList.add('show');
  pop.style.left = '18px'; pop.style.top = '60px';
  pop.querySelector('#cpName').focus();
  pop.querySelector('#cpAdd').addEventListener('click', ()=>{
    const name = pop.querySelector('#cpName').value.trim() || 'Custom prop';
    const w = clamp(+pop.querySelector('#cpW').value||80, 10, 4000);
    const h = clamp(+pop.querySelector('#cpH').value||60, 10, 4000);
    const shape = pop.querySelector('#cpShape').value;
    project.customProps.push({id:uid(), name, w, h, shape, color:'#5B6472'});
    markDirty(); buildLibrary(); hideCustomPop();
  });
  pop.querySelector('#cpDraw').addEventListener('click', ()=>{
    const name = pop.querySelector('#cpName').value.trim() || 'Custom prop';
    hideCustomPop();
    setTool('poly');
    polyDraw = {name, pts:[], mouse:null};
    toast('Click points on the canvas to draw the outline — Enter or double-click to close');
  });
  pop.addEventListener('keydown', e=>{
    if(e.key==='Enter') pop.querySelector('#cpAdd').click();
    if(e.key==='Escape') hideCustomPop();
    e.stopPropagation();
  });
}
function hideCustomPop(){ pop.classList.remove('show'); }
function finishPoly(){
  if(!polyDraw) return;
  // drop duplicate trailing clicks (double-click adds two nearly identical points)
  const pts = [];
  for(const p of polyDraw.pts){
    const last = pts[pts.length-1];
    if(!last || dist(last.x,last.y,p.x,p.y) > 3) pts.push(p);
  }
  if(pts.length < 3){
    toast('Need at least 3 points — outline cancelled');
    polyDraw = null; setTool('select'); render();
    return;
  }
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  pts.forEach(p=>{ minX=Math.min(minX,p.x); minY=Math.min(minY,p.y); maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y); });
  const w = Math.max(20, maxX-minX), h = Math.max(20, maxY-minY);
  const cx = (minX+maxX)/2, cy = (minY+maxY)/2;
  const npts = pts.map(p=>({x:(p.x-cx)/w, y:(p.y-cy)/h}));
  const name = polyDraw.name || 'Custom prop';
  project.customProps.push({id:uid(), name, shape:'poly', pts:npts, w:Math.round(w), h:Math.round(h), color:'#5B6472'});
  polyDraw = null;
  markDirty(); buildLibrary(); setTool('select'); render();
  toast(`“${name}” added to your custom props`);
}
