// Landing page — two more floors move: the Mood board fills itself and the
// Script floor shows an AV script being written and a screenplay breaking down
// into scenes. Same canvas idiom as landing/howto.js. Hover pauses.
(function(){
  const ACC = '#0A7CFF', INK = '#2B2A27', INK2 = '#6B675F', INK3 = '#9A968D', LINE = '#E1DED6', CORAL = '#E8734A', SAND = '#E2A93B', LILAC = '#A98BE0', TEAL = '#4FA3A5', SOFT = '#F3F1EC';
  const clamp = (v, a, b)=>v < a ? a : v > b ? b : v;
  const ease = t=>{ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const out = t=>{ t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };
  const font = (px, w)=>`${w || 500} ${px}px Geist, -apple-system, "Inter", "Segoe UI", sans-serif`;

  function stage(canvas, W, H, draw, period){
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    let dpr = 1, cw = 0, ch = 0, S = 1, t0 = performance.now(), paused = false, visible = true, raf = 0, pausedAt = 0;
    const fit = ()=>{ const r = canvas.getBoundingClientRect(); if(!r.width) return; dpr = Math.min(2, devicePixelRatio || 1); cw = r.width; ch = r.height; canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); S = Math.min(cw / W, ch / H); };
    const tick = now=>{
      raf = 0; if(!visible) return;
      if(!cw) fit();
      const t = paused ? pausedAt : ((now - t0) / 1000) % period;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cw, ch);
      ctx.save(); ctx.translate((cw - W * S) / 2, (ch - H * S) / 2); ctx.scale(S, S);
      draw(ctx, t, W, H); ctx.restore();
      raf = requestAnimationFrame(tick);
    };
    canvas.addEventListener('mouseenter', ()=>{ pausedAt = ((performance.now() - t0) / 1000) % period; paused = true; });
    canvas.addEventListener('mouseleave', ()=>{ paused = false; t0 = performance.now() - pausedAt * 1000; });
    new ResizeObserver(fit).observe(canvas);
    if('IntersectionObserver' in window) new IntersectionObserver(es=>{ visible = es.some(e=>e.isIntersecting); if(visible && !raf){ t0 = performance.now() - pausedAt * 1000; raf = requestAnimationFrame(tick); } }, {threshold:.05}).observe(canvas);
    fit(); raf = requestAnimationFrame(tick);
  }
  // ---- shared bits
  function dots(ctx, W, H){ ctx.fillStyle = '#DCD8CF'; for(let x = 20; x < W; x += 28) for(let y = 20; y < H; y += 28){ ctx.beginPath(); ctx.arc(x, y, .9, 0, 7); ctx.fill(); } }
  function rr(ctx, x, y, w, h, r, fill, stroke, lw){ ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if(fill){ ctx.fillStyle = fill; ctx.fill(); } if(stroke){ ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); } }
  function card(ctx, x, y, w, h, k){ if(k <= 0) return false; ctx.save(); ctx.globalAlpha = k; const s = 1.08 - .08 * ease(k); ctx.translate(x + w / 2, y + h / 2); ctx.scale(s, s); ctx.translate(-w / 2, -h / 2); ctx.shadowColor = 'rgba(40,38,32,.16)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6; rr(ctx, 0, 0, w, h, 8, '#fff'); ctx.shadowColor = 'transparent'; rr(ctx, 0, 0, w, h, 8, null, LINE, 1); return true; }
  function cursor(ctx, x, y, a){ ctx.save(); ctx.globalAlpha = a == null ? 1 : a; ctx.translate(x, y); ctx.scale(1.15, 1.15); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 15); ctx.lineTo(3.6, 11.6); ctx.lineTo(6.5, 17.6); ctx.lineTo(9.2, 16.3); ctx.lineTo(6.4, 10.4); ctx.lineTo(11.2, 10.2); ctx.closePath(); ctx.fillStyle = '#111'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore(); }
  function text(ctx, s, x, y, px, col, w, al){ ctx.font = font(px, w); ctx.fillStyle = col || INK; ctx.textAlign = al || 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x, y); }
  function typed(ctx, s, x, y, px, col, k, w){ const n = Math.round(clamp(k, 0, 1) * s.length); text(ctx, s.slice(0, n) + (k > 0 && k < 1 ? '|' : ''), x, y, px, col, w); }
  // a "photo": a two-colour gradient with a soft subject blob — reads as an image thumbnail
  function photo(ctx, x, y, w, h, i){
    const pal = [['#7A5C3B', '#E1B86B'], ['#2B3A67', '#7FA9E6'], ['#4A6B3A', '#C8D9A3'], ['#8A2F2F', '#E8A090'], ['#3A3A3A', '#C9C4B9'], ['#B0632A', '#F0C674'], ['#22505A', '#89C2C6'], ['#5B4A7A', '#CDB6F0']];
    const [a, b] = pal[i % pal.length];
    const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, a); g.addColorStop(1, b);
    rr(ctx, x, y, w, h, 6, g);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.ellipse(x + w * .62, y + h * .58, w * .22, h * .3, -.4, 0, 7); ctx.fill();
  }

  // =============================================================== Mood board
  const MW = 900, MH = 560, MP = 12.5;
  const PH = [[70, 90], [250, 84], [430, 96], [70, 262], [250, 256], [430, 268]];
  function moodDraw(ctx, t, W, H){
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); dots(ctx, W, H);
    text(ctx, 'LICHT — a brand film in three rooms', 40, 48, 20, INK, 800);
    // 1 · photos drop in from above, one every .35 s
    const grouped = ease((t - 7.3) / .6) > .6; // the first three live in the sub-board card from then on
    PH.forEach(([x, y], i)=>{
      if(grouped && i < 3) return;
      const k = ease((t - (.3 + i * .35)) / .45); if(k <= 0) return;
      const yy = y - (1 - k) * 60;
      ctx.save(); ctx.globalAlpha = k; ctx.translate(x + 80, yy + 55); ctx.rotate((i % 2 ? 1 : -1) * .02 * (1 - k)); ctx.translate(-80, -55);
      ctx.shadowColor = 'rgba(40,38,32,.18)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5; photo(ctx, 0, 0, 160, 110, i); ctx.shadowColor = 'transparent';
      text(ctx, ['Atelier · north light', 'Wet clay, cobalt', 'Studio, 15:00', 'Corridor', 'Hands', 'Night, one lamp'][i], 0, 128, 10.5, INK2);
      ctx.restore();
    });
    // 2 · a sticky note
    if(card(ctx, 640, 80, 210, 120, ease((t - 2.8) / .4))){ rr(ctx, 0, 0, 210, 120, 8, '#FCEFC0'); text(ctx, 'Natural light only in the atelier —', 14, 34, 12.5, INK, 600); text(ctx, 'one soft key, no fill above 20%.', 14, 54, 12.5, INK, 600); text(ctx, 'Oat, linen, cobalt.', 14, 88, 12.5, INK2); ctx.restore(); }
    // 3 · a column card
    if(card(ctx, 640, 220, 210, 140, ease((t - 3.5) / .4))){ rr(ctx, 0, 0, 210, 30, [8, 8, 0, 0], '#3E9B6E'); text(ctx, 'LOOK', 12, 20, 11, '#fff', 800); ['Super 35, 24 / 35 / 85', 'Practicals on, HMI as sun', 'Handheld only in the corridor'].forEach((s, i)=>text(ctx, '· ' + s, 12, 56 + i * 24, 12, INK)); ctx.restore(); }
    // 4 · a link card + a video card
    if(card(ctx, 640, 380, 100, 92, ease((t - 4.1) / .4))){ rr(ctx, 8, 8, 84, 46, 4, '#1F2340'); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(44, 22); ctx.lineTo(58, 31); ctx.lineTo(44, 40); ctx.closePath(); ctx.fill(); text(ctx, 'vimeo.com/…', 8, 72, 10.5, ACC, 600); text(ctx, 'Reference: Studio', 8, 86, 9.5, INK3); ctx.restore(); }
    if(card(ctx, 750, 380, 100, 92, ease((t - 4.5) / .4))){ photo(ctx, 8, 8, 84, 52, 6); rr(ctx, 58, 12, 28, 14, 3, '#000'); text(ctx, 'GIF', 72, 22.5, 8.5, '#fff', 800, 'center'); text(ctx, 'Loop · 4 s', 8, 78, 10.5, INK2); ctx.restore(); }
    // 5 · marquee around the first three photos → sub-board
    const m = ease((t - 5.6) / .7);
    if(m > 0 && t < 7.3){ ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = ACC; ctx.lineWidth = 1.5; const x0 = 56, y0 = 74, x1 = 56 + (610 - 56) * m, y1 = 74 + (140 - 74 + 100) * m; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.fillStyle = 'rgba(10,124,255,.07)'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.restore(); cursor(ctx, 56 + (610 - 56) * m, 74 + 166 * m); }
    const g = ease((t - 7.3) / .6);
    if(g > 0){
      // the three photos shrink into one sub-board card
      ctx.save(); ctx.globalAlpha = 1;
      const cx = 56 + (610 - 56) / 2, cy = 157, w = (610 - 56) * (1 - g) + 220 * g, h = 166 * (1 - g) + 150 * g;
      rr(ctx, cx - w / 2, cy - h / 2, w, h, 12, `rgba(255,255,255,${.9 * g})`, ACC, 1.5);
      if(g > .6){ ctx.globalAlpha = (g - .6) / .4; rr(ctx, cx - w / 2, cy - h / 2, w, 28, [12, 12, 0, 0], ACC); text(ctx, 'SUB-BOARD · Location scout', cx - w / 2 + 12, cy - h / 2 + 19, 11, '#fff', 800); for(let i = 0; i < 3; i++) photo(ctx, cx - w / 2 + 14 + i * 66, cy - h / 2 + 42, 58, 42, i); text(ctx, '3 photos · open to browse', cx - w / 2 + 14, cy + h / 2 - 14, 10.5, INK2); }
      ctx.restore();
    }
    // 6 · one still travels to a camera as its frame
    const f = ease((t - 8.6) / 1.2);
    if(f > 0){
      const sx = 250 + 80, sy = 256 + 55, ex = 470, ey = 500;
      const x = sx + (ex - sx) * f, y = sy + (ey - sy) * f, w = 160 * (1 - .7 * f), h = 110 * (1 - .7 * f);
      rr(ctx, 400, 470, 150, 60, 10, '#fff', LINE, 1); rr(ctx, 412, 486, 30, 20, 4, ACC); ctx.fillStyle = '#fff'; ctx.fillRect(436, 491, 8, 10); text(ctx, 'Camera A · 35 mm', 452, 496, 11, INK, 700); text(ctx, 'frame ←', 452, 512, 10.5, INK2);
      ctx.save(); ctx.globalAlpha = .95; photo(ctx, x - w / 2, y - h / 2, w, h, 4); ctx.restore();
      if(f < 1) cursor(ctx, x + 6, y + 6);
      if(f >= 1) text(ctx, 'A still from the mood board becomes the viewfinder frame of a camera on the 2nd floor.', 40, 545, 12, INK2);
    }
  }

  // =============================================================== Script floor
  const SW = 900, SH = 560;
  const AV = [['1', 'Dawn. Sam wakes, reaches, switches the alarm off — before it rings.', 'Room tone. A bird.', 3],
              ['1', 'Close: the hand rests. A small smile.', 'Soft piano starts.', 2],
              ['2', 'Kitchen, sun. Oat milk pours into the glass — the hero shot.', 'Pour. Radio, barely.', 4],
              ['3', 'Front door. Sam sits on the stoop; the street wakes.', 'City ambience up.', 4],
              ['3', 'Pack shot on the step. HAVER — slow mornings.', 'VO: "Take the morning."', 2]];
  const SCENES = [['INT. BEDROOM — DAWN', 'Grey light through the curtains. SAM wakes before the alarm.'], ['INT. KITCHEN — MORNING', 'Sun on the worktop. The pour is the hero.'], ['EXT. STREET — MORNING', 'Front door opens. Sam sits on the stoop.']];
  function scriptDraw(ctx, t, W, H){
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); dots(ctx, W, H);
    const A = t < 6.2;
    if(A){
      // ---- an AV script writes itself
      text(ctx, 'HAVER — 15" TV', 40, 44, 18, INK, 800); text(ctx, 'AV script · the seconds add up', 200, 44, 12, INK2);
      const x = 40, y = 66, w = 820, cols = [['SC', 44], ['TIME', 64], ['VIDEO — SEE', 420], ['AUDIO — HEAR', 240]];
      rr(ctx, x, y, w, 30, [8, 8, 0, 0], SOFT, LINE, 1);
      let cx = x + 10; cols.forEach(([n, cw])=>{ text(ctx, n, cx, y + 20, 10.5, INK2, 800); cx += cw; });
      let tsum = 0;
      AV.forEach((row, i)=>{
        const k = clamp((t - (.4 + i * 1.05)) / .9, 0, 1); const ry = y + 30 + i * 56;
        rr(ctx, x, ry, w, 56, 0, i % 2 ? '#FBFAF7' : '#fff', LINE, 1);
        if(k <= 0){ return; }
        let cx2 = x + 10;
        text(ctx, row[0], cx2, ry + 24, 12, INK, 800); cx2 += cols[0][1];
        const mm = Math.floor(tsum / 60), ss = tsum % 60; text(ctx, `0:${String(tsum).padStart(2, '0')}`, cx2, ry + 24, 12, INK2, 600); text(ctx, row[3] + ' s', cx2, ry + 42, 10.5, INK3); cx2 += cols[1][1];
        typed(ctx, row[1], cx2, ry + 24, 12, INK, k); cx2 += cols[2][1];
        typed(ctx, row[2], cx2, ry + 24, 12, INK2, clamp((k - .5) * 2, 0, 1));
        if(k >= 1) tsum += row[3];
        if(i === 2 && t > 3.2){ const s = ease((t - 3.2) / .4); ctx.save(); ctx.globalAlpha = s; photo(ctx, x + w - 96, ry + 6, 66, 44, 5); ctx.restore(); }
      });
      const total = AV.reduce((a, r)=>a + r[3], 0);
      if(t > 5.4) text(ctx, `Total 0:${String(total).padStart(2, '0')} — five beats, three scenes. Break down → every SC becomes a floor plan.`, 40, 400, 12.5, INK2);
      if(t > 5.6){ const k = ease((t - 5.6) / .4); rr(ctx, 40, 418, 210, 36, 18, ACC); text(ctx, 'Break down → scenes', 145, 441, 12.5, '#fff', 800, 'center'); cursor(ctx, 150 + 40 * (1 - k), 440 + 30 * (1 - k)); }
    } else {
      // ---- a screenplay breaks down into scenes
      const u = t - 6.2;
      const cardIn = ease(u / .5);
      if(card(ctx, 40 - 30 * (1 - cardIn), 40, 400, 470, cardIn)){
        text(ctx, 'Haver — screenplay', 18, 30, 13, INK, 800); text(ctx, 'imported .fountain', 18, 46, 10.5, INK3);
        let yy = 82;
        SCENES.forEach((sc, i)=>{
          const k = clamp((u - .5 - i * 1.1) / .8, 0, 1);
          if(k > 0){ ctx.font = font(12, 800); const hw = ctx.measureText(sc[0]).width; if(k >= 1 && u > 4.4){ rr(ctx, 14, yy - 14, hw + 8, 20, 4, 'rgba(10,124,255,.14)'); } typed(ctx, sc[0], 18, yy, 12, INK, k, 800); }
          const k2 = clamp((u - .9 - i * 1.1) / .9, 0, 1); if(k2 > 0) typed(ctx, sc[1], 18, yy + 20, 11.5, INK2, k2);
          yy += 108;
        });
        // the button
        const b = ease((u - 4.0) / .4);
        if(b > 0){ rr(ctx, 18, 420, 200, 34, 17, u > 4.6 ? '#3A54D6' : ACC); text(ctx, 'Break down → scenes', 118, 442, 12, '#fff', 800, 'center'); }
        ctx.restore();
      }
      if(u > 4.0 && u < 4.8) cursor(ctx, 40 + 130 + 30 * (1 - ease((u - 4.0) / .5)), 40 + 445 + 40 * (1 - ease((u - 4.0) / .5)));
      // scene cards fly out to the right
      SCENES.forEach((sc, i)=>{
        const k = ease((u - 4.7 - i * .35) / .6); if(k <= 0) return;
        const x = 490 + (1 - k) * 60, y = 60 + i * 150;
        ctx.save(); ctx.globalAlpha = k;
        rr(ctx, x, y, 370, 128, 10, '#fff', LINE, 1);
        // mini plan
        rr(ctx, x + 14, y + 14, 130, 100, 4, '#FBFAF7'); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(x + 22, y + 22, 114, 84);
        if(i === 0){ rr(ctx, x + 40, y + 40, 44, 50, 2, '#E9E6DF', '#A9A395'); } if(i === 1){ rr(ctx, x + 30, y + 30, 90, 16, 2, '#E9E6DF', '#A9A395'); rr(ctx, x + 60, y + 60, 40, 24, 2, '#E9E6DF', '#A9A395'); } if(i === 2){ rr(ctx, x + 22, y + 80, 114, 20, 0, '#DDD9CF'); ctx.fillStyle = '#7FA05A'; ctx.beginPath(); ctx.arc(x + 40, y + 40, 10, 0, 7); ctx.fill(); }
        ctx.fillStyle = CORAL; ctx.beginPath(); ctx.arc(x + 100, y + 70, 5, 0, 7); ctx.fill();
        rr(ctx, x + 116, y + 92, 9, 6, 1, ACC); ctx.fillStyle = 'rgba(10,124,255,.15)'; ctx.beginPath(); ctx.moveTo(x + 120, y + 95); ctx.lineTo(x + 92, y + 62); ctx.lineTo(x + 124, y + 58); ctx.closePath(); ctx.fill();
        text(ctx, (i + 1) + ' · ' + sc[0].replace(/ —.*$/, '').replace(/^(INT|EXT)\. /, ''), x + 160, y + 40, 14, INK, 800);
        text(ctx, sc[0], x + 160, y + 60, 10.5, INK3, 600);
        text(ctx, ['1A wide · 1B close', '2A gimbal · 2B top shot', '3A steadicam'][i], x + 160, y + 84, 11.5, INK2);
        text(ctx, 'floor plan ready to draw →', x + 160, y + 108, 11, ACC, 700);
        ctx.restore();
        // connector from the heading to the card
        ctx.save(); ctx.globalAlpha = k * .7; ctx.strokeStyle = ACC; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(440, 40 + 82 + i * 108 - 6); ctx.bezierCurveTo(470, 40 + 82 + i * 108, 460, y + 64, x, y + 64); ctx.stroke(); ctx.restore();
      });
      if(u > 6.4) text(ctx, 'Change the script later and the scenes follow — nothing you drew is thrown away.', 40, 545, 12, INK2);
    }
  }

  stage(document.getElementById('moodCv'), MW, MH, moodDraw, MP);
  stage(document.getElementById('scriptCv'), SW, SH, scriptDraw, 14);
})();
