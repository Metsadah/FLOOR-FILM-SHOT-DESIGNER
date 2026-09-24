// Landing page — "A floor plan in a minute", animated.
// Draws js/15-atelier.js (the same room the example production "Atelier"
// opens in Floorboard) on a canvas, step by step: the walls being drawn, doors
// and windows dropped in, the set dressed, cast and cameras placed with a
// lens picked, and finally the blocking played: the dolly rides its track
// while Anna walks her path. Hovering a step holds it.
(function(){
  const box = document.getElementById('howto'), D = window.ATELIER;
  const cv = document.getElementById('howtoCv');
  if(!box || !D || !cv) return;
  const ctx = cv.getContext('2d');
  const scanImg = box.querySelector('.stage-imgs img[data-step="5"]');
  const items = [...box.querySelectorAll('.stepsl li')], nameEl = document.getElementById('stageName'), bar = box.querySelector('.stage-bar i');
  const NAMES = ['Scene 1 · Atelier — drawing the walls', 'Scene 1 · Atelier — doors & windows', 'Scene 1 · Atelier — set dressing', 'Scene 1 · Atelier — cast, cameras, lens', 'Scene 1 · Atelier — blocking: dolly + walk', 'Room library — scanned with Floor Scanner'];
  const DUR = [4.0, 3.0, 4.0, 6.2, 7.2, 3.4];
  const ACC = '#4B6BFB', INK = '#2B2A27', INK2 = '#6B675F', CORAL = '#E8734A', SAND = '#E2A93B', SOFT = '#EDEAE2', EDGE = '#A9A395', GLASS = '#7FA9E6';
  const BB = {x0:-90, y0:-200, x1:960, y1:640};
  let W = 0, H = 0, S = 1, OX = 0, OY = 0, dpr = 1;
  function fit(){
    const r = cv.getBoundingClientRect(); if(!r.width) return;
    dpr = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    S = Math.min(W / (BB.x1 - BB.x0), H / (BB.y1 - BB.y0));
    OX = (W - (BB.x1 - BB.x0) * S) / 2 - BB.x0 * S; OY = (H - (BB.y1 - BB.y0) * S) / 2 - BB.y0 * S;
  }
  const X = x=>OX + x * S, Y = y=>OY + y * S;
  const clamp = (v, a, b)=>v < a ? a : v > b ? b : v;
  const ease = t=>{ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, k)=>a + (b - a) * k;
  const rotA = (a, b, k)=>{ let d = b - a; while(d > Math.PI) d -= 2 * Math.PI; while(d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
  const font = (px, w)=>`${w || 600} ${px}px -apple-system, "Inter", "Segoe UI", sans-serif`;

  // ---- geometry of the walls: total length + point at a distance along the drawing
  const walls = D.walls.map(w=>{ const dx = w[2] - w[0], dy = w[3] - w[1], L = Math.hypot(dx, dy); return {x1:w[0], y1:w[1], x2:w[2], y2:w[3], L, ux:dx / L, uy:dy / L, nx:-dy / L, ny:dx / L, ops:w[4] || []}; });
  const TOTAL = walls.reduce((a, w)=>a + w.L, 0);
  const openings = []; walls.forEach((w, wi)=>w.ops.forEach(o=>openings.push({w, o, wi})));
  const cams = D.cams, actors = D.actors;
  const dollyCam = cams.find(c=>c.path && c.path.length) || null;
  const walker = actors.find(a=>a.path && a.path.length) || null;
  const walkPts = walker ? [{x:walker.x, y:walker.y}].concat(walker.path) : [];
  const walkLen = []; let wl = 0; for(let i = 1; i < walkPts.length; i++){ wl += Math.hypot(walkPts[i].x - walkPts[i - 1].x, walkPts[i].y - walkPts[i - 1].y); walkLen.push(wl); }
  function walkAt(k){ // k 0..1 → {x,y,rot}
    if(walkPts.length < 2) return {x:walker.x, y:walker.y, rot:walker.rot};
    const d = k * wl; let i = 0; while(i < walkLen.length - 1 && walkLen[i] < d) i++;
    const d0 = i ? walkLen[i - 1] : 0, seg = walkLen[i] - d0, a = walkPts[i], b = walkPts[i + 1], u = seg ? clamp((d - d0) / seg, 0, 1) : 1;
    return {x:lerp(a.x, b.x, u), y:lerp(a.y, b.y, u), rot:Math.atan2(b.y - a.y, b.x - a.x)};
  }

  // ---- drawing helpers (world coordinates in cm)
  function line(x1, y1, x2, y2, col, w, cap){ ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = cap || 'round'; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); }
  function rrect(x, y, w, h, r, fill, stroke, lw){
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if(fill){ ctx.fillStyle = fill; ctx.fill(); }
    if(stroke){ ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.2; ctx.stroke(); }
  }
  function label(x, y, txt, col, px, bold, bg){
    if(!txt) return;
    ctx.font = font(px || 11, bold ? 700 : 600); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if(bg){ const tw = ctx.measureText(txt).width; rrect(X(x) - tw / 2 - 6, Y(y) - (px || 11) * .8, tw + 12, (px || 11) * 1.6, 6, bg); }
    ctx.fillStyle = col || INK2; ctx.fillText(txt, X(x), Y(y));
  }
  function grid(){
    ctx.fillStyle = '#DCD8CF';
    const step = S < .45 ? 100 : 50;
    for(let x = Math.ceil(BB.x0 / step) * step; x < BB.x1; x += step) for(let y = Math.ceil(BB.y0 / step) * step; y < BB.y1; y += step){ ctx.beginPath(); ctx.arc(X(x), Y(y), .9, 0, 7); ctx.fill(); }
  }
  function cursor(x, y, k){ // pointer arrow at a world point
    ctx.save(); ctx.globalAlpha = k == null ? 1 : k; ctx.translate(X(x), Y(y)); ctx.scale(1.15, 1.15);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 15); ctx.lineTo(3.6, 11.6); ctx.lineTo(6.5, 17.6); ctx.lineTo(9.2, 16.3); ctx.lineTo(6.4, 10.4); ctx.lineTo(11.2, 10.2); ctx.closePath();
    ctx.fillStyle = '#111'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
  }
  function drawWalls(len){ // len in cm drawn so far (Infinity = all)
    let left = len;
    const T = Math.max(4, 12 * S);
    for(const w of walls){
      if(left <= 0) break;
      const l = Math.min(w.L, left);
      line(w.x1, w.y1, w.x1 + w.ux * l, w.y1 + w.uy * l, INK, T, 'round');
      left -= l;
    }
  }
  function drawOpening(op, k){ // k 0..1 pop
    if(k <= 0) return;
    const {w, o} = op, cx = w.x1 + w.ux * w.L * o.t, cy = w.y1 + w.uy * w.L * o.t, hw = o.w / 2 * k;
    const T = Math.max(4, 12 * S);
    // the gap
    line(cx - w.ux * hw, cy - w.uy * hw, cx + w.ux * hw, cy + w.uy * hw, '#fff', T + 2, 'butt');
    if(o.type === 'window'){
      const g = 4;
      line(cx - w.ux * hw + w.nx * g, cy - w.uy * hw + w.ny * g, cx + w.ux * hw + w.nx * g, cy + w.uy * hw + w.ny * g, GLASS, Math.max(1.2, 2.2 * S), 'butt');
      line(cx - w.ux * hw - w.nx * g, cy - w.uy * hw - w.ny * g, cx + w.ux * hw - w.nx * g, cy + w.uy * hw - w.ny * g, GLASS, Math.max(1.2, 2.2 * S), 'butt');
    } else if(o.type === 'door'){
      // same convention as the app: the leaf swings to the right of the wall
      // direction, flip mirrors it (hinge at the other end, swing to the left)
      const s = o.flip ? -1 : 1, hx = cx + w.ux * hw * s, hy = cy + w.uy * hw * s;
      const ang = Math.atan2(w.uy, w.ux) + (o.flip ? 0 : Math.PI), swing = ease(k) * Math.PI / 2;
      const lx = hx + Math.cos(ang + swing) * o.w * k, ly = hy + Math.sin(ang + swing) * o.w * k;
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, 3 * S); ctx.beginPath(); ctx.moveTo(X(hx), Y(hy)); ctx.lineTo(X(lx), Y(ly)); ctx.stroke();
      ctx.strokeStyle = '#B8B3A8'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath();
      ctx.arc(X(hx), Y(hy), o.w * k * S, ang, ang + swing); ctx.stroke(); ctx.setLineDash([]);
    } else {
      line(cx - w.ux * hw, cy - w.uy * hw, cx + w.ux * hw, cy + w.uy * hw, '#C9C4B9', 1, 'butt');
    }
  }
  function drawProp(p, k){ // k = pop 0..1 (scale 1.25 → 1, fade in)
    if(k <= 0) return;
    ctx.save(); ctx.globalAlpha = k; ctx.translate(X(p.x), Y(p.y)); ctx.rotate(p.rot || 0);
    const sc = S * (1.25 - .25 * ease(k)); ctx.scale(sc, sc);
    const w = p.w, h = p.h, isLight = /led|bounce|hmi|neg|flag|kino|fresnel/.test(p.kind);
    const fill = isLight ? '#FBEBC3' : SOFT, edge = isLight ? SAND : EDGE, lw = 1.4 / sc;
    ctx.lineWidth = lw;
    if(p.kind === 'sofa_corner'){
      rrect(-w / 2, -h / 2, w, 90, 10, fill, edge, lw); rrect(-w / 2, -h / 2, 95, h, 10, fill, edge, lw);
      ctx.strokeStyle = edge; ctx.beginPath(); ctx.moveTo(-w / 2 + 95, -h / 2 + 20); ctx.lineTo(w / 2 - 12, -h / 2 + 20); ctx.moveTo(-w / 2 + 20, -h / 2 + 90); ctx.lineTo(-w / 2 + 20, h / 2 - 12); ctx.stroke();
    } else if(p.kind === 'rug'){
      ctx.setLineDash([6 , 5]); rrect(-w / 2, -h / 2, w, h, 4, 'rgba(75,107,251,.06)', '#B8B3A8', lw); ctx.setLineDash([]);
    } else if(p.kind === 'chair'){
      rrect(-w / 2, -h / 2, w, h, 6, fill, edge, lw); ctx.strokeStyle = INK2; ctx.lineWidth = 3 / sc; ctx.beginPath(); ctx.moveTo(-w / 2 + 4, -h / 2 + 3); ctx.lineTo(w / 2 - 4, -h / 2 + 3); ctx.stroke();
    } else if(p.kind === 'plant'){
      ctx.fillStyle = '#CFE0C4'; ctx.strokeStyle = '#7FA05A'; ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, 7); ctx.fill(); ctx.stroke();
      for(let i = 0; i < 5; i++){ const a = i / 5 * 6.283; ctx.beginPath(); ctx.arc(Math.cos(a) * w * .22, Math.sin(a) * w * .22, w * .17, 0, 7); ctx.fill(); }
    } else if(p.kind === 'floorlamp'){
      ctx.fillStyle = '#FBEBC3'; ctx.strokeStyle = SAND; ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, 7); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fillStyle = SAND; ctx.fill();
    } else if(p.kind === 'kino'){
      rrect(-w / 2, -h / 2, w, h, 5, fill, edge, lw);
      ctx.strokeStyle = SAND; ctx.lineWidth = 2 / sc; ctx.beginPath(); for(let i = -1; i <= 1; i++){ ctx.moveTo(-w / 2 + 8, i * 9); ctx.lineTo(w / 2 - 8, i * 9); } ctx.stroke();
    } else if(p.kind === 'hmi'){
      ctx.fillStyle = '#FBEBC3'; ctx.strokeStyle = SAND; ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w * .1, -w * .3); ctx.lineTo(w * .7, -w * .8); ctx.moveTo(w * .1, w * .3); ctx.lineTo(w * .7, w * .8); ctx.moveTo(w * .3, 0); ctx.lineTo(w * .9, 0); ctx.stroke();
    } else if(p.kind === 'kitchen' || p.kind === 'tvunit' || p.kind === 'bookcase' || p.kind === 'fridge'){
      rrect(-w / 2, -h / 2, w, h, 4, fill, edge, lw);
      if(p.kind === 'kitchen'){ ctx.strokeStyle = edge; ctx.beginPath(); for(let x = -w / 2 + 60; x < w / 2; x += 60){ ctx.moveTo(x, -h / 2); ctx.lineTo(x, h / 2); } ctx.stroke(); ctx.beginPath(); ctx.arc(-w / 2 + 40, 0, 14, 0, 7); ctx.stroke(); }
      if(p.kind === 'bookcase'){ ctx.strokeStyle = edge; ctx.beginPath(); for(let x = -w / 2 + 26; x < w / 2; x += 26){ ctx.moveTo(x, -h / 2); ctx.lineTo(x, h / 2); } ctx.stroke(); }
      if(p.kind === 'tvunit'){ ctx.fillStyle = INK; ctx.fillRect(-w * .35, -h / 2 - 6, w * .7, 5); }
    } else {
      rrect(-w / 2, -h / 2, w, h, Math.min(8, w / 6), fill, edge, lw);
    }
    ctx.restore();
    if(p.label && (S > .5 || isLight)) label(p.x, p.y + Math.max(p.w, p.h) / 2 + 12, p.label, isLight ? '#9A6B12' : INK2, 10.5);
  }
  function drawTrack(k){
    if(!D.track || k <= 0) return;
    const pts = D.track.pts, a = pts[0], b = pts[pts.length - 1];
    const L = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, nx = -uy, ny = ux;
    const l = L * ease(k), G = 14;
    ctx.save(); ctx.globalAlpha = Math.min(1, k * 2);
    for(let d = 20; d < l; d += 40) line(a.x + ux * d + nx * 22, a.y + uy * d + ny * 22, a.x + ux * d - nx * 22, a.y + uy * d - ny * 22, '#C9C4B9', Math.max(1.5, 4 * S), 'butt');
    for(const s of [-1, 1]) line(a.x + nx * G * s, a.y + ny * G * s, a.x + ux * l + nx * G * s, a.y + uy * l + ny * G * s, '#8C877D', Math.max(1.5, 3 * S), 'round');
    ctx.restore();
  }
  function drawActor(a, x, y, rot, k, name){
    if(k <= 0) return;
    ctx.save(); ctx.globalAlpha = k; const r = Math.max(9, 22 * S) * (1.3 - .3 * ease(k));
    // facing tick
    ctx.strokeStyle = CORAL; ctx.lineWidth = Math.max(2, 3 * S); ctx.beginPath(); ctx.moveTo(X(x), Y(y)); ctx.lineTo(X(x) + Math.cos(rot) * r * 1.7, Y(y) + Math.sin(rot) * r * 1.7); ctx.stroke();
    ctx.fillStyle = CORAL; ctx.beginPath(); ctx.arc(X(x), Y(y), r, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = font(Math.max(9, r * .95), 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText((name || 'A')[0], X(x), Y(y) + .5);
    ctx.restore();
    if(name) label(x, y + (28 * Math.max(1, S)) / S + 8, name, INK, 11, true, 'rgba(255,255,255,.85)');
  }
  function wedge(x, y, rot, fov, k, hot){
    const R = 320 * ease(k), a0 = rot - fov / 2 * Math.PI / 180, a1 = rot + fov / 2 * Math.PI / 180;
    ctx.beginPath(); ctx.moveTo(X(x), Y(y)); ctx.arc(X(x), Y(y), R * S, a0, a1); ctx.closePath();
    ctx.fillStyle = hot ? 'rgba(75,107,251,.20)' : 'rgba(75,107,251,.12)'; ctx.fill(); ctx.strokeStyle = 'rgba(75,107,251,.55)'; ctx.lineWidth = 1; ctx.stroke();
  }
  function drawCam(c, x, y, rot, fov, k, hot){
    if(k <= 0) return;
    wedge(x, y, rot, fov, k, hot);
    ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.5); ctx.translate(X(x), Y(y)); ctx.rotate(rot); const sc = S * (1.3 - .3 * ease(k)); ctx.scale(sc, sc);
    rrect(-23, -15, 46, 30, 6, ACC); ctx.fillStyle = '#fff'; ctx.fillRect(14, -7, 16, 14); rrect(-12, -7, 20, 14, 3, 'rgba(255,255,255,.35)');
    ctx.restore();
  }
  function lensChip(c, x, y, lens, fov, k, active){
    if(k <= 0) return;
    ctx.save(); ctx.globalAlpha = k;
    const txt = c.shot + ' · ' + lens + ' mm · ' + Math.round(fov) + '° · S35';
    ctx.font = font(11, 700); const tw = ctx.measureText(txt).width;
    const px = X(x) - tw / 2 - 8, py = Y(y) - 34;
    rrect(px, py, tw + 16, 22, 11, active ? ACC : '#fff', active ? null : '#D9D5CC', 1);
    ctx.fillStyle = active ? '#fff' : INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, px + 8, py + 11);
    ctx.restore();
  }
  function lensPicker(x, y, lenses, cur, k){
    if(k <= 0) return;
    ctx.save(); ctx.globalAlpha = k;
    ctx.font = font(11, 700);
    const cellW = 46, w = cellW * lenses.length + 8, px = X(x) - w / 2, py = Y(y) - 66;
    rrect(px, py, w, 28, 8, '#fff', '#D9D5CC', 1);
    lenses.forEach((l, i)=>{
      const cx = px + 4 + i * cellW;
      if(l === cur) rrect(cx, py + 3, cellW, 22, 6, ACC);
      ctx.fillStyle = l === cur ? '#fff' : INK2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(l + ' mm', cx + cellW / 2, py + 14);
    });
    ctx.restore();
  }
  function drawPath(pts, k, col){
    if(pts.length < 2 || k <= 0) return;
    ctx.save(); ctx.globalAlpha = k; ctx.strokeStyle = col || CORAL; ctx.lineWidth = 1.6; ctx.setLineDash([6, 5]);
    ctx.beginPath(); pts.forEach((p, i)=>i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))); ctx.stroke(); ctx.setLineDash([]);
    const a = pts[pts.length - 2], b = pts[pts.length - 1], ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.fillStyle = col || CORAL; ctx.beginPath(); ctx.moveTo(X(b.x), Y(b.y)); ctx.lineTo(X(b.x) - Math.cos(ang - .5) * 9, Y(b.y) - Math.sin(ang - .5) * 9); ctx.lineTo(X(b.x) - Math.cos(ang + .5) * 9, Y(b.y) - Math.sin(ang + .5) * 9); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // sunlight: from the sun's position towards the room, entering through every
  // window that faces it — a soft shaft per window, like the app's light cones
  function sunDir(){ const cx = 440, cy = 280, dx = cx - D.sun.x, dy = cy - D.sun.y, L = Math.hypot(dx, dy); return {x:dx / L, y:dy / L}; }
  function sunShafts(k){
    if(!D.sun || k <= 0) return;
    const dir = sunDir(), L = 420 * ease(k);
    ctx.save(); ctx.globalAlpha = .9 * k;
    for(const op of openings){
      if(op.o.type !== 'window') continue;
      const w = op.w; if(w.nx * dir.x + w.ny * dir.y <= .15) continue; // light has to come in, not graze
      const cx = w.x1 + w.ux * w.L * op.o.t, cy = w.y1 + w.uy * w.L * op.o.t, hw = op.o.w / 2;
      const p1 = {x:cx - w.ux * hw, y:cy - w.uy * hw}, p2 = {x:cx + w.ux * hw, y:cy + w.uy * hw};
      const g = ctx.createLinearGradient(X(cx), Y(cy), X(cx + dir.x * L), Y(cy + dir.y * L));
      g.addColorStop(0, 'rgba(226,169,59,.30)'); g.addColorStop(1, 'rgba(226,169,59,0)');
      ctx.fillStyle = g; ctx.beginPath();
      ctx.moveTo(X(p1.x), Y(p1.y)); ctx.lineTo(X(p2.x), Y(p2.y)); ctx.lineTo(X(p2.x + dir.x * L), Y(p2.y + dir.y * L)); ctx.lineTo(X(p1.x + dir.x * L), Y(p1.y + dir.y * L)); ctx.closePath(); ctx.fill();
    }
    // the rays from the sun itself
    ctx.strokeStyle = 'rgba(226,169,59,.45)'; ctx.lineWidth = 1; ctx.setLineDash([5, 6]);
    for(const off of [-60, 0, 60]){ const sx = D.sun.x + -dir.y * off, sy = D.sun.y + dir.x * off; ctx.beginPath(); ctx.moveTo(X(sx + dir.x * 30), Y(sy + dir.y * 30)); ctx.lineTo(X(sx + dir.x * 200), Y(sy + dir.y * 200)); ctx.stroke(); }
    ctx.setLineDash([]); ctx.restore();
  }
  function sun(k){
    if(!D.sun || k <= 0) return;
    ctx.save(); ctx.globalAlpha = k; const r = Math.max(8, 18 * S);
    ctx.strokeStyle = SAND; ctx.lineWidth = 1.5;
    for(let i = 0; i < 8; i++){ const a = i / 8 * 6.283; ctx.beginPath(); ctx.moveTo(X(D.sun.x) + Math.cos(a) * r * 1.4, Y(D.sun.y) + Math.sin(a) * r * 1.4); ctx.lineTo(X(D.sun.x) + Math.cos(a) * r * 1.9, Y(D.sun.y) + Math.sin(a) * r * 1.9); ctx.stroke(); }
    ctx.fillStyle = '#FBEBC3'; ctx.beginPath(); ctx.arc(X(D.sun.x), Y(D.sun.y), r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
    label(D.sun.x, D.sun.y + 44, (D.sun.hour || 15) + ':00', INK2, 10.5);
  }
  function fovFor(lens){ return 2 * Math.atan(24.89 / 2 / lens) * 180 / Math.PI; } // Super 35 width

  // ---- the frames
  const pop = (t, t0, d)=>ease((t - t0) / (d || .4));
  function frame(step, t){
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    grid();
    const done = s=>step > s; // earlier steps are complete
    // 0 · walls
    if(step === 0){
      const len = ease(t / 3.3) * TOTAL; drawWalls(len);
      // tip of the pen
      let left = len; for(const w of walls){ if(left <= w.L){ cursor(w.x1 + w.ux * left, w.y1 + w.uy * left); break; } left -= w.L; }
      if(t > 3.5) label(440, 620, 'six walls · 2880 cm', INK2, 11, false, 'rgba(255,255,255,.9)');
    } else drawWalls(Infinity);
    // 1 · openings
    if(step >= 1){
      openings.forEach((op, i)=>{ const k = step === 1 ? pop(t, .25 + i * .42, .5) : 1; drawOpening(op, k); });
      if(step === 1){ const i = Math.min(openings.length - 1, Math.max(0, Math.floor((t - .25) / .42) + 1)); const op = openings[i]; const k = pop(t, .25 + i * .42, .5); if(k < 1 && t > .05){ const w = op.w; cursor(w.x1 + w.ux * w.L * op.o.t, w.y1 + w.uy * w.L * op.o.t); } }
    }
    // the afternoon sun through the windows (arrives with the light, step 3)
    if(step >= 3) sunShafts(step === 3 ? pop(t, 5.3, .7) : 1);
    // 2 · furniture
    if(step >= 2){
      D.props.forEach((p, i)=>{ const k = step === 2 ? pop(t, .2 + i * .24, .45) : 1; drawProp(p, k); });
      if(step === 2){ const i = Math.min(D.props.length - 1, Math.max(0, Math.floor((t - .2) / .24))); const k = pop(t, .2 + i * .24, .45); if(k < 1) cursor(D.props[i].x + 8, D.props[i].y + 8, 1); }
    }
    // 3 · cast, cameras, lens, light   4 · blocking
    if(step >= 3){
      const s3 = step === 3;
      D.lights.forEach((l, i)=>drawProp(l, s3 ? pop(t, 4.6 + i * .25, .4) : 1));
      sun(s3 ? pop(t, 5.3, .5) : 1);
      // actors (walker animates in step 4)
      const st = walker ? {x:walker.x, y:walker.y, rot:walker.rot} : null;
      actors.forEach((a, i)=>{
        if(a === walker && step === 4) return;
        drawActor(a, a.x, a.y, a.rot, s3 ? pop(t, .2 + i * .35, .45) : 1, a.label);
      });
      // camera A (the tripod one) with the lens moment
      const A = cams.find(c=>!c.path || !c.path.length) || cams[0];
      let lensA = A.lens, fovA = A.fov, picking = false;
      if(s3){
        const seq = D.lensTry || [A.lens];
        const t0 = 1.9, dt = .8, i = Math.floor((t - t0) / dt);
        if(t >= t0 && i < seq.length){ lensA = seq[i]; picking = true; const prev = i ? seq[i - 1] : seq[0]; fovA = lerp(fovFor(prev), fovFor(lensA), ease((t - t0 - i * dt) / .35)); }
        else if(t >= t0){ fovA = fovFor(A.lens); lensA = A.lens; }
        else fovA = fovFor(A.lens);
      }
      drawCam(A, A.x, A.y, A.rot, fovA, s3 ? pop(t, 1.0, .5) : 1, picking);
      if(s3 && t > 1.9 && t < 1.9 + (D.lensTry || [1]).length * .8 + .6) lensPicker(A.x, A.y, [24, 35, 50, 85], lensA, pop(t, 1.9, .3) * (1 - pop(t, 1.9 + (D.lensTry || [1]).length * .8 + .3, .3)));
      lensChip(A, A.x, A.y, lensA, fovA, s3 ? pop(t, 1.5, .4) : 1, picking);
      // the dolly track + camera B
      if(dollyCam){
        const B = dollyCam, end = B.path[B.path.length - 1];
        drawTrack(s3 ? pop(t, 3.7, .7) : 1);
        if(step === 4){
          const P = 7.2, u = (t % P) / P;                 // one ride per loop
          const m = ease((u - .12) / .68);                 // hold · move · hold
          const bx = lerp(B.x, end.x, m), by = lerp(B.y, end.y, m);
          // the operator pans with Anna: aim at where she is right now
          const aim = walker ? walkAt(m) : null;
          const br = aim ? Math.atan2(aim.y - by, aim.x - bx) : rotA(B.rot, end.rot == null ? B.rot : end.rot, m);
          drawPath(walkPts, 1);
          drawPath([{x:B.x, y:B.y}, {x:end.x, y:end.y}], .9, ACC);
          drawCam(B, bx, by, br, B.fov, 1, true);
          lensChip(B, bx, by, B.lens, B.fov, 1, true);
          if(walker){ const p = walkAt(m); drawActor(walker, p.x, p.y, m >= 1 ? (walker.pathEndRot == null ? p.rot : walker.pathEndRot) : p.rot, 1, walker.label); }
          label(440, 620, m <= 0 ? 'ready — action in a moment' : m >= 1 ? 'cut · the dolly and Anna are back in a moment' : 'dolly follows Anna · 50 mm', INK2, 11, false, 'rgba(255,255,255,.9)');
        } else {
          drawCam(B, B.x, B.y, B.rot, B.fov, s3 ? pop(t, 4.2, .5) : 1, false);
          if(!s3 || t > 4.4) lensChip(B, B.x, B.y, B.lens, B.fov, s3 ? pop(t, 4.6, .4) : 1, false);
          if(!s3 || t > 5.4){ drawPath(walkPts, s3 ? pop(t, 5.4, .5) : 1); drawPath([{x:B.x, y:B.y}, {x:end.x, y:end.y}], s3 ? pop(t, 5.6, .5) : 1, ACC); }
        }
      }
      if(s3){
        if(t < .9){ const a = actors[Math.min(actors.length - 1, Math.floor((t - .2) / .35 + 1))]; if(a && t > .05) cursor(a.x + 6, a.y + 6); }
        else if(t < 1.5) cursor(A.x + 6, A.y + 6);
      }
    }
  }

  // ---- timeline
  let step = 0, t0 = performance.now(), paused = false, visible = true, raf = 0;
  function setStep(i){
    step = i; t0 = performance.now();
    items.forEach(li=>li.classList.toggle('on', +li.dataset.step === i));
    nameEl.textContent = NAMES[i];
    cv.classList.toggle('on', i !== 5); if(scanImg) scanImg.classList.toggle('on', i === 5);
    bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = paused ? 'none' : `stagebar ${DUR[i]}s linear forwards`;
  }
  function tick(now){
    raf = 0;
    if(!visible) return;
    let t = (now - t0) / 1000;
    if(!paused && t > DUR[step]){ setStep((step + 1) % DUR.length); t = 0; }
    if(paused && step !== 4) t = Math.min(t, DUR[step] + 99); // hold the finished frame
    if(step !== 5){ if(!W) fit(); frame(step, t); }
    raf = requestAnimationFrame(tick);
  }
  items.forEach(li=>{ const go = ()=>{ paused = true; setStep(+li.dataset.step); }; li.addEventListener('mouseenter', go); li.addEventListener('click', go); li.addEventListener('focus', go); });
  box.addEventListener('mouseleave', ()=>{ paused = false; setStep(step); });
  new ResizeObserver(()=>{ fit(); }).observe(cv);
  if('IntersectionObserver' in window) new IntersectionObserver(es=>{ visible = es.some(e=>e.isIntersecting); if(visible && !raf){ t0 = performance.now(); raf = requestAnimationFrame(tick); } }, {threshold:.05}).observe(box);
  fit(); setStep(0); raf = requestAnimationFrame(tick);
})();
