// Landing page — the interface in action.
// A faithful stand-in for the app window (top bar, floors, library with the
// app's own icons from landing/img/ui-icons.png, floating toolbar, selection
// bar) and a cursor that works it: drags tiles onto the board, picks a lens
// from the menu, drops photos from outside, groups them into a sub-board,
// presses play. Everything is a function of time, so hovering pauses cleanly.
(function(){
  const W = 1280, H = 760, SIDE = 282, TOP = 60;
  const C = {bg:'#FFFFFF', canvas:'#F7F7F8', side:'#FFFFFF', line:'#E8E8EC', ink:'#1D1D1F', ink2:'#5F5F66', ink3:'#8E8E95', soft:'#F2F2F4', soft2:'#E9E9EC', acc:'#0A7CFF', accSoft:'#E2EFFF', coral:'#FF5E57', sand:'#E2A93B', glass:'#7FA9E6', dot:'#D6D6DC', note:'#FCEFC0', green:'#2DB45A'};
  // UI 2.0: one colour per floor
  const FLOOR = {mood:['#FF5E57', '#FFECEB'], write:['#A259FF', '#F4EBFF'], design:['#0A7CFF', '#E2EFFF'], shots:['#14A8C2', '#E3F5F8'], budget:['#2DB45A', '#E6F6EB'], org:['#FF9500', '#FFF2E0']};
  if(document.fonts && document.fonts.load){ document.fonts.load('600 13px Geist'); document.fonts.load('600 13px "Geist Mono"'); }
  const clamp = (v, a, b)=>v < a ? a : v > b ? b : v;
  const ease = t=>{ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const back = t=>{ t = clamp(t, 0, 1); const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }; // overshoot pop
  const span = (t, a, b)=>clamp((t - a) / (b - a), 0, 1);
  const lerp = (a, b, k)=>a + (b - a) * k;
  const font = (px, w)=>`${w || 500} ${px}px Geist, -apple-system, "SF Pro Text", "Segoe UI", sans-serif`;

  // ---------------------------------------------------------------- icons
  let sprite = null, iconIdx = {}, CELL = 88;
  const spriteReady = Promise.all([
    new Promise(res=>{ const im = new Image(); im.onload = ()=>{ sprite = im; res(); }; im.onerror = res; im.src = 'landing/img/ui-icons.png'; }),
    fetch('landing/img/ui-icons.json').then(r=>r.json()).then(j=>{ iconIdx = j.icons || {}; CELL = j.cell || 88; }).catch(()=>{}),
  ]);
  function icon(ctx, label, x, y, s){
    const p = iconIdx[label];
    if(sprite && p) ctx.drawImage(sprite, p[0], p[1], CELL, CELL, x, y, s, s);
    else { rr(ctx, x, y, s, s, s * .24, '#ccc'); }
  }

  // ---------------------------------------------------------------- primitives
  function rr(ctx, x, y, w, h, r, fill, stroke, lw){ ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if(fill){ ctx.fillStyle = fill; ctx.fill(); } if(stroke){ ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); } }
  function txt(ctx, s, x, y, px, col, w, al){ ctx.font = font(px, w); ctx.fillStyle = col || C.ink; ctx.textAlign = al || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); }
  function tw(ctx, s, px, w){ ctx.font = font(px, w); return ctx.measureText(s).width; }
  function shadow(ctx, blur, y, a){ ctx.shadowColor = `rgba(30,28,24,${a || .16})`; ctx.shadowBlur = blur; ctx.shadowOffsetY = y; }
  function noShadow(ctx){ ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
  function arrow(ctx, x, y, press){
    ctx.save(); ctx.translate(x, y); const s = press ? 1.05 : 1.2; ctx.scale(s, s);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 16); ctx.lineTo(3.8, 12.3); ctx.lineTo(6.8, 18.6); ctx.lineTo(9.6, 17.3); ctx.lineTo(6.7, 11); ctx.lineTo(11.8, 10.8); ctx.closePath();
    ctx.fillStyle = '#111'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
    if(press){ ctx.save(); ctx.strokeStyle = C.acc; ctx.globalAlpha = .55; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.stroke(); ctx.restore(); }
  }
  function photo(ctx, x, y, w, h, i, r){
    const pal = [['#7A5C3B', '#E1B86B'], ['#2B3A67', '#7FA9E6'], ['#4A6B3A', '#C8D9A3'], ['#8A2F2F', '#E8A090'], ['#3A3A3A', '#C9C4B9'], ['#B0632A', '#F0C674'], ['#22505A', '#89C2C6'], ['#5B4A7A', '#CDB6F0']];
    const [a, b] = pal[i % pal.length]; const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, a); g.addColorStop(1, b);
    rr(ctx, x, y, w, h, r == null ? 6 : r, g);
    ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.ellipse(x + w * .64, y + h * .58, w * .2, h * .28, -.4, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(x, y + h * .78, w, h * .22);
  }
  // cursor keyframes → position at t
  function path(keys, t){
    if(t <= keys[0][0]) return {x:keys[0][1], y:keys[0][2]};
    for(let i = 1; i < keys.length; i++){ const [t1, x1, y1] = keys[i], [t0, x0, y0] = keys[i - 1]; if(t <= t1){ const k = ease((t - t0) / Math.max(.001, t1 - t0)); return {x:lerp(x0, x1, k), y:lerp(y0, y1, k)}; } }
    const l = keys[keys.length - 1]; return {x:l[1], y:l[2]};
  }
  const inAny = (t, ranges)=>ranges.some(([a, b])=>t >= a && t < b);

  // ---------------------------------------------------------------- the app window
  const TABS = [['Mood', 'mood'], ['Script', 'write'], ['Shot designer', 'design'], ['Shot list', 'shots'], ['Budget', 'budget'], ['Production', 'org']];
  function chrome(ctx, active, crumb){
    C.acc = FLOOR[active][0]; C.accSoft = FLOOR[active][1];
    rr(ctx, 0, 0, W, H, 0, C.canvas);
    // glass top bar
    ctx.fillStyle = 'rgba(255,255,255,.86)'; ctx.fillRect(0, 0, W, TOP); ctx.fillStyle = C.line; ctx.fillRect(0, TOP - .5, W, 1);
    const ig = ctx.createLinearGradient(16, 15, 46, 45); ig.addColorStop(0, '#0A7CFF'); ig.addColorStop(.55, '#6B5BFF'); ig.addColorStop(1, '#FF5E57');
    shadow(ctx, 6, 2, .18); rr(ctx, 16, 15, 30, 30, 9, ig); noShadow(ctx);
    ctx.fillStyle = '#fff'; [[7, 23], [11, 28.5], [15, 34]].forEach(([w, y])=>rr(ctx, 23, y - 1.25, w, 2.5, 1.2, '#fff'));
    const pn = 'Licht — Van Gogh brand film';
    txt(ctx, pn + '  ▾', 58, crumb ? 23 : 30, 14, C.ink, 650);
    if(crumb) txt(ctx, crumb, 58, 41, 11.5, C.ink3, 500);
    // the floors: one segmented control, a colour per floor
    const ws = TABS.map(([n, k])=>tw(ctx, n, 13, k === active ? 650 : 500) + 43);
    const tot = ws.reduce((a, b)=>a + b, 0) + 2 * (TABS.length - 1) + 6;
    let x = (W - tot) / 2;
    rr(ctx, x, 11, tot, 38, 12, C.soft2); x += 3;
    TABS.forEach(([n, k], i)=>{
      const on = k === active, c = FLOOR[k][0];
      if(on){ shadow(ctx, 3, 1, .14); rr(ctx, x, 14, ws[i], 32, 9, '#fff'); noShadow(ctx); }
      ctx.globalAlpha = on ? 1 : .55; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 18, 30, 4, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      txt(ctx, n, x + 29, 30.5, 13, on ? c : C.ink2, on ? 650 : 500);
      x += ws[i] + 2;
    });
    txt(ctx, 'Saved', 1034, 30, 12, C.ink3, 500, 'right');
    rr(ctx, 1046, 14, 74, 32, 9, '#fff', '#D5D5DB'); txt(ctx, 'Share', 1083, 30.5, 13, C.ink, 600, 'center');
    ctx.save(); ctx.shadowColor = C.acc + '66'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2; rr(ctx, 1128, 14, 80, 32, 9, C.acc); ctx.restore();
    txt(ctx, 'Export', 1168, 30.5, 13, '#fff', 650, 'center');
    txt(ctx, '?', 1240, 30.5, 14, C.ink2, 700, 'center');
  }
  // library: groups of tiles; returns rects by label
  function sideLayout(groups){
    const rects = {}, heads = []; let y = TOP + 150;
    for(const [head, color, labels] of groups){
      heads.push([head, color, y]); y += 20;
      labels.forEach((l, i)=>{ const col = i % 3, row = Math.floor(i / 3); rects[l] = {x:26 + col * 82, y:y + row * 86, w:78, h:82}; });
      y += Math.ceil(labels.length / 3) * 86 + 10;
    }
    return {rects, heads};
  }
  function sidebar(ctx, lay, hot, press){
    // a floating panel: rounded, soft shadow, search and category chips on top
    const px = 14, py = TOP + 14, pw = SIDE - px - 4, ph = H - py - 14;
    shadow(ctx, 30, 12, .10); rr(ctx, px, py, pw, ph, 22, '#fff'); noShadow(ctx); rr(ctx, px, py, pw, ph, 22, null, C.line);
    ctx.save(); ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 22); ctx.clip();
    txt(ctx, 'Library', px + 16, py + 24, 15, C.ink, 700);
    rr(ctx, px + 12, py + 42, pw - 24, 34, 11, C.soft);
    ctx.strokeStyle = C.ink3; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(px + 30, py + 58, 5.2, 0, 7); ctx.moveTo(px + 34, py + 62); ctx.lineTo(px + 38, py + 66); ctx.stroke();
    txt(ctx, 'Search the library…', px + 46, py + 59, 12.5, C.ink3, 500);
    let cx = px + 12;
    ['All'].concat(lay.heads.map(h=>h[0].charAt(0) + h[0].slice(1).toLowerCase())).forEach((c, i)=>{
      const w = tw(ctx, c, 12, 600) + 22; if(cx + w > px + pw - 8) return;
      rr(ctx, cx, py + 86, w, 26, 13, i ? C.soft : C.ink); txt(ctx, c, cx + w / 2, py + 99.5, 12, i ? C.ink2 : '#fff', 600, 'center'); cx += w + 6;
    });
    for(const [h, color, y] of lay.heads){ txt(ctx, h, px + 14, y + 4, 10.5, C.ink3, 700); }
    for(const [l, r] of Object.entries(lay.rects)){
      const isHot = l === hot, s = isHot && press ? .94 : 1;
      ctx.save(); ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.scale(s, s); ctx.translate(-r.w / 2, -r.h / 2);
      if(isHot) rr(ctx, 0, 0, r.w, r.h, 14, C.soft);
      shadow(ctx, 8, 3, .14); icon(ctx, l, (r.w - 48) / 2, 7, 48); noShadow(ctx);
      txt(ctx, l.length > 12 ? l.slice(0, 11) + '…' : l, r.w / 2, r.h - 12, 11, C.ink2, 550, 'center');
      ctx.restore();
    }
    ctx.restore();
  }
  function canvasBg(ctx){
    ctx.save(); ctx.beginPath(); ctx.rect(0, TOP, W, H - TOP); ctx.clip();
    ctx.fillStyle = C.canvas; ctx.fillRect(0, TOP, W, H - TOP);
    ctx.fillStyle = C.dot; for(let x = 11; x < W; x += 22) for(let y = TOP + 11; y < H; y += 22){ ctx.beginPath(); ctx.arc(x, y, 1, 0, 7); ctx.fill(); }
  }
  function toolbar(ctx, withPlay, playHot){
    const items = withPlay ? ['sel', 'box', 'wall', 'room', 'pen', 'text', 'play'] : ['sel', 'box', 'pen', 'text', 'note', 'img', 'fit'];
    const w = items.length * 42 + 12, x0 = SIDE + (W - SIDE - w) / 2, y0 = H - 20 - 54;
    shadow(ctx, 30, 12, .10); rr(ctx, x0, y0, w, 54, 16, '#fff'); noShadow(ctx); rr(ctx, x0, y0, w, 54, 16, null, C.line);
    items.forEach((k, i)=>{
      const cx = x0 + 6 + i * 42 + 21, cy = y0 + 27;
      if(k === 'sel') rr(ctx, cx - 20, cy - 20, 40, 40, 11, C.accSoft);
      if(k === 'play' && playHot) rr(ctx, cx - 20, cy - 20, 40, 40, 11, C.acc);
      ctx.strokeStyle = k === 'play' && playHot ? '#fff' : k === 'sel' ? C.acc : C.ink2; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      if(k === 'sel'){ ctx.moveTo(cx - 5, cy - 8); ctx.lineTo(cx - 5, cy + 7); ctx.lineTo(cx - 1, cy + 3); ctx.lineTo(cx + 2, cy + 9); ctx.lineTo(cx + 4, cy + 8); ctx.lineTo(cx + 1, cy + 2); ctx.lineTo(cx + 6, cy + 2); ctx.closePath(); ctx.fill(); }
      else if(k === 'box'){ ctx.setLineDash([3, 3]); ctx.strokeRect(cx - 8, cy - 7, 16, 14); ctx.setLineDash([]); }
      else if(k === 'wall'){ ctx.moveTo(cx - 9, cy + 6); ctx.lineTo(cx + 9, cy - 6); ctx.stroke(); }
      else if(k === 'room'){ ctx.strokeRect(cx - 8, cy - 7, 16, 14); }
      else if(k === 'pen'){ ctx.moveTo(cx - 7, cy + 7); ctx.lineTo(cx + 6, cy - 6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - 8, cy + 8); ctx.lineTo(cx - 5, cy + 7); }
      else if(k === 'text'){ ctx.moveTo(cx - 7, cy - 7); ctx.lineTo(cx + 7, cy - 7); ctx.moveTo(cx, cy - 7); ctx.lineTo(cx, cy + 8); }
      else if(k === 'note'){ ctx.moveTo(cx - 7, cy - 7); ctx.lineTo(cx + 7, cy - 7); ctx.lineTo(cx + 7, cy + 2); ctx.lineTo(cx + 2, cy + 7); ctx.lineTo(cx - 7, cy + 7); ctx.closePath(); }
      else if(k === 'img'){ ctx.strokeRect(cx - 8, cy - 6, 16, 12); ctx.moveTo(cx - 8, cy + 4); ctx.lineTo(cx - 2, cy - 1); ctx.lineTo(cx + 3, cy + 3); }
      else if(k === 'fit'){ [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b])=>{ ctx.moveTo(cx + a * 8, cy + b * 3); ctx.lineTo(cx + a * 8, cy + b * 8); ctx.lineTo(cx + a * 3, cy + b * 8); }); }
      else if(k === 'play'){ ctx.moveTo(cx - 5, cy - 7); ctx.lineTo(cx + 7, cy); ctx.lineTo(cx - 5, cy + 7); ctx.closePath(); ctx.fill(); }
      ctx.stroke();
    });
    return {x0, y0, w, play:withPlay ? {x:x0 + 6 + 6 * 42 + 21, y:y0 + 27} : null};
  }
  function zoomPill(ctx){ const y = TOP + 16; shadow(ctx, 16, 6, .1); rr(ctx, W - 130, y, 112, 38, 12, '#fff'); noShadow(ctx); rr(ctx, W - 130, y, 112, 38, 12, null, C.line); txt(ctx, '−', W - 110, y + 19, 17, C.ink2, 500, 'center'); ctx.font = '600 12.5px "Geist Mono", ui-monospace, monospace'; ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.fillText('82%', W - 74, y + 19); ctx.textAlign = 'left'; txt(ctx, '+', W - 38, y + 19, 17, C.ink2, 500, 'center'); }
  // selection bar: chips laid out centred under the toolbar; returns chip rects
  function selBar(ctx, chips, k){
    if(k <= 0) return {};
    const gap = 6, pad = 12; const ws = chips.map(c=>c.w || (tw(ctx, c.t, 12.5, 600) + (c.dd ? 34 : 24)));
    const w = ws.reduce((a, b)=>a + b, 0) + gap * (chips.length - 1) + pad * 2;
    const x0 = SIDE + (W - SIDE - w) / 2, y0 = TOP + 16 - (1 - k) * 12;
    ctx.save(); ctx.globalAlpha = k;
    shadow(ctx, 22, 8, .14); rr(ctx, x0, y0, w, 44, 14, '#fff'); noShadow(ctx); rr(ctx, x0, y0, w, 44, 14, null, C.line);
    const out = {}; let x = x0 + pad;
    chips.forEach((c, i)=>{
      const cw = ws[i];
      if(c.sw){ c.sw.forEach((col, j)=>{ ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + 10 + j * 22, y0 + 22, 8, 0, 7); ctx.fill(); if(j === 0){ ctx.strokeStyle = C.acc; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 10, y0 + 22, 11, 0, 7); ctx.stroke(); } }); }
      else {
        rr(ctx, x, y0 + 7, cw, 30, 8, c.hot ? C.accSoft : (c.primary ? C.acc : C.soft), c.hot ? C.acc : null, 1.2);
        txt(ctx, c.t, x + 11, y0 + 22.5, 12.5, c.primary ? '#fff' : (c.hot ? C.acc : C.ink), 600);
        if(c.dd) txt(ctx, '▾', x + cw - 15, y0 + 22.5, 10, c.hot ? C.acc : C.ink3);
      }
      out[c.id || c.t] = {x, y:y0 + 7, w:cw, h:30, cx:x + cw / 2, cy:y0 + 22};
      x += cw + gap;
    });
    ctx.restore();
    return out;
  }
  function handles(ctx, x, y, w, h, rot, k){
    if(k <= 0) return;
    ctx.save(); ctx.globalAlpha = k; ctx.translate(x, y); ctx.rotate(rot || 0);
    ctx.strokeStyle = C.acc; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.strokeRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16); ctx.setLineDash([]);
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b])=>{ rr(ctx, a * (w / 2 + 8) - 5, b * (h / 2 + 8) - 5, 10, 10, 2.5, '#fff', C.acc, 1.5); });
    ctx.beginPath(); ctx.moveTo(0, -h / 2 - 8); ctx.lineTo(0, -h / 2 - 30); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -h / 2 - 34, 6, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function ghost(ctx, label, x, y, k){ if(k <= 0) return; ctx.save(); ctx.globalAlpha = .9 * k; shadow(ctx, 20, 10, .25); rr(ctx, x - 30, y - 30, 60, 60, 16, '#fff'); noShadow(ctx); icon(ctx, label, x - 23, y - 25, 46); ctx.restore(); }
  function dropRing(ctx, x, y, k){ if(k <= 0 || k >= 1) return; ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = C.acc; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 14 + 40 * k, 0, 7); ctx.stroke(); ctx.restore(); }

  // ================================================================ SHOT DESIGNER
  const D = {
    period:17,
    lay:sideLayout([['CAMERAS', '#6FA3E8', ['Camera', 'Steadicam', 'Gimbal', 'GoPro / crash', 'Drone']], ['CAST', C.coral, ['Actor', 'Actor 2', 'Extra', 'Child', 'Dog', 'Cat']], ['LIGHT', C.sand, ['LED light', 'Kino Flo', 'LED panel', 'Fresnel', 'HMI', 'Astera tube']]]),
    cam:{x:520, y:420}, actor:{x:870, y:560}, led:{x:1010, y:430},
  };
  const LENSES = [[24, 55], [32, 43], [40, 35], [50, 28], [65, 22], [75, 19]];
  function roomD(ctx){
    // walls, a window, a door, a sofa and a table already on the plan
    ctx.strokeStyle = '#2B2A27'; ctx.lineWidth = 9; ctx.lineCap = 'square';
    ctx.beginPath(); ctx.moveTo(360, 250); ctx.lineTo(1190, 250); ctx.lineTo(1190, 720); ctx.lineTo(360, 720); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(560, 250); ctx.lineTo(760, 250); ctx.moveTo(1190, 560); ctx.lineTo(1190, 640); ctx.stroke();
    ctx.strokeStyle = C.glass; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(560, 247); ctx.lineTo(760, 247); ctx.moveTo(560, 253); ctx.lineTo(760, 253); ctx.stroke();
    ctx.strokeStyle = '#2B2A27'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(1190, 560); ctx.lineTo(1120, 560); ctx.stroke(); ctx.strokeStyle = '#B8B3A8'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(1190, 560, 70, Math.PI, Math.PI / 2, true); ctx.stroke(); ctx.setLineDash([]);
    // sofa (L) and a table
    rr(ctx, 400, 600, 230, 80, 10, '#ECEAE3', '#A9A395', 1.4); rr(ctx, 400, 520, 80, 160, 10, '#ECEAE3', '#A9A395', 1.4);
    txt(ctx, 'Corner sofa', 515, 697, 11, C.ink3, 600, 'center');
    rr(ctx, 780, 300, 140, 80, 6, '#ECEAE3', '#A9A395', 1.4); [[800, 292], [880, 292], [800, 388], [880, 388]].forEach(([x, y])=>rr(ctx, x, y - 12, 34, 24, 5, '#ECEAE3', '#A9A395', 1.2));
  }
  function camera(ctx, x, y, rot, fov, k, sel){
    if(k <= 0) return;
    const s = back(k);
    // field of view
    const R = 360 * ease(k), a0 = rot - fov / 2 * Math.PI / 180, a1 = rot + fov / 2 * Math.PI / 180;
    const g = ctx.createRadialGradient(x, y, 10, x, y, R); g.addColorStop(0, 'rgba(10,124,255,.24)'); g.addColorStop(1, 'rgba(10,124,255,.03)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, R, a0, a1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(10,124,255,.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a0) * R, y + Math.sin(a0) * R); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a1) * R, y + Math.sin(a1) * R); ctx.stroke();
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    shadow(ctx, 10, 3, .2); rr(ctx, -24, -15, 48, 30, 7, C.acc); noShadow(ctx);
    rr(ctx, 14, -8, 16, 16, 3, '#0558C4'); rr(ctx, -14, -8, 22, 16, 4, 'rgba(255,255,255,.3)');
    ctx.restore();
  }
  function actor(ctx, x, y, rot, k, name){
    if(k <= 0) return;
    const s = back(k); ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.strokeStyle = C.coral; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(rot) * 30, Math.sin(rot) * 30); ctx.stroke();
    shadow(ctx, 8, 3, .2); ctx.fillStyle = C.coral; ctx.beginPath(); ctx.arc(0, 0, 18, 0, 7); ctx.fill(); noShadow(ctx);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke(); txt(ctx, name[0], 0, .5, 15, '#fff', 800, 'center');
    ctx.restore();
    ctx.save(); ctx.globalAlpha = clamp(k * 2 - 1, 0, 1); rr(ctx, x - 26, y + 26, 52, 20, 10, 'rgba(255,255,255,.92)', C.line); txt(ctx, name, x, y + 36.5, 11.5, C.ink, 700, 'center'); ctx.restore();
  }
  function led(ctx, x, y, rot, k){
    if(k <= 0) return;
    const R = 300 * ease(k), a0 = rot - .45, a1 = rot + .45;
    const g = ctx.createRadialGradient(x, y, 8, x, y, R); g.addColorStop(0, 'rgba(226,169,59,.38)'); g.addColorStop(1, 'rgba(226,169,59,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, R, a0, a1); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); const s = back(k); ctx.scale(s, s);
    shadow(ctx, 8, 3, .2); rr(ctx, -16, -26, 32, 52, 6, '#F4D28A', '#C9901E', 1.5); noShadow(ctx);
    ctx.strokeStyle = '#C9901E'; ctx.lineWidth = 1; for(let i = -18; i <= 18; i += 9){ ctx.beginPath(); ctx.moveTo(-10, i); ctx.lineTo(10, i); ctx.stroke(); }
    ctx.restore();
  }
  function drawDesign(ctx, t){
    const {lay} = D, R = lay.rects;
    const tc = (l)=>({x:R[l].x + R[l].w / 2, y:R[l].y + 36});
    const cam = D.cam, act = D.actor, ld = D.led;
    // lens menu anchor: computed from the bar layout below (stable), captured on first frame
    const keys = [[0, 760, 700], [0.6, 760, 700], [1.3, tc('Camera').x, tc('Camera').y], [1.55, tc('Camera').x, tc('Camera').y], [2.7, cam.x, cam.y], [3.4, cam.x, cam.y],
      [4.2, D.lensChip ? D.lensChip.cx : 800, D.lensChip ? D.lensChip.cy : 160], [4.5, D.lensChip ? D.lensChip.cx : 800, D.lensChip ? D.lensChip.cy : 160],
      [5.2, D.lensChip ? D.lensChip.cx : 800, (D.lensChip ? D.lensChip.cy : 160) + 44 + 3 * 34], [5.6, D.lensChip ? D.lensChip.cx : 800, (D.lensChip ? D.lensChip.cy : 160) + 44 + 3 * 34],
      [6.5, tc('Actor').x, tc('Actor').y], [6.75, tc('Actor').x, tc('Actor').y], [7.9, act.x, act.y], [8.4, act.x, act.y],
      [9.2, tc('LED panel').x, tc('LED panel').y], [9.45, tc('LED panel').x, tc('LED panel').y], [10.6, ld.x, ld.y], [11.1, ld.x, ld.y],
      [11.9, cam.x, cam.y - 49], [12.1, cam.x, cam.y - 49], [12.9, cam.x + 30, cam.y - 44], [13.3, cam.x + 30, cam.y - 44],
      [14.0, D.play ? D.play.x : 800, D.play ? D.play.y : 130], [14.3, D.play ? D.play.x : 800, D.play ? D.play.y : 130], [16.5, D.play ? D.play.x + 40 : 840, D.play ? D.play.y + 60 : 190]];
    const cur = path(keys, t);
    const press = inAny(t, [[1.3, 2.7], [4.4, 4.55], [5.45, 5.6], [6.5, 7.9], [9.2, 10.6], [11.95, 12.9], [14.1, 14.25]]);
    const hot = t >= 1.1 && t < 2.7 ? 'Camera' : t >= 6.3 && t < 7.9 ? 'Actor' : t >= 9.0 && t < 10.6 ? 'LED panel' : null;
    chrome(ctx, 'design', 'Scene 1 · Atelier');
    canvasBg(ctx);
    roomD(ctx);
    // lens state
    let lens = 35, fov = 51;
    const lensPick = span(t, 5.55, 6.1);
    if(t >= 5.55){ lens = 50; fov = lerp(51, 28, ease(lensPick)); }
    // camera rotation: initial aim, then turned towards Anna by the rotate handle
    const aimA = .15, aimB = Math.atan2(act.y - cam.y, act.x - cam.x);
    let camRot = lerp(aimA, aimB, ease(span(t, 12.1, 12.9)));
    // play: Anna walks, the camera pans with her
    const play = span(t, 14.3, 16.3);
    let ax = act.x, ay = act.y, arot = Math.PI + .2;
    if(t >= 14.3){ const k = ease(play); ax = lerp(act.x, 700, k); ay = lerp(act.y, 470, k); arot = Math.atan2(470 - act.y, 700 - act.x); camRot = Math.atan2(ay - cam.y, ax - cam.x); }
    if(play > 0){ ctx.save(); ctx.strokeStyle = C.coral; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.6; ctx.globalAlpha = .8; ctx.beginPath(); ctx.moveTo(act.x, act.y); ctx.lineTo(700, 470); ctx.stroke(); ctx.restore(); }
    led(ctx, ld.x, ld.y, Math.PI * .95, span(t, 10.6, 11.1));
    camera(ctx, cam.x, cam.y, camRot, fov, span(t, 2.7, 3.2), t < 6.3);
    actor(ctx, ax, ay, arot, span(t, 7.9, 8.4), 'Anna');
    // selections
    const camSel = t >= 2.9 && t < 6.3 ? ease(span(t, 2.9, 3.2)) : (t >= 11.7 && t < 14.0 ? 1 : 0);
    handles(ctx, cam.x, cam.y, 48, 30, camRot, camSel);
    handles(ctx, act.x, act.y, 36, 36, 0, t >= 8.1 && t < 9.0 ? 1 : 0);
    handles(ctx, ld.x, ld.y, 32, 52, Math.PI * .95, t >= 10.8 && t < 11.7 ? 1 : 0);
    dropRing(ctx, cam.x, cam.y, span(t, 2.7, 3.3)); dropRing(ctx, act.x, act.y, span(t, 7.9, 8.5)); dropRing(ctx, ld.x, ld.y, span(t, 10.6, 11.2));
    ctx.restore(); // canvas clip
    sidebar(ctx, lay, hot, press && hot);
    // floating UI over the canvas
    const tb = toolbar(ctx, true, t >= 14.1 && t < 16.4); D.play = tb.play;
    // selection bar
    if(camSel > 0){
      const chips = [{t:'Camera', dd:1}, {t:'Super 35', dd:1}, {t:'Cooke S4/i', dd:1}, {id:'lens', t:lens + ' mm · ' + Math.round(fov) + '°', dd:1, hot:t >= 4.4 && t < 5.6, w:128}, {t:'Spherical', dd:1}, {t:'Shot A', dd:1}];
      const out = selBar(ctx, chips, camSel); if(out.lens) D.lensChip = out.lens;
    } else if(t >= 8.1 && t < 9.0){ selBar(ctx, [{t:'Actor', dd:1}, {t:'Anna', w:90}, {t:'+ Path'}, {t:'Seat', dd:1}], 1); }
    else if(t >= 10.8 && t < 11.7){ selBar(ctx, [{t:'LED panel', dd:1}, {t:'5600 K', dd:1}, {t:'Throw 3 m', dd:1}, {t:'Beam 50°'}], 1); }
    // lens menu
    const open = t >= 4.55 && t < 5.6 ? ease(span(t, 4.55, 4.8)) : 0;
    if(open > 0 && D.lensChip){
      const L = D.lensChip, x = L.x, y = L.y + 40, w = 170, h = LENSES.length * 34 + 12;
      ctx.save(); ctx.globalAlpha = open; shadow(ctx, 26, 10, .18); rr(ctx, x, y, w, h * open, 12, '#fff'); noShadow(ctx); rr(ctx, x, y, w, h * open, 12, null, C.line);
      txt(ctx, 'COOKE S4/i · SUPER 35', x + 14, y + 16, 9.5, C.ink3, 800);
      const hover = cur.y > y + 24 ? Math.floor((cur.y - y - 26) / 34) : -1;
      LENSES.forEach(([f, v], i)=>{ const iy = y + 26 + i * 34; if(iy + 30 > y + h * open) return; if(i === hover) rr(ctx, x + 6, iy, w - 12, 30, 8, C.accSoft); txt(ctx, f + ' mm', x + 16, iy + 15, 13, i === hover ? C.acc : C.ink, 600); txt(ctx, v + '°', x + w - 16, iy + 15, 12, C.ink3, 600, 'right'); });
      ctx.restore();
    }
    zoomPill(ctx);
    // dragged tile ghost
    if(hot && press){ ghost(ctx, hot, cur.x, cur.y, ease(span(t, t < 2.7 ? 1.4 : t < 7.9 ? 6.6 : 9.3, (t < 2.7 ? 1.4 : t < 7.9 ? 6.6 : 9.3) + .25))); }
    arrow(ctx, cur.x, cur.y, press);
  }

  // ================================================================ MOOD
  const M = {
    period:16.5,
    lay:sideLayout([['BOARD', C.acc, ['Sticky note', 'Image…', 'Text', 'Line / arrow', 'Sub-board', 'Measure', 'Link', 'Column', 'To-do list', 'Table', 'Color', 'Audio…']], ['BRAINSTORM', '#A98BE0', ['Idea', 'Question', 'Theme', 'Do / Don’t']]]),
    note:{x:600, y:330}, grid:{x:880, y:470}, col:{x:480, y:620}, link:{x:1150, y:280},
  };
  function drawMood(ctx, t){
    const {lay} = M, R = lay.rects, tc = l=>({x:R[l].x + R[l].w / 2, y:R[l].y + 36});
    const N = M.note, G = M.grid, CL = M.col, LK = M.link;
    const sb = M.subChip || {cx:840, cy:160};
    const keys = [[0, 700, 700], [0.5, 700, 700], [1.2, tc('Sticky note').x, tc('Sticky note').y], [1.45, tc('Sticky note').x, tc('Sticky note').y], [2.5, N.x, N.y], [4.4, N.x + 40, N.y + 30],
      [4.6, 1320, 500], [4.7, 1320, 500], [5.8, G.x, G.y], [6.4, G.x, G.y], [7.2, sb.cx, sb.cy], [7.6, sb.cx, sb.cy],
      [8.4, tc('Column').x, tc('Column').y], [8.65, tc('Column').x, tc('Column').y], [9.8, CL.x, CL.y], [11.6, CL.x + 30, CL.y + 40],
      [12.3, tc('Link').x, tc('Link').y], [12.55, tc('Link').x, tc('Link').y], [13.7, LK.x, LK.y], [16.5, LK.x + 20, LK.y + 80]];
    const cur = path(keys, t);
    const press = inAny(t, [[1.2, 2.5], [4.7, 5.8], [7.45, 7.6], [8.4, 9.8], [12.3, 13.7]]);
    const hot = t >= 1.0 && t < 2.5 ? 'Sticky note' : t >= 8.2 && t < 9.8 ? 'Column' : t >= 12.1 && t < 13.7 ? 'Link' : null;
    chrome(ctx, 'mood', null);
    canvasBg(ctx);
    txt(ctx, 'LICHT — a brand film in three rooms', 312, TOP + 148, 20, C.ink, 800);
    // two photos already there
    photo(ctx, 312, TOP + 176, 150, 100, 0); photo(ctx, 312, TOP + 292, 150, 100, 1);
    // 1 · sticky note
    const nk = span(t, 2.5, 2.9);
    if(nk > 0){
      const s = back(nk); ctx.save(); ctx.translate(N.x, N.y); ctx.scale(s, s); shadow(ctx, 16, 6, .16); rr(ctx, -110, -65, 220, 130, 6, C.note); noShadow(ctx);
      const lines = ['Natural light only in the', 'atelier — one soft key.', 'Oat, linen, cobalt.'];
      const typed = span(t, 2.9, 4.4) * lines.join('').length; let used = 0;
      lines.forEach((l, i)=>{ const n = clamp(Math.round(typed - used), 0, l.length); used += l.length; txt(ctx, l.slice(0, n) + (n > 0 && n < l.length ? '|' : ''), -94, -30 + i * 24, 13.5, i === 2 ? C.ink2 : C.ink, i === 2 ? 500 : 700); });
      ctx.restore();
    }
    // 2 · four photos dropped from outside the window
    const drop = span(t, 5.8, 6.3);
    const cells = [[-120, -80], [40, -80], [-120, 40], [40, 40]];
    const grouped = span(t, 7.6, 8.2);
    if(t >= 4.7 && t < 5.8){
      // the stack under the cursor, with a count badge
      for(let i = 3; i >= 0; i--) { ctx.save(); ctx.translate(cur.x + 10 + i * 4, cur.y + 10 + i * 4); ctx.rotate((i - 1.5) * .05); shadow(ctx, 12, 6, .2); photo(ctx, 0, 0, 96, 64, 2 + i); noShadow(ctx); ctx.restore(); }
      ctx.fillStyle = '#E5484D'; ctx.beginPath(); ctx.arc(cur.x + 110, cur.y + 12, 11, 0, 7); ctx.fill(); txt(ctx, '4', cur.x + 110, cur.y + 12.5, 12, '#fff', 800, 'center');
    }
    if(drop > 0 && grouped < 1){
      cells.forEach(([dx, dy], i)=>{
        const k = back(span(t, 5.8 + i * .08, 6.2 + i * .08));
        const tx = lerp(G.x + dx, G.x - 70, ease(grouped)), ty = lerp(G.y + dy, G.y - 45, ease(grouped)), sc = lerp(1, .45, ease(grouped));
        ctx.save(); ctx.globalAlpha = clamp(k, 0, 1) * (1 - grouped * .6); ctx.translate(tx + 70, ty + 45); ctx.scale(k * sc, k * sc); shadow(ctx, 12, 4, .15); photo(ctx, -70, -45, 140, 90, 2 + i); noShadow(ctx); ctx.restore();
      });
      if(t >= 6.1 && t < 7.6){ ctx.save(); ctx.strokeStyle = C.acc; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.strokeRect(G.x - 130, G.y - 90, 330, 240); ctx.restore(); }
    }
    dropRing(ctx, G.x, G.y, span(t, 5.8, 6.4));
    if(grouped > 0){
      const k = ease(grouped), w = 230, h = 150, x = G.x - w / 2 + 30, y = G.y - h / 2;
      ctx.save(); ctx.globalAlpha = k; shadow(ctx, 18, 6, .16); rr(ctx, x, y, w, h, 12, '#fff'); noShadow(ctx); rr(ctx, x, y, w, h, 12, null, C.line);
      rr(ctx, x, y, w, 30, [12, 12, 0, 0], '#5B6472'); txt(ctx, 'Location scout', x + 12, y + 15.5, 12, '#fff', 700);
      for(let i = 0; i < 4; i++) photo(ctx, x + 12 + (i % 2) * 106, y + 40 + Math.floor(i / 2) * 50, 98, 44, 2 + i, 4);
      ctx.restore();
    }
    // 3 · a column card
    const ck = span(t, 9.8, 10.2);
    if(ck > 0){
      const s = back(ck); ctx.save(); ctx.translate(CL.x, CL.y); ctx.scale(s, s); shadow(ctx, 16, 6, .14); rr(ctx, -115, -80, 230, 160, 10, '#fff'); noShadow(ctx); rr(ctx, -115, -80, 230, 160, 10, null, C.line);
      rr(ctx, -115, -80, 230, 32, [10, 10, 0, 0], C.green); txt(ctx, 'LOOK', -101, -64, 12, '#fff', 800);
      const items = ['Super 35 · 24 / 35 / 85', 'Practicals on, HMI as sun', 'Handheld only in the corridor'];
      const n = span(t, 10.3, 11.6) * items.length;
      items.forEach((l, i)=>{ const kk = clamp(n - i, 0, 1); if(kk <= 0) return; const c = Math.round(kk * l.length); txt(ctx, '· ' + l.slice(0, c), -101, -26 + i * 30, 12.5, C.ink, 500); });
      ctx.restore();
    }
    // 4 · a link card, whose thumbnail arrives
    const lk = span(t, 13.7, 14.1);
    if(lk > 0){
      const s = back(lk); ctx.save(); ctx.translate(LK.x, LK.y); ctx.scale(s, s); shadow(ctx, 16, 6, .14); rr(ctx, -80, -70, 160, 140, 10, '#fff'); noShadow(ctx); rr(ctx, -80, -70, 160, 140, 10, null, C.line);
      const th = span(t, 14.4, 14.9);
      if(th > 0){ ctx.globalAlpha = th; rr(ctx, -70, -60, 140, 80, 6, '#1F2340'); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-8, -32); ctx.lineTo(12, -20); ctx.lineTo(-8, -8); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
      else rr(ctx, -70, -60, 140, 80, 6, '#F1EFEA');
      txt(ctx, 'vimeo.com/…', -70, 36, 12, C.acc, 700); txt(ctx, 'Reference: Studio', -70, 54, 11, C.ink3);
      ctx.restore();
    }
    dropRing(ctx, N.x, N.y, span(t, 2.5, 3.1)); dropRing(ctx, CL.x, CL.y, span(t, 9.8, 10.4)); dropRing(ctx, LK.x, LK.y, span(t, 13.7, 14.3));
    ctx.restore(); // clip
    sidebar(ctx, lay, hot, press && hot);
    toolbar(ctx, false);
    // selection bars
    if(t >= 2.7 && t < 4.6) selBar(ctx, [{t:'Note', dd:1}, {sw:['#FCEFC0', '#FBD7C9', '#D8E7F8', '#DCEFD9', '#E8DDF7'], w:112}, {t:'A−'}, {t:'A+'}, {t:'Lock'}], ease(span(t, 2.7, 2.95)));
    else if(t >= 6.3 && t < 7.7){ const out = selBar(ctx, [{t:'4 items'}, {t:'Group'}, {id:'sub', t:'→ Sub-board', hot:t >= 7.2, primary:t < 7.2 ? false : false}, {t:'Align', dd:1}, {t:'Delete'}], ease(span(t, 6.3, 6.55))); if(out.sub) M.subChip = out.sub; }
    else if(t >= 10.0 && t < 12.1) selBar(ctx, [{t:'Column', dd:1}, {sw:['#2DB45A', '#E2A93B', '#FF5E57', '#0A7CFF'], w:90}, {t:'+ Item'}, {t:'Lock'}], 1);
    else if(t >= 13.9) selBar(ctx, [{t:'Link'}, {t:'vimeo.com/…', w:170}, {t:'Open ↗'}], ease(span(t, 13.9, 14.2)));
    zoomPill(ctx);
    if(hot && press){ const t0 = t < 2.5 ? 1.25 : t < 9.8 ? 8.45 : 12.35; ghost(ctx, hot, cur.x, cur.y, ease(span(t, t0, t0 + .25))); }
    arrow(ctx, cur.x, cur.y, press && !(t >= 4.7 && t < 5.8));
  }

  // ---------------------------------------------------------------- stage loop
  function stage(canvas, draw, period){
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    let dpr = 1, cw = 0, ch = 0, S = 1, t0 = performance.now(), paused = false, visible = true, raf = 0, pausedAt = 0;
    const fit = ()=>{ const r = canvas.getBoundingClientRect(); if(!r.width) return; dpr = Math.min(2, devicePixelRatio || 1); cw = r.width; ch = r.height; canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); S = Math.min(cw / W, ch / H); };
    const tick = now=>{
      raf = 0; if(!visible) return; if(!cw) fit();
      const t = paused ? pausedAt : ((now - t0) / 1000) % period;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cw, ch);
      ctx.save(); ctx.translate((cw - W * S) / 2, (ch - H * S) / 2); ctx.scale(S, S); draw(ctx, t); ctx.restore();
      raf = requestAnimationFrame(tick);
    };
    canvas.addEventListener('mouseenter', ()=>{ pausedAt = ((performance.now() - t0) / 1000) % period; paused = true; });
    canvas.addEventListener('mouseleave', ()=>{ paused = false; t0 = performance.now() - pausedAt * 1000; });
    new ResizeObserver(fit).observe(canvas);
    if('IntersectionObserver' in window) new IntersectionObserver(es=>{ visible = es.some(e=>e.isIntersecting); if(visible && !raf){ t0 = performance.now() - pausedAt * 1000; raf = requestAnimationFrame(tick); } }, {threshold:.05}).observe(canvas);
    spriteReady.then(()=>{ fit(); raf = requestAnimationFrame(tick); });
    canvas.__seek = s=>{ paused = true; pausedAt = s; }; // for screenshots
  }
  stage(document.getElementById('uiDesign'), drawDesign, D.period);
  stage(document.getElementById('uiMood'), drawMood, M.period);
})();
