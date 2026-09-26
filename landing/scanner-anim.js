// Landing page — Floor Scanner on an iPhone, four steps in one loop:
// 1 Scan (LiDAR outlines the room, the plan grows underneath),
// 2 Check (tap a piece, pick what it is, square up),
// 3 Frame (director's viewfinder: sensor, lens set, 2.39 frame lines, shutter),
// 4 Sync (the room flies into Floorboard's room library).
// The step list beside the canvas (.scansteps li) lights up in step.
(function(){
  const cv = document.getElementById('scanCv'); if(!cv) return;
  const ctx = cv.getContext('2d');
  const W = 760, H = 700, P = {x:70, y:30, w:318, h:650, r:52};
  const STEPS = [[0, 5.2], [5.2, 10.6], [10.6, 15.4], [15.4, 20]], PERIOD = 20;
  const ACC = '#0A7CFF', CORAL = '#E8734A', INK = '#1C1B19', INK2 = '#6B675F', LINE = '#E6E2D9', SAND = '#E2A93B';
  const clamp = (v, a, b)=>v < a ? a : v > b ? b : v;
  const ease = t=>{ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const back = t=>{ t = clamp(t, 0, 1); const c = 1.5; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const span = (t, a, b)=>clamp((t - a) / (b - a), 0, 1);
  const lerp = (a, b, k)=>a + (b - a) * k;
  const font = (px, w)=>`${w || 500} ${px}px Geist, -apple-system, "SF Pro Text", "Inter", "Segoe UI", sans-serif`;
  function rr(x, y, w, h, r, fill, stroke, lw){ ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if(fill){ ctx.fillStyle = fill; ctx.fill(); } if(stroke){ ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); } }
  function txt(s, x, y, px, col, w, al){ ctx.font = font(px, w); ctx.fillStyle = col; ctx.textAlign = al || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); }
  function shadow(b, y, a){ ctx.shadowColor = `rgba(20,20,24,${a})`; ctx.shadowBlur = b; ctx.shadowOffsetY = y; }
  function noShadow(){ ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
  function tap(x, y, k){ if(k <= 0 || k >= 1) return; ctx.save(); ctx.globalAlpha = (1 - k) * .9; ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 10 + 22 * k, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); }

  // the room, in plan (cm-ish units) — shared by scan, check and sync
  const ROOM = [[0, 0], [520, 0], [520, 300], [360, 300], [360, 420], [0, 420]];
  const PIECES = [{k:'sofa', x:120, y:330, w:170, h:70, label:'Sofa'}, {k:'table', x:300, y:120, w:120, h:70, label:'Table'}, {k:'storage', x:470, y:60, w:60, h:90, label:'Storage'}];
  function plan(x, y, s, opt){
    const o = opt || {}; const grow = o.grow == null ? 1 : o.grow, rot = o.rot || 0;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s); ctx.translate(-260, -210);
    // walls, drawn progressively
    const total = ROOM.reduce((a, p, i)=>{ const q = ROOM[(i + 1) % ROOM.length]; return a + Math.hypot(q[0] - p[0], q[1] - p[1]); }, 0);
    let left = total * grow;
    ctx.strokeStyle = o.ink || INK; ctx.lineWidth = 9 / s * .6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(ROOM[0][0], ROOM[0][1]);
    for(let i = 0; i < ROOM.length && left > 0; i++){ const p = ROOM[i], q = ROOM[(i + 1) % ROOM.length]; const L = Math.hypot(q[0] - p[0], q[1] - p[1]); const k = Math.min(1, left / L); ctx.lineTo(p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k); left -= L; }
    ctx.stroke();
    if(grow >= 1){
      // window + door
      ctx.strokeStyle = o.bg || '#fff'; ctx.lineWidth = 9 / s * .6 + 2; ctx.beginPath(); ctx.moveTo(140, 0); ctx.lineTo(300, 0); ctx.moveTo(0, 150); ctx.lineTo(0, 240); ctx.stroke();
      ctx.strokeStyle = '#7FA9E6'; ctx.lineWidth = 2 / s; ctx.beginPath(); ctx.moveTo(140, -4); ctx.lineTo(300, -4); ctx.moveTo(140, 4); ctx.lineTo(300, 4); ctx.stroke();
      ctx.strokeStyle = o.ink || INK; ctx.lineWidth = 2.5 / s; ctx.beginPath(); ctx.moveTo(0, 150); ctx.lineTo(80, 150); ctx.stroke();
      (o.pieces || PIECES).forEach(p=>{ ctx.save(); ctx.globalAlpha = p.a == null ? 1 : p.a; rr(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 8, p.fill || '#E9E6DF', p.stroke || '#A9A395', 1.5 / s); ctx.restore(); });
    }
    ctx.restore();
  }

  function phoneFrame(){
    shadow(40, 18, .28); rr(P.x, P.y, P.w, P.h, P.r, '#1A1A1D'); noShadow();
    rr(P.x + 4, P.y + 4, P.w - 8, P.h - 8, P.r - 4, null, '#3A3A40', 1.5);
  }
  function screenClip(){ ctx.save(); ctx.beginPath(); ctx.roundRect(P.x + 10, P.y + 10, P.w - 20, P.h - 20, P.r - 10); ctx.clip(); }
  const SX = P.x + 10, SY = P.y + 10, SW = P.w - 20, SH = P.h - 20;
  function statusBar(dark){ txt('9:41', SX + 36, SY + 22, 14, dark ? '#fff' : INK, 700); rr(SX + SW / 2 - 52, SY + 10, 104, 30, 15, '#000'); ctx.fillStyle = dark ? '#fff' : INK; rr(SX + SW - 58, SY + 16, 24, 12, 3, null, dark ? '#fff' : INK, 1.2); rr(SX + SW - 56, SY + 18, 16, 8, 1.5, dark ? '#fff' : INK); }

  // ---------------------------------------------------------------- 1 · scan
  function scan(t){
    // camera feed: a dim room in perspective
    const g = ctx.createLinearGradient(SX, SY, SX, SY + SH); g.addColorStop(0, '#3B3632'); g.addColorStop(.55, '#6E6457'); g.addColorStop(1, '#2A2622'); ctx.fillStyle = g; ctx.fillRect(SX, SY, SW, SH);
    const vx = SX + SW / 2 + Math.sin(t * .8) * 16, vy = SY + 250;
    // back wall, floor, side walls (perspective quads)
    const bw = {x0:vx - 90, y0:vy - 110, x1:vx + 90, y1:vy + 40};
    ctx.fillStyle = 'rgba(210,196,176,.22)'; ctx.fillRect(bw.x0, bw.y0, bw.x1 - bw.x0, bw.y1 - bw.y0);
    ctx.fillStyle = 'rgba(160,140,115,.35)'; ctx.beginPath(); ctx.moveTo(bw.x0, bw.y1); ctx.lineTo(bw.x1, bw.y1); ctx.lineTo(SX + SW + 40, SY + SH - 170); ctx.lineTo(SX - 40, SY + SH - 170); ctx.closePath(); ctx.fill();
    // furniture silhouettes
    ctx.fillStyle = 'rgba(40,34,30,.55)'; ctx.fillRect(vx - 70, vy + 5, 90, 30); ctx.fillRect(vx + 40, vy - 40, 34, 75);
    // LiDAR edges drawing in
    const k = span(t, .5, 3.8);
    const edges = [[bw.x0, bw.y0, bw.x1, bw.y0], [bw.x1, bw.y0, bw.x1, bw.y1], [bw.x1, bw.y1, bw.x0, bw.y1], [bw.x0, bw.y1, bw.x0, bw.y0], [bw.x0, bw.y1, SX - 40, SY + SH - 170], [bw.x1, bw.y1, SX + SW + 40, SY + SH - 170], [bw.x0, bw.y0, SX - 40, SY - 40], [bw.x1, bw.y0, SX + SW + 40, SY - 40]];
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.shadowColor = 'rgba(120,170,255,.9)'; ctx.shadowBlur = 10;
    edges.forEach((e, i)=>{ const kk = clamp(k * edges.length - i, 0, 1); if(kk <= 0) return; ctx.beginPath(); ctx.moveTo(e[0], e[1]); ctx.lineTo(lerp(e[0], e[2], kk), lerp(e[1], e[3], kk)); ctx.stroke(); });
    // detected objects: boxes pop with a label
    if(t > 2.2){ const a = ease(span(t, 2.2, 2.6)); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(vx - 72, vy + 3, 94, 34); ctx.shadowBlur = 0; rr(vx - 72, vy - 20, 44, 18, 9, 'rgba(255,255,255,.9)'); txt('Sofa', vx - 50, vy - 11, 10.5, INK, 700, 'center'); ctx.shadowBlur = 10; ctx.globalAlpha = 1; }
    if(t > 2.8){ const a = ease(span(t, 2.8, 3.2)); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.strokeRect(vx + 38, vy - 42, 38, 79); ctx.shadowBlur = 0; rr(vx + 28, vy - 64, 58, 18, 9, 'rgba(255,255,255,.9)'); txt('Storage', vx + 57, vy - 55, 10.5, INK, 700, 'center'); ctx.globalAlpha = 1; }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    // sweep of LiDAR dots
    ctx.fillStyle = 'rgba(160,200,255,.55)'; for(let i = 0; i < 60; i++){ const a = (i * 137.5) % 360 * Math.PI / 180; const r = 40 + (i * 23 % 150); const x = vx + Math.cos(a + t) * r, y = vy - 20 + Math.sin(a + t) * r * .6; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill(); }
    statusBar(true);
    // top chip + mini plan growing at the bottom
    rr(SX + SW / 2 - 80, SY + 58, 160, 30, 15, 'rgba(0,0,0,.45)'); ctx.fillStyle = '#5AE38A'; ctx.beginPath(); ctx.arc(SX + SW / 2 - 60, SY + 73, 5, 0, 7); ctx.fill(); txt('Scanning · LiDAR', SX + SW / 2 + 8, SY + 73, 12.5, '#fff', 700, 'center');
    rr(SX + 16, SY + SH - 190, SW - 32, 150, 22, 'rgba(255,255,255,.92)');
    plan(SX + SW / 2, SY + SH - 115, .23, {grow:span(t, .6, 4.4), pieces:PIECES.map((p, i)=>({...p, a:ease(span(t, 2.4 + i * .5, 2.8 + i * .5))}))});
    txt('Move slowly along the walls', SX + SW / 2, SY + SH - 26, 12, '#fff', 600, 'center');
  }
  // ---------------------------------------------------------------- 2 · check
  function check(t){
    ctx.fillStyle = '#F4F3EF'; ctx.fillRect(SX, SY, SW, SH);
    statusBar(false);
    txt('‹ Atelier', SX + 18, SY + 70, 15, ACC, 500); txt('Check the scan', SX + SW / 2, SY + 70, 15, INK, 700, 'center'); txt('Done', SX + SW - 18, SY + 70, 15, ACC, 700, 'right');
    rr(SX + 12, SY + 96, SW - 24, 300, 18, '#fff');
    const sq = ease(span(t, 3.6, 4.2)); const rot = lerp(.07, 0, sq);
    const picked = t > 2.6;
    const pieces = PIECES.map(p=>p.k === 'storage' && picked ? {...p, label:'Corner sofa'} : p);
    plan(SX + SW / 2, SY + 246, .45, {rot, pieces});
    // tap chips on the plan
    const chip = (x, y, s, hot)=>{ ctx.font = font(10.5, 700); const w = ctx.measureText(s).width + 16; rr(x - w / 2, y - 10, w, 20, 10, hot ? ACC : 'rgba(10,124,255,.88)'); txt(s, x, y + .5, 10.5, '#fff', 700, 'center'); };
    chip(SX + SW / 2 - 63, SY + 300, 'Sofa'); chip(SX + SW / 2 + 18, SY + 206, 'Table'); chip(SX + SW / 2 + 88, SY + 179, picked ? 'Corner sofa' : 'Storage', t > .9 && t < 2.8);
    tap(SX + SW / 2 + 88, SY + 179, span(t, .8, 1.3));
    // buttons
    const bx = SX + 16, by = SY + 412;
    [['Turn left'], ['Turn right'], ['Square up']].forEach(([s], i)=>{ const x = bx + i * 94; const hot = i === 2 && t > 3.4 && t < 3.9; rr(x, by, 88, 36, 12, hot ? '#DCE3FF' : '#fff', LINE); txt(s, x + 44, by + 18.5, 12.5, ACC, 600, 'center'); });
    tap(bx + 2 * 94 + 44, by + 18, span(t, 3.4, 3.9));
    txt('Tap a piece to change what it is.', SX + 20, SY + 474, 12.5, INK2, 500);
    txt('Square up straightens walls a few degrees off.', SX + 20, SY + 494, 12.5, INK2, 500);
    // the sheet
    const up = ease(span(t, 1.1, 1.5)) * (1 - ease(span(t, 2.7, 3.1)));
    if(up > 0){
      ctx.fillStyle = `rgba(0,0,0,${.25 * up})`; ctx.fillRect(SX, SY, SW, SH);
      const sy = SY + SH - 330 * up;
      shadow(30, -4, .2); rr(SX, sy, SW, 360, 26, '#fff'); noShadow();
      rr(SX + SW / 2 - 20, sy + 8, 40, 5, 3, '#D5D2CB');
      txt('What is this?', SX + SW / 2, sy + 36, 15, INK, 700, 'center');
      rr(SX + 16, sy + 58, SW - 32, 34, 10, '#F1F0EC'); txt('Search (sofa, bed, kitchen…)', SX + 30, sy + 75, 12.5, '#9A968D');
      txt('LIVING', SX + 20, sy + 112, 10.5, INK2, 800);
      ['Sofa', 'Sofa (3-seat)', 'Corner sofa', 'Armchair', 'Bookcase'].forEach((s, i)=>{ const y = sy + 128 + i * 38; const hot = s === 'Corner sofa' && t > 2.2; if(hot) rr(SX + 12, y, SW - 24, 34, 9, '#E9EDFF'); txt(s, SX + 24, y + 17, 14, INK, 500); if(hot && t > 2.4) txt('✓', SX + SW - 30, y + 17, 15, ACC, 700, 'right'); ctx.fillStyle = LINE; ctx.fillRect(SX + 24, y + 36, SW - 48, 1); });
      tap(SX + SW / 2, sy + 128 + 2 * 38 + 17, span(t, 2.1, 2.6));
    }
  }
  // ---------------------------------------------------------------- 3 · frame
  function frame(t){
    // the scene through the lens: warm atelier, a figure by the window
    const g = ctx.createLinearGradient(SX, SY, SX + SW, SY + SH); g.addColorStop(0, '#1E2A3A'); g.addColorStop(.5, '#6B5A45'); g.addColorStop(1, '#231C16'); ctx.fillStyle = g; ctx.fillRect(SX, SY, SW, SH);
    const zoom = lerp(1, 1.28, ease(span(t, 2.2, 2.9)));
    ctx.save(); ctx.translate(SX + SW / 2, SY + SH / 2); ctx.scale(zoom, zoom); ctx.translate(-(SX + SW / 2), -(SY + SH / 2));
    const wg = ctx.createLinearGradient(SX + 40, 0, SX + 170, 0); wg.addColorStop(0, 'rgba(255,236,200,.85)'); wg.addColorStop(1, 'rgba(255,236,200,.2)'); ctx.fillStyle = wg; ctx.fillRect(SX + 40, SY + 150, 130, 230);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(SX + 102, SY + 150, 6, 230); ctx.fillRect(SX + 40, SY + 262, 130, 5);
    ctx.fillStyle = '#18130F'; ctx.beginPath(); ctx.ellipse(SX + 205, SY + 300, 26, 30, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(SX + 160, SY + 470); ctx.quadraticCurveTo(SX + 205, SY + 320, SX + 250, SY + 470); ctx.fill();
    ctx.fillStyle = 'rgba(255,220,170,.35)'; ctx.beginPath(); ctx.ellipse(SX + 188, SY + 296, 8, 22, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(40,30,22,.8)'; ctx.fillRect(SX, SY + 470, SW, 200);
    ctx.restore();
    // 2.39 frame lines
    const fw = SW - 30, fh = fw / 2.39 * 1.9, fx = SX + 15, fy = SY + SH / 2 - fh / 2 - 40;
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(SX, SY, SW, fy - SY); ctx.fillRect(SX, fy + fh, SW, SY + SH - fy - fh);
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 5]); ctx.strokeRect(fx, fy, fw, fh); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; for(let i = 1; i < 3; i++){ ctx.beginPath(); ctx.moveTo(fx + fw * i / 3, fy); ctx.lineTo(fx + fw * i / 3, fy + fh); ctx.moveTo(fx, fy + fh * i / 3); ctx.lineTo(fx + fw, fy + fh * i / 3); ctx.stroke(); }
    statusBar(true);
    // top chips
    const chips = ['Alexa 35 · open gate', 'Cooke S4/i', '2.39 : 1'];
    let cx = SX + 14; chips.forEach(s=>{ ctx.font = font(11, 700); const w = ctx.measureText(s).width + 18; rr(cx, SY + 56, w, 26, 13, 'rgba(0,0,0,.5)'); txt(s, cx + w / 2, SY + 69, 11, '#fff', 700, 'center'); cx += w + 6; });
    txt('Atelier · wide from the door', fx + 8, fy - 12, 11, 'rgba(255,255,255,.8)', 600);
    // lens strip: 25 32 40 50 65, scrolls from 32 to 40
    const focals = [18, 25, 32, 40, 50, 65, 75], sel = lerp(2, 3, ease(span(t, 2.2, 2.9)));
    const sy = SY + SH - 170;
    rr(SX + 14, sy, SW - 28, 54, 27, 'rgba(0,0,0,.5)');
    ctx.save(); ctx.beginPath(); ctx.roundRect(SX + 14, sy, SW - 28, 54, 27); ctx.clip();
    focals.forEach((f, i)=>{ const x = SX + SW / 2 + (i - sel) * 62; const on = Math.abs(i - sel) < .5; if(on) rr(x - 26, sy + 8, 52, 38, 19, '#FFD60A'); txt(String(f), x, sy + 27, 16, on ? '#000' : '#fff', 700, 'center'); });
    ctx.restore();
    txt(Math.round(lerp(32, 40, ease(span(t, 2.2, 2.9)))) + ' mm · ' + Math.round(lerp(42, 35, ease(span(t, 2.2, 2.9)))) + '° horizontal', SX + SW / 2, sy - 14, 12, '#fff', 700, 'center');
    tap(SX + SW / 2 + 62, sy + 27, span(t, 1.9, 2.4));
    // shutter
    const press = span(t, 3.5, 3.8); const s = 1 - .12 * Math.sin(press * Math.PI);
    ctx.save(); ctx.translate(SX + SW / 2, SY + SH - 64); ctx.scale(s, s); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 32, 0, 7); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 25, 0, 7); ctx.fill(); ctx.restore();
    photoThumb(SX + 34, SY + SH - 86, t > 3.8 ? ease(span(t, 3.8, 4.2)) : 0);
    const flash = span(t, 3.65, 4.1); if(flash > 0 && flash < 1){ ctx.fillStyle = `rgba(255,255,255,${.8 * (1 - flash)})`; ctx.fillRect(SX, SY, SW, SH); }
  }
  function photoThumb(x, y, k){ rr(x, y, 44, 44, 10, '#222', 'rgba(255,255,255,.6)', 1.5); if(k > 0){ ctx.save(); ctx.globalAlpha = k; const g = ctx.createLinearGradient(x, y, x + 44, y + 44); g.addColorStop(0, '#6B5A45'); g.addColorStop(1, '#1E2A3A'); rr(x + 2, y + 2, 40, 40, 8, g); ctx.restore(); } }
  // ---------------------------------------------------------------- 4 · sync
  function sync(t){
    ctx.fillStyle = '#F4F3EF'; ctx.fillRect(SX, SY, SW, SH);
    statusBar(false);
    txt('‹ Locations', SX + 18, SY + 70, 15, ACC, 500);
    txt('Atelier Kröller', SX + 20, SY + 112, 26, INK, 800);
    txt('Otterlo · 2 rooms · 14 photos', SX + 20, SY + 140, 13, INK2, 500);
    const synced = t > 1.8;
    rr(SX + SW - 118, SY + 58, 104, 26, 13, synced ? '#DDF3E4' : '#fff', synced ? null : LINE); txt(synced ? '✓ Synced' : 'Syncing…', SX + SW - 66, SY + 71, 12, synced ? '#1F7A45' : INK2, 700, 'center');
    if(!synced){ ctx.save(); ctx.translate(SX + SW - 132, SY + 71); ctx.rotate(t * 8); ctx.strokeStyle = ACC; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 4.5); ctx.stroke(); ctx.restore(); }
    txt('ROOMS', SX + 20, SY + 178, 11, INK2, 800);
    rr(SX + 12, SY + 190, SW - 24, 150, 16, '#fff');
    plan(SX + 82, SY + 265, .2, {});
    txt('Studio', SX + 150, SY + 238, 15, INK, 700); txt('520 × 420 cm · LiDAR', SX + 150, SY + 260, 12, INK2); txt('3 pieces · door · window', SX + 150, SY + 280, 12, INK2);
    txt('PHOTOS', SX + 20, SY + 368, 11, INK2, 800);
    for(let i = 0; i < 6; i++){ const x = SX + 12 + (i % 3) * 96, y = SY + 382 + Math.floor(i / 3) * 96; const g = ctx.createLinearGradient(x, y, x + 90, y + 90); const pal = [['#6B5A45', '#1E2A3A'], ['#7A5C3B', '#E1B86B'], ['#2B3A67', '#7FA9E6'], ['#4A6B3A', '#C8D9A3'], ['#3A3A3A', '#C9C4B9'], ['#B0632A', '#F0C674']][i]; g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]); rr(x, y, 90, 90, 10, g); }
  }
  // the Floorboard window that receives the room
  function floorboard(t){
    const k = ease(span(t, 1.2, 1.9)); if(k <= 0) return;
    const x = lerp(W + 40, 380, k), y = 170, w = 360, h = 380;
    ctx.save(); shadow(40, 18, .22); rr(x, y, w, h, 16, '#fff'); noShadow(); rr(x, y, w, h, 16, null, LINE);
    rr(x, y, w, 40, [16, 16, 0, 0], '#FAF9F6'); ctx.fillStyle = LINE; ctx.fillRect(x, y + 39.5, w, 1);
    ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c, i)=>{ ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 20 + i * 16, y + 20, 5.5, 0, 7); ctx.fill(); });
    txt('Floorboard · Room library', x + 84, y + 20.5, 12.5, INK2, 700);
    txt('Atelier Kröller', x + 20, y + 66, 15, INK, 800); txt('scanned just now on iPhone', x + 20, y + 86, 11.5, INK2, 500);
    // two existing room cards + the new one popping in
    const card = (cx, cy, label, sub, pop, hi)=>{ ctx.save(); const s = back(pop); ctx.globalAlpha = clamp(pop * 1.5, 0, 1); ctx.translate(cx + 75, cy + 70); ctx.scale(s, s); ctx.translate(-75, -70); rr(0, 0, 150, 140, 12, '#fff', hi ? ACC : LINE, hi ? 2 : 1); rr(8, 8, 134, 86, 8, '#FAF9F6'); ctx.restore(); ctx.save(); ctx.globalAlpha = clamp(pop * 1.5, 0, 1); plan(cx + 75, cy + 51, .2 * s, {}); txt(label, cx + 12, cy + 112, 13, INK, 700); txt(sub, cx + 12, cy + 128, 10.5, INK2); ctx.restore(); };
    card(x + 20, y + 106, 'Studio', 'new · LiDAR', ease(span(t, 2.3, 2.8)), t > 2.8);
    card(x + 190, y + 106, 'Hallway', '2 weeks ago', 1, false);
    const ins = ease(span(t, 3.2, 3.6));
    if(ins > 0){ ctx.save(); ctx.globalAlpha = ins; rr(x + 20, y + 268, w - 40, 40, 12, ACC); txt('Insert into scene 1 →', x + w / 2, y + 288.5, 13, '#fff', 700, 'center'); ctx.restore(); }
    txt('Photos land in the location, the room in the library.', x + 20, y + 340, 11.5, INK2, 500);
    ctx.restore();
    // the room travelling from phone to window
    const fly = span(t, 1.6, 2.4);
    if(fly > 0 && fly < 1){ const k2 = ease(fly); const fx = lerp(SX + 82, x + 95, k2), fy = lerp(SY + 265, y + 157, k2) - Math.sin(k2 * Math.PI) * 60; ctx.save(); ctx.globalAlpha = 1 - k2 * .2; rr(fx - 40, fy - 32, 80, 64, 10, '#fff', ACC, 1.5); plan(fx, fy, .12, {}); ctx.restore(); }
  }

  function draw(t){
    ctx.clearRect(0, 0, W, H);
    const step = STEPS.findIndex(([a, b])=>t >= a && t < b);
    // phone slides left in step 4 to make room for the window
    const shift = step === 3 ? -ease(span(t, STEPS[3][0], STEPS[3][0] + .8)) * 40 : 0;
    ctx.save(); ctx.translate(shift, 0);
    phoneFrame(); screenClip();
    const local = t - STEPS[Math.max(0, step)][0];
    [scan, check, frame, sync][Math.max(0, step)](local);
    // crossfade at step boundaries
    const edge = Math.min(local, STEPS[Math.max(0, step)][1] - STEPS[Math.max(0, step)][0] - local);
    if(edge < .25){ ctx.fillStyle = `rgba(0,0,0,${(1 - edge / .25) * .8})`; ctx.fillRect(SX, SY, SW, SH); }
    ctx.restore(); ctx.restore();
    // home indicator
    rr(P.x + shift + P.w / 2 - 60, P.y + P.h - 22, 120, 5, 3, step === 1 || step === 3 ? '#1C1B19' : '#fff');
    if(step === 3) floorboard(local);
    return step;
  }

  // ---------------------------------------------------------------- loop
  let dpr = 1, cw = 0, ch = 0, S = 1, t0 = performance.now(), paused = false, visible = true, raf = 0, pausedAt = 0, lastStep = -1;
  const items = [...document.querySelectorAll('#scanner .scansteps li')];
  const fit = ()=>{ const r = cv.getBoundingClientRect(); if(!r.width) return; dpr = Math.min(2, devicePixelRatio || 1); cw = r.width; ch = r.height; cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); S = Math.min(cw / W, ch / H); };
  const tick = now=>{
    raf = 0; if(!visible) return; if(!cw) fit();
    const t = paused ? pausedAt : ((now - t0) / 1000) % PERIOD;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cw, ch);
    ctx.save(); ctx.translate((cw - W * S) / 2, (ch - H * S) / 2); ctx.scale(S, S); const step = draw(t); ctx.restore();
    if(step !== lastStep){ lastStep = step; items.forEach((li, i)=>li.classList.toggle('on', i === step)); }
    raf = requestAnimationFrame(tick);
  };
  // clicking a step jumps there
  items.forEach((li, i)=>li.addEventListener('click', ()=>{ t0 = performance.now() - (STEPS[i][0] + .01) * 1000; paused = false; }));
  cv.addEventListener('mouseenter', ()=>{ pausedAt = ((performance.now() - t0) / 1000) % PERIOD; paused = true; });
  cv.addEventListener('mouseleave', ()=>{ paused = false; t0 = performance.now() - pausedAt * 1000; });
  new ResizeObserver(fit).observe(cv);
  if('IntersectionObserver' in window) new IntersectionObserver(es=>{ visible = es.some(e=>e.isIntersecting); if(visible && !raf){ t0 = performance.now() - pausedAt * 1000; raf = requestAnimationFrame(tick); } }, {threshold:.05}).observe(cv);
  cv.__seek = s=>{ paused = true; pausedAt = s; };
  fit(); raf = requestAnimationFrame(tick);
})();
