// FLOOR — 00-catalog.js
// Extracted from the original single-file build. All files share global scope
// (loaded as classic scripts, in order). True ES modules come with the build step later.
'use strict';
/* =====================================================================
   Blocking Board v2 — single-file shot design tool
   ===================================================================== */

// ---------------------------------------------------------------- utils
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const deg = r => r * 180 / Math.PI, rad = d => d * Math.PI / 180;
const dist = (x1,y1,x2,y2) => Math.hypot(x2-x1, y2-y1);
const norm = a => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return a; };
function ptSeg(px,py,x1,y1,x2,y2){
  const dx=x2-x1, dy=y2-y1, L2=dx*dx+dy*dy;
  let t = L2 ? ((px-x1)*dx+(py-y1)*dy)/L2 : 0; t = clamp(t,0,1);
  const x=x1+t*dx, y=y1+t*dy;
  return {d:Math.hypot(px-x,py-y), t, x, y};
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ---------------------------------------------------------------- palette
const COLORS = ['#5B6472','#4B6BFB','#E8604C','#3FA46A','#E2A93B','#8B5CF6'];
const WALL_COLOR = '#3B3A36';

// lens presets (full-frame horizontal FOV)
const LENSES = [10,16,20,24,28,35,50,85,100,135];
const FRAMINGS = ['','Extreme wide','Wide','Full shot','Medium','Medium close-up','Close-up','Extreme close-up','Insert','Top shot','Over-shoulder','POV','Two-shot'];
const SUPPORTS = ['','Tripod','Handheld','Shoulder rig','Slider','Car mount'];
function shortUrl(u){
  if(!u) return '';
  let s = u.replace(/^https?:\/\//i,'').replace(/^www\./i,'');
  if(s.length > 34) s = s.slice(0, 32) + '\u2026';
  return s;
}
function trimText(ctx, t, maxW){
  if(ctx.measureText(t).width <= maxW) return t;
  while(t.length > 2 && ctx.measureText(t + '\u2026').width > maxW) t = t.slice(0, -1);
  return t + '\u2026';
}
function videoThumbUrl(u){
  if(!u) return null;
  let m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/))([\w-]{6,15})/i);
  if(m) return 'https://i.ytimg.com/vi/' + m[1] + '/hqdefault.jpg';
  m = u.match(/vimeo\.com\/(\d{6,12})/i);
  if(m) return 'https://vumbnail.com/' + m[1] + '.jpg';
  return null;
}
function noteFont(o, base){
  const fs = o.fontSize || base || 13;
  return `${o.italic?'italic ':''}${o.bold?'700':'400'} ${fs}px -apple-system,Segoe UI,sans-serif`;
}
const fovForLens = f => deg(2*Math.atan(18/f));

// ---------------------------------------------------------------- prop drawing
function shade(hex, f){
  const n = parseInt(hex.slice(1),16);
  const r = clamp(((n>>16)&255)*f,0,255)|0, g = clamp(((n>>8)&255)*f,0,255)|0, b = clamp((n&255)*f,0,255)|0;
  return `rgb(${r},${g},${b})`;
}
function baseRect(ctx,w,h,c,r){
  r = Math.min(r ?? 6, w/2, h/2);
  ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,r);
  ctx.fillStyle = c; ctx.globalAlpha = .28; ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = c; ctx.stroke();
}
// ---- kitchen: ONE block, the sink & hob live INSIDE it (o.sink / o.hob are
// 0..1 fractions along the counter run; null hides one; blue selection
// handles slide them). The corner variant runs top edge then left edge.
function kitchenBody(ctx,w,h,c){
  baseRect(ctx,w,h,c,4);
  ctx.strokeStyle=c; ctx.globalAlpha=.35;
  ctx.beginPath();
  for(let x=-w/2+60; x<w/2-12; x+=60){ ctx.moveTo(x,-h/2); ctx.lineTo(x,h/2); }
  ctx.stroke(); ctx.globalAlpha=1;
}
function kitchenCornerBody(ctx,w,h,c){
  const d = Math.min(w, h) * .36; // counter depth
  ctx.strokeStyle=c;
  for(const [x,y,rw,rh] of [[-w/2,-h/2,w,d],[-w/2,-h/2,d,h]]){
    ctx.beginPath(); ctx.roundRect(x, y, rw, rh, 4);
    ctx.fillStyle=c; ctx.globalAlpha=.28; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
  }
  ctx.globalAlpha=.35;
  ctx.beginPath();
  for(let x=-w/2+d; x<w/2-12; x+=60){ ctx.moveTo(x,-h/2); ctx.lineTo(x,-h/2+d); }
  for(let y=-h/2+d; y<h/2-12; y+=60){ ctx.moveTo(-w/2,y); ctx.lineTo(-w/2+d,y); }
  ctx.stroke(); ctx.globalAlpha=1;
}
function kitchenRunGeo(kind, w, h){
  const d = kind === 'kitchen_corner' ? Math.min(w, h) * .36 : h;
  return {d, L: w + (kind === 'kitchen_corner' ? h - d : 0)};
}
function kitchenPointAt(kind, w, h, t){
  const {d, L} = kitchenRunGeo(kind, w, h);
  const s = t * L;
  if(kind !== 'kitchen_corner' || s <= w)
    return {x: -w/2 + Math.min(s, w), y: -h/2 + d/2, vert:false, d};
  return {x: -w/2 + d/2, y: -h/2 + d + (s - w), vert:true, d};
}
function kitchenParamFromLocal(kind, w, h, lx, ly){
  const {d, L} = kitchenRunGeo(kind, w, h);
  if(kind !== 'kitchen_corner') return clamp((lx + w/2) / w, .08, .92);
  const dTop = Math.abs(ly - (-h/2 + d/2));
  const dLeft = Math.abs(lx - (-w/2 + d/2));
  const s = dTop <= dLeft
    ? clamp(lx + w/2, d*.7, w - d*.5)                      // along the top run
    : w + clamp(ly - (-h/2 + d), d*.3, h - d - d*.5);      // down the left run
  return clamp(s / L, .02, .98);
}
function kitchenFixtures(ctx, kind, w, h, c, sink, hob){
  const one = (t, isSink)=>{
    if(t == null) return;
    const p = kitchenPointAt(kind, w, h, t);
    const d = p.d;
    ctx.save();
    ctx.translate(p.x, p.y);
    if(p.vert) ctx.rotate(Math.PI/2);
    ctx.strokeStyle = c;
    if(isSink){
      ctx.beginPath(); ctx.roundRect(-d*.3, -d*.26, d*.6, d*.52, 4); ctx.stroke();
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(0, -d*.37, 2.4, 0, 7); ctx.fill(); // tap
      ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, 7); ctx.fill();      // drain
    } else {
      ctx.globalAlpha=.75;
      for(const [dx,dy] of [[-.5,-.5],[.5,-.5],[-.5,.5],[.5,.5]]){
        ctx.beginPath(); ctx.arc(dx*d*.3, dy*d*.3, d*.16, 0, 7); ctx.stroke();
      }
      ctx.globalAlpha=1;
    }
    ctx.restore();
  };
  one(sink, true);
  one(hob, false);
}
function sofaDraw(ctx,w,h,c,seats){ // straight sofa, any seat count
  baseRect(ctx,w,h,c,12);
  ctx.fillStyle=c; ctx.globalAlpha=.5;
  ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h*.28,10); ctx.fill();
  ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w*.1,h,10); ctx.fill();
  ctx.beginPath(); ctx.roundRect(w/2-w*.1,-h/2,w*.1,h,10); ctx.fill();
  ctx.globalAlpha=1;
  ctx.strokeStyle=c; ctx.globalAlpha=.4;
  const a = w*.1, seatW = (w - a*2) / seats;
  for(let i=1;i<seats;i++){
    const x = -w/2 + a + seatW*i;
    ctx.beginPath(); ctx.moveTo(x,-h*.2); ctx.lineTo(x,h/2-4); ctx.stroke();
  }
  ctx.globalAlpha=1;
}
function lampDraw(ctx,w,h,c){ // shared practical-light glyph
  const r = Math.min(w,h)/2;
  ctx.beginPath(); ctx.arc(0,0,r*.62,0,7);
  ctx.fillStyle=c; ctx.globalAlpha=.35; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=c; ctx.stroke();
  ctx.globalAlpha=.55;
  for(let i=0;i<8;i++){ const a=i*Math.PI/4;
    ctx.beginPath(); ctx.moveTo(Math.cos(a)*r*.72,Math.sin(a)*r*.72); ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r); ctx.stroke(); }
  ctx.globalAlpha=1;
  ctx.beginPath(); ctx.arc(0,0,r*.14,0,7); ctx.fillStyle=c; ctx.fill();
}

// PROPS: sizes in cm (top-down)
const PROPS = {
  // ---- furniture ----
  chair:{w:45,h:45,name:'Chair',round:1,draw(ctx,w,h,c){
    baseRect(ctx,w*.8,h*.8,c,5);
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h*.22,4); ctx.fillStyle=c; ctx.fill();
  }},
  armchair:{w:85,h:80,name:'Armchair',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,12);
    ctx.fillStyle=c; ctx.globalAlpha=.5;
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h*.26,9); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w*.2,h,9); ctx.fill();
    ctx.beginPath(); ctx.roundRect(w/2-w*.2,-h/2,w*.2,h,9); ctx.fill();
    ctx.globalAlpha=1;
  }},
  table:{w:140,h:80,name:'Table',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,7);
    ctx.beginPath(); ctx.moveTo(-w/2+8,0); ctx.lineTo(w/2-8,0); ctx.strokeStyle=c; ctx.globalAlpha=.4; ctx.stroke(); ctx.globalAlpha=1;
  }},
  sofa:{w:220,h:90,name:'Sofa',draw(ctx,w,h,c){ sofaDraw(ctx,w,h,c,2); }},
  sofa_3:{w:280,h:90,name:'3-seat sofa',draw(ctx,w,h,c){ sofaDraw(ctx,w,h,c,3); }},
  sofa_4:{w:350,h:90,name:'4-seat sofa',draw(ctx,w,h,c){ sofaDraw(ctx,w,h,c,4); }},
  sofa_corner:{w:280,h:200,name:'Corner sofa',draw(ctx,w,h,c){
    const d = Math.min(w, h) * .44;
    // the L: a run along the top + a run down the left, back on the outer edges
    ctx.strokeStyle = c;
    for(const [x,y,rw,rh] of [[-w/2,-h/2,w,d],[-w/2,-h/2,d,h]]){
      ctx.beginPath(); ctx.roundRect(x, y, rw, rh, 10);
      ctx.fillStyle = c; ctx.globalAlpha = .14; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    }
    ctx.fillStyle = c; ctx.globalAlpha = .5;
    ctx.beginPath(); ctx.roundRect(-w/2, -h/2, w, d*.3, 8); ctx.fill();      // back, top run
    ctx.beginPath(); ctx.roundRect(-w/2, -h/2, d*.3, h, 8); ctx.fill();      // back, left run
    ctx.beginPath(); ctx.roundRect(w/2 - w*.06, -h/2, w*.06, d, 8); ctx.fill();   // arm right
    ctx.beginPath(); ctx.roundRect(-w/2, h/2 - h*.07, d, h*.07, 8); ctx.fill();   // arm bottom
    ctx.globalAlpha = 1;
    // cushion splits
    ctx.strokeStyle = c; ctx.globalAlpha = .4;
    ctx.beginPath();
    ctx.moveTo(-w/2 + d, -h/2 + d*.3); ctx.lineTo(-w/2 + d, -h/2 + d - 3);   // corner seam
    ctx.moveTo(-w/2 + (w - d)*.5 + d, -h/2 + d*.25); ctx.lineTo(-w/2 + (w - d)*.5 + d, -h/2 + d - 3);
    ctx.moveTo(-w/2 + d*.3, 0); ctx.lineTo(-w/2 + d - 3, 0);                 // chaise seam
    ctx.stroke(); ctx.globalAlpha = 1;
  }},
  bed:{w:160,h:200,name:'Bed',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,8);
    ctx.strokeStyle=c; ctx.globalAlpha=.55;
    ctx.beginPath(); ctx.roundRect(-w/2+8,-h/2+6,w*.4-10,h*.18,5); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(w/2-w*.4+2,-h/2+6,w*.4-10,h*.18,5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w/2,-h/2+h*.3); ctx.lineTo(w/2,-h/2+h*.3); ctx.stroke(); ctx.globalAlpha=1;
  }},
  bed_single:{w:90,h:200,name:'Single bed',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,8);
    ctx.strokeStyle=c; ctx.globalAlpha=.55;
    ctx.beginPath(); ctx.roundRect(-w/2+8,-h/2+6,w-16,h*.18,5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w/2,-h/2+h*.3); ctx.lineTo(w/2,-h/2+h*.3); ctx.stroke();
    ctx.globalAlpha=1;
  }},
  bed_hospital:{w:100,h:215,name:'Hospital bed',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,6);
    ctx.strokeStyle=c; ctx.globalAlpha=.55;
    ctx.beginPath(); ctx.roundRect(-w/2+8,-h/2+8,w-16,h*.15,4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w/2,-h/2+h*.26); ctx.lineTo(w/2,-h/2+h*.26); ctx.stroke();
    ctx.globalAlpha=1;
    ctx.lineWidth=3.5; // side rails
    ctx.beginPath(); ctx.moveTo(-w/2-4,-h*.2); ctx.lineTo(-w/2-4,h*.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w/2+4,-h*.2); ctx.lineTo(w/2+4,h*.2); ctx.stroke();
    ctx.lineWidth=2;
    for(const [x2,y2] of [[-w/2+9,-h/2-5],[w/2-9,-h/2-5],[-w/2+9,h/2+5],[w/2-9,h/2+5]]){
      ctx.beginPath(); ctx.arc(x2,y2,4,0,7); ctx.stroke(); // castors
    }
  }},
  wheelchair:{w:66,h:76,name:'Wheelchair',round:1,draw(ctx,w,h,c){
    ctx.strokeStyle=c;
    ctx.beginPath(); ctx.roundRect(-w*.28,-h*.25,w*.56,h*.5,4); // seat
    ctx.fillStyle=c; ctx.globalAlpha=.22; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    ctx.lineWidth=4.5; // big side wheels
    ctx.beginPath(); ctx.moveTo(-w*.44,-h*.3); ctx.lineTo(-w*.44,h*.32); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w*.44,-h*.3); ctx.lineTo(w*.44,h*.32); ctx.stroke();
    ctx.lineWidth=2;
    ctx.beginPath(); // footrests forward, push handles back
    ctx.moveTo(-w*.17,h*.3); ctx.lineTo(-w*.17,h*.46); ctx.moveTo(w*.17,h*.3); ctx.lineTo(w*.17,h*.46);
    ctx.moveTo(-w*.2,-h*.3); ctx.lineTo(-w*.2,-h*.44); ctx.moveTo(w*.2,-h*.3); ctx.lineTo(w*.2,-h*.44);
    ctx.stroke();
  }},
  rug:{w:200,h:140,name:'Rug',draw(ctx,w,h,c){
    ctx.setLineDash([5,4]);
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,10);
    ctx.fillStyle=c; ctx.globalAlpha=.14; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=c; ctx.stroke();
    ctx.setLineDash([]);
  }},
  // ---- vehicles (real-world sizes) ----
  bicycle:{w:175,h:60,name:'Bicycle',draw(ctx,w,h,c){
    ctx.strokeStyle=c; ctx.lineWidth=5;
    ctx.beginPath(); ctx.moveTo(-w/2,0); ctx.lineTo(-w*.07,0); ctx.moveTo(w*.07,0); ctx.lineTo(w/2,0); ctx.stroke();
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(-w*.25,0); ctx.lineTo(w*.25,0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w*.3,-h/2); ctx.lineTo(w*.3,h/2); ctx.stroke(); // handlebar
    ctx.beginPath(); ctx.arc(-w*.15,0,h*.14,0,7); ctx.fillStyle=c; ctx.fill(); // saddle
  }},
  car:{w:450,h:180,name:'Car',draw(ctx,w,h,c){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,h*.3);
    ctx.fillStyle=c; ctx.globalAlpha=.25; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=c; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-w*.18,-h*.36,w*.42,h*.72,10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w*.34,-h*.34); ctx.lineTo(w*.34,h*.34); ctx.stroke();
  }},
  minivan:{w:500,h:195,name:'Minivan',draw(ctx,w,h,c){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,h*.16);
    ctx.fillStyle=c; ctx.globalAlpha=.25; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=c; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-w*.34,-h*.38,w*.62,h*.76,8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w*.36,-h*.32); ctx.lineTo(w*.36,h*.32); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w*.05,h*.38); ctx.lineTo(w*.14,h*.38); ctx.strokeStyle=c; ctx.lineWidth=3.5; ctx.stroke(); ctx.lineWidth=2; // slider door
  }},
  train:{w:1900,h:300,name:'Train car',draw(ctx,w,h,c){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,h*.1);
    ctx.fillStyle=c; ctx.globalAlpha=.22; ctx.fill(); ctx.globalAlpha=1;
    ctx.strokeStyle=c; ctx.stroke();
    ctx.globalAlpha=.5;
    const n=8, step=w/(n+1);
    for(let i=1;i<=n;i++) ctx.strokeRect(-w/2 + i*step - step*.26, -h*.34, step*.52, h*.2);
    ctx.beginPath();
    ctx.moveTo(-w*.36,-h/2); ctx.lineTo(-w*.36,h/2);
    ctx.moveTo(w*.36,-h/2); ctx.lineTo(w*.36,h/2);
    ctx.stroke();
    ctx.globalAlpha=1;
  }},
  tractor:{w:360,h:190,name:'Tractor',draw(ctx,w,h,c){
    ctx.strokeStyle=c;
    ctx.beginPath(); ctx.roundRect(-w*.22,-h*.3,w*.5,h*.6,10); // cab + body
    ctx.fillStyle=c; ctx.globalAlpha=.22; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(w*.28,-h*.19,w*.2,h*.38,6); ctx.stroke(); // hood
    ctx.lineWidth=6; // big rear wheels
    ctx.beginPath(); ctx.moveTo(-w*.36,-h*.46); ctx.lineTo(-w*.1,-h*.46); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w*.36,h*.46); ctx.lineTo(-w*.1,h*.46); ctx.stroke();
    ctx.lineWidth=4; // small front wheels
    ctx.beginPath(); ctx.moveTo(w*.3,-h*.4); ctx.lineTo(w*.44,-h*.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w*.3,h*.4); ctx.lineTo(w*.44,h*.4); ctx.stroke();
    ctx.lineWidth=2;
  }},
  bus:{w:1200,h:255,name:'Bus',draw(ctx,w,h,c){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,h*.14);
    ctx.fillStyle=c; ctx.globalAlpha=.22; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=c; ctx.stroke();
    ctx.globalAlpha=.55;
    for(let i=0;i<8;i++){ const x=-w*.38+i*w*.1;
      ctx.beginPath(); ctx.moveTo(x,-h/2); ctx.lineTo(x,-h/2+h*.14); ctx.moveTo(x,h/2); ctx.lineTo(x,h/2-h*.14); ctx.stroke(); }
    ctx.globalAlpha=1;
    ctx.beginPath(); ctx.moveTo(w*.42,-h*.4); ctx.lineTo(w*.42,h*.4); ctx.stroke();
    ctx.lineWidth=4;
    ctx.beginPath(); ctx.moveTo(w*.3,h/2); ctx.lineTo(w*.38,h/2); ctx.moveTo(-w*.15,h/2); ctx.lineTo(-w*.07,h/2); ctx.stroke();
    ctx.lineWidth=2;
  }},
  // ---- set dressing ----
  plant:{w:50,h:50,name:'Plant',round:1,draw(ctx,w,h,c){
    const r=Math.min(w,h)/2;
    ctx.beginPath(); ctx.arc(0,0,r,0,7); ctx.fillStyle=c; ctx.globalAlpha=.25; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=c; ctx.stroke();
    for(let i=0;i<6;i++){ const a=i*Math.PI/3;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.quadraticCurveTo(Math.cos(a+.5)*r*.5,Math.sin(a+.5)*r*.5,Math.cos(a)*r*.85,Math.sin(a)*r*.85); ctx.stroke(); }
  }},
  tree:{w:350,h:350,name:'Tree',round:1,draw(ctx,w,h,c){
    const r=Math.min(w,h)/2;
    ctx.beginPath();
    for(let i=0;i<=14;i++){ const a=i/14*2*Math.PI; const rr=r*(0.92+0.08*Math.sin(i*2.7));
      const x=Math.cos(a)*rr, y=Math.sin(a)*rr; i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
    ctx.closePath();
    ctx.fillStyle=c; ctx.globalAlpha=.16; ctx.fill(); ctx.globalAlpha=.9; ctx.strokeStyle=c; ctx.stroke(); ctx.globalAlpha=1;
    ctx.setLineDash([4,5]);
    ctx.beginPath(); ctx.arc(0,0,r*.5,0,7); ctx.globalAlpha=.45; ctx.stroke(); ctx.globalAlpha=1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(0,0,r*.09,0,7); ctx.fillStyle=c; ctx.fill(); // trunk
  }},
  crate:{w:50,h:50,name:'Apple box',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,3);
    ctx.beginPath(); ctx.moveTo(-w/2,-h/2); ctx.lineTo(w/2,h/2); ctx.moveTo(w/2,-h/2); ctx.lineTo(-w/2,h/2);
    ctx.strokeStyle=c; ctx.globalAlpha=.4; ctx.stroke(); ctx.globalAlpha=1;
  }},
  // ---- bathroom ----
  bath:{w:170,h:75,name:'Bath',draw(ctx,w,h,c){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,10);
    ctx.strokeStyle=c; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-w/2+8,-h/2+8,w-16,h-16,h*.4);
    ctx.fillStyle=c; ctx.globalAlpha=.18; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    ctx.beginPath(); ctx.arc(-w/2+22,0,3.5,0,7); ctx.stroke(); // drain
    ctx.beginPath(); ctx.moveTo(w/2-14,-h*.18); ctx.lineTo(w/2-14,h*.18); ctx.stroke(); // tap
  }},
  shower:{w:90,h:90,name:'Shower',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,4);
    ctx.strokeStyle=c; ctx.globalAlpha=.55;
    ctx.beginPath(); ctx.arc(0,0,5,0,7); ctx.stroke(); // drain
    for(const d of [.3,.45]){ // spray rings
      ctx.beginPath(); ctx.arc(0,0,w*d,0,7); ctx.setLineDash([3,6]); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.globalAlpha=1;
    ctx.lineWidth=2.5; // glass corner
    ctx.beginPath(); ctx.moveTo(-w/2,h/2); ctx.lineTo(-w/2,-h/2); ctx.lineTo(w/2,-h/2); ctx.stroke();
    ctx.lineWidth=2;
  }},
  toilet:{w:42,h:66,name:'Toilet',draw(ctx,w,h,c){
    ctx.strokeStyle=c;
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h*.34,4); ctx.stroke(); // cistern
    ctx.beginPath(); ctx.ellipse(0,h*.16,w*.42,h*.3,0,0,7);
    ctx.fillStyle=c; ctx.globalAlpha=.18; ctx.fill(); ctx.globalAlpha=1; ctx.stroke(); // bowl
  }},
  sink:{w:55,h:42,name:'Sink',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,6);
    ctx.strokeStyle=c;
    ctx.beginPath(); ctx.ellipse(0,h*.06,w*.3,h*.26,0,0,7); ctx.stroke(); // basin
    ctx.beginPath(); ctx.arc(0,-h*.3,2.5,0,7); ctx.stroke(); // tap
  }},
  bin:{w:32,h:32,name:'Bin',round:1,draw(ctx,w,h,c){
    const r=Math.min(w,h)/2*.85;
    ctx.beginPath(); ctx.arc(0,0,r,0,7);
    ctx.fillStyle=c; ctx.globalAlpha=.18; ctx.fill(); ctx.globalAlpha=1;
    ctx.strokeStyle=c; ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,r*.55,0,7); ctx.globalAlpha=.55; ctx.stroke(); ctx.globalAlpha=1;
  }},
  mirror:{w:90,h:12,name:'Mirror',draw(ctx,w,h,c){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,3);
    ctx.fillStyle=c; ctx.globalAlpha=.32; ctx.fill(); ctx.globalAlpha=1;
    ctx.strokeStyle=c; ctx.stroke();
    ctx.globalAlpha=.6; // glints
    ctx.beginPath();
    ctx.moveTo(-w*.32,-h*.1); ctx.lineTo(-w*.12,-h*.1);
    ctx.moveTo(-w*.06,-h*.1); ctx.lineTo(w*.18,-h*.1);
    ctx.stroke(); ctx.globalAlpha=1;
  }},
  books:{w:36,h:26,name:'Books',draw(ctx,w,h,c){
    ctx.strokeStyle=c;
    ctx.beginPath(); ctx.roundRect(-w*.46,-h*.46,w*.86,h*.44,2);
    ctx.fillStyle=c; ctx.globalAlpha=.25; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    ctx.save(); ctx.rotate(rad(-7));
    ctx.beginPath(); ctx.roundRect(-w*.4,0,w*.86,h*.44,2); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha=.5;
    ctx.beginPath(); ctx.moveTo(-w*.3,-h*.24); ctx.lineTo(w*.24,-h*.24); ctx.stroke();
    ctx.globalAlpha=1;
  }},
  newspaper:{w:38,h:28,name:'Newspaper',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,2);
    ctx.strokeStyle=c; ctx.globalAlpha=.6;
    ctx.beginPath(); ctx.moveTo(0,-h/2); ctx.lineTo(0,h/2); ctx.stroke(); // fold
    for(const y2 of [-h*.24, -h*.02, h*.2]){
      ctx.beginPath();
      ctx.moveTo(-w*.4,y2); ctx.lineTo(-w*.08,y2);
      ctx.moveTo(w*.08,y2); ctx.lineTo(w*.4,y2);
      ctx.stroke();
    }
    ctx.globalAlpha=1;
  }},
  toys:{w:55,h:45,name:'Toys',draw(ctx,w,h,c){
    ctx.strokeStyle=c;
    ctx.strokeRect(-w*.4,-h*.34,w*.3,w*.3); // block
    ctx.save(); ctx.rotate(rad(16));
    ctx.strokeRect(-w*.06,-h*.02,w*.26,w*.26); ctx.restore(); // tumbled block
    ctx.beginPath(); ctx.arc(w*.26,-h*.14,w*.15,0,7); // ball
    ctx.fillStyle=c; ctx.globalAlpha=.25; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    ctx.beginPath(); ctx.arc(w*.26,-h*.14,w*.15,rad(200),rad(340)); ctx.stroke();
  }},
  // ---- grip & light ----
  cstand:{w:45,h:45,name:'C-stand light',round:1,draw(ctx,w,h,c){
    const r=Math.min(w,h)/2;
    ctx.strokeStyle=c;
    ctx.beginPath(); ctx.arc(0,0,r*.6,0,7); ctx.fillStyle=c; ctx.globalAlpha=.3; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    for(let i=0;i<3;i++){ const a=-Math.PI/2+i*2*Math.PI/3;
      ctx.beginPath(); ctx.moveTo(Math.cos(a)*r*.6,Math.sin(a)*r*.6); ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r); ctx.stroke(); }
    ctx.globalAlpha=.5;
    ctx.beginPath(); ctx.moveTo(r*.6,-r*.26); ctx.lineTo(r*1.4,-r*.5); ctx.moveTo(r*.6,0); ctx.lineTo(r*1.5,0); ctx.moveTo(r*.6,r*.26); ctx.lineTo(r*1.4,r*.5); ctx.stroke();
    ctx.globalAlpha=1;
  }},
  kino:{w:120,h:35,name:'Kino Flo',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,6);
    ctx.strokeStyle=c; ctx.globalAlpha=.6;
    for(const f of [-.28,-.09,.09,.28]){
      ctx.beginPath(); ctx.moveTo(-w/2+6,h*f); ctx.lineTo(w/2-6,h*f); ctx.stroke(); }
    ctx.globalAlpha=1;
  }},
  ledpanel:{w:65,h:40,name:'LED panel',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,5);
    ctx.fillStyle=c; ctx.globalAlpha=.55;
    for(let i=0;i<4;i++) for(let j=0;j<3;j++)
      ctx.fillRect(-w*.32+i*w*.21-1.5, -h*.26+j*h*.26-1.5, 3, 3);
    ctx.globalAlpha=1;
  }},
  fresnel:{w:45,h:45,name:'Fresnel',round:1,draw(ctx,w,h,c){
    const r=Math.min(w,h)/2*.8;
    ctx.beginPath(); ctx.arc(0,0,r,0,7);
    ctx.fillStyle=c; ctx.globalAlpha=.3; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=c; ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,r*.45,0,7); ctx.globalAlpha=.55; ctx.stroke(); ctx.globalAlpha=1;
    // barn doors toward +x
    ctx.beginPath(); ctx.moveTo(r*.55,-r*.85); ctx.lineTo(r*1.35,-r*.35);
    ctx.moveTo(r*.55,r*.85); ctx.lineTo(r*1.35,r*.35); ctx.stroke();
  }},
  hmi:{w:55,h:55,name:'HMI',round:1,draw(ctx,w,h,c){
    const r=Math.min(w,h)/2*.7;
    ctx.beginPath(); ctx.arc(0,0,r,0,7);
    ctx.fillStyle=c; ctx.globalAlpha=.45; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=c; ctx.stroke();
    ctx.globalAlpha=.6;
    for(let i=0;i<8;i++){ const a=i*Math.PI/4;
      ctx.beginPath(); ctx.moveTo(Math.cos(a)*r*1.1,Math.sin(a)*r*1.1); ctx.lineTo(Math.cos(a)*r*1.4,Math.sin(a)*r*1.4); ctx.stroke(); }
    ctx.globalAlpha=1;
  }},
  tube:{w:115,h:12,name:'Tube light',draw(ctx,w,h,c){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,h/2);
    ctx.fillStyle=c; ctx.globalAlpha=.5; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=c; ctx.stroke();
    ctx.globalAlpha=.25;
    ctx.beginPath(); ctx.roundRect(-w/2-4,-h/2-4,w+8,h+8,(h+8)/2); ctx.stroke();
    ctx.globalAlpha=1;
  }},
  astera:{w:110,h:10,name:'Astera tube',draw(ctx,w,h,c){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,h/2);
    ctx.fillStyle=c; ctx.globalAlpha=.22; ctx.fill(); ctx.globalAlpha=1;
    ctx.strokeStyle=c; ctx.stroke();
    // pixel segments — it's an RGB pixel tube
    ctx.fillStyle=c; ctx.globalAlpha=.6;
    const n = 8, sw = (w - 12)/n;
    for(let i=0;i<n;i++) ctx.fillRect(-w/2 + 6 + i*sw, -h/2 + 2.5, sw - 2, h - 5);
    ctx.globalAlpha=1;
  }},
  tl:{w:130,h:12,name:'TL tube',draw(ctx,w,h,c){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,h/2);
    ctx.fillStyle=c; ctx.globalAlpha=.25; ctx.fill(); ctx.globalAlpha=1;
    ctx.strokeStyle=c; ctx.stroke();
    ctx.fillStyle=c;
    ctx.fillRect(-w/2 + 2, -h/2, 6, h); // end caps
    ctx.fillRect(w/2 - 8, -h/2, 6, h);
    ctx.globalAlpha=.5;
    ctx.beginPath(); ctx.moveTo(-w/2+12,0); ctx.lineTo(w/2-12,0); ctx.stroke();
    ctx.globalAlpha=1;
  }},
  bounce:{w:120,h:15,name:'Bounce board',draw(ctx,w,h,c){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,2);
    ctx.fillStyle='#FFFFFF'; ctx.fill(); ctx.strokeStyle='#B9B6AF'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w*.35,0); ctx.lineTo(w*.35,0);
    ctx.strokeStyle=c; ctx.globalAlpha=.5; ctx.stroke(); ctx.globalAlpha=1;
  }},
  negfill:{w:120,h:15,name:'Neg fill',draw(ctx,w,h,c){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,4);
    ctx.fillStyle='#22211E'; ctx.fill(); ctx.strokeStyle='#22211E'; ctx.stroke();
  }},
  flag:{w:75,h:12,name:'Flag',draw(ctx,w,h,c){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,3); ctx.fillStyle='#3B3A36'; ctx.fill();
    ctx.strokeStyle=c; ctx.stroke();
  }},
  reflector:{w:80,h:12,name:'Reflector',draw(ctx,w,h,c){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,h/2); ctx.fillStyle='#fff'; ctx.fill(); ctx.strokeStyle=c; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w*.3,0); ctx.lineTo(w*.3,0); ctx.globalAlpha=.4; ctx.stroke(); ctx.globalAlpha=1;
  }},
  dolly:{w:300,h:75,name:'Dolly + track',draw(ctx,w,h,c){
    ctx.strokeStyle=c;
    // rails
    ctx.lineWidth=3; ctx.globalAlpha=.8;
    ctx.beginPath(); ctx.moveTo(-w/2,-h*.32); ctx.lineTo(w/2,-h*.32);
    ctx.moveTo(-w/2,h*.32); ctx.lineTo(w/2,h*.32); ctx.stroke();
    // sleepers
    ctx.lineWidth=2; ctx.globalAlpha=.45;
    for(let i=0;i<6;i++){ const x=-w*.42+i*w*.168;
      ctx.beginPath(); ctx.moveTo(x,-h*.42); ctx.lineTo(x,h*.42); ctx.stroke(); }
    ctx.globalAlpha=1;
    // platform
    ctx.beginPath(); ctx.roundRect(-w*.17,-h*.4,w*.34,h*.8,6);
    ctx.fillStyle=c; ctx.globalAlpha=.3; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,h*.13,0,7); ctx.fillStyle=c; ctx.fill();
  }},
  jib:{w:350,h:60,name:'Jib arm',draw(ctx,w,h,c){
    ctx.strokeStyle=c;
    const bx=-w/2+h*.5;
    // base
    ctx.beginPath(); ctx.arc(bx,0,h*.45,0,7);
    ctx.fillStyle=c; ctx.globalAlpha=.25; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    // counterweight
    ctx.beginPath(); ctx.roundRect(-w/2,-h*.2,h*.35,h*.4,3); ctx.fillStyle=c; ctx.fill();
    // arm
    ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(bx,0); ctx.lineTo(w/2-h*.25,0); ctx.stroke();
    ctx.lineWidth=2;
    // head
    ctx.beginPath(); ctx.arc(w/2-h*.22,0,h*.2,0,7); ctx.fillStyle=c; ctx.globalAlpha=.6; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
  }},
  truss:{w:400,h:30,name:'Truss',draw(ctx,w,h,c){
    ctx.strokeStyle=c;
    ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(-w/2,-h/2); ctx.lineTo(w/2,-h/2);
    ctx.moveTo(-w/2,h/2); ctx.lineTo(w/2,h/2); ctx.stroke();
    ctx.lineWidth=1.6;
    const step=Math.max(18, h*1.1);
    ctx.beginPath();
    let up=true;
    for(let x=-w/2; x<w/2-1; x+=step){
      const x2=Math.min(x+step, w/2);
      if(up){ ctx.moveTo(x,h/2); ctx.lineTo(x2,-h/2); }
      else  { ctx.moveTo(x,-h/2); ctx.lineTo(x2,h/2); }
      up=!up;
    }
    ctx.stroke();
    ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(-w/2,-h/2); ctx.lineTo(-w/2,h/2);
    ctx.moveTo(w/2,-h/2); ctx.lineTo(w/2,h/2); ctx.stroke();
  }},
  monitor:{w:55,h:40,name:'Monitor',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,4);
    ctx.beginPath(); ctx.moveTo(-w/2+6,h/2-8); ctx.lineTo(w/2-6,h/2-8); ctx.strokeStyle=c; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,h/2); ctx.lineTo(0,h/2+8); ctx.stroke();
  }},
  // ---- practicals ----
  floorlamp:{w:45,h:45,name:'Floor lamp',round:1,draw:lampDraw},
  tablelamp:{w:30,h:30,name:'Table lamp',round:1,draw:lampDraw},
  pendant:{w:45,h:45,name:'Pendant',round:1,draw(ctx,w,h,c){
    const r=Math.min(w,h)/2*.8;
    ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.arc(0,0,r,0,7); ctx.strokeStyle=c; ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(0,0,r*.2,0,7); ctx.fillStyle=c; ctx.globalAlpha=.7; ctx.fill(); ctx.globalAlpha=1;
  }},
  neon:{w:80,h:18,name:'Neon sign',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,5);
    ctx.beginPath();
    for(let i=0;i<=8;i++){ const x=-w*.36+i*w*.09, y=(i%2? -1:1)*h*.2;
      i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
    ctx.strokeStyle=c; ctx.globalAlpha=.8; ctx.stroke(); ctx.globalAlpha=1;
  }},
  // ---- tech ----
  laptop:{w:35,h:26,name:'Laptop',draw(ctx,w,h,c){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h*.42,2);
    ctx.fillStyle=c; ctx.globalAlpha=.45; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=c; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2+h*.46,w,h*.54,2); ctx.stroke();
    ctx.globalAlpha=.5;
    ctx.beginPath(); ctx.moveTo(-w*.36,h*.12); ctx.lineTo(w*.36,h*.12); ctx.moveTo(-w*.36,h*.26); ctx.lineTo(w*.36,h*.26); ctx.stroke();
    ctx.globalAlpha=1;
  }},
  computer:{w:55,h:50,name:'Computer',draw(ctx,w,h,c){
    ctx.strokeStyle=c;
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w*.7,h*.26,3);
    ctx.fillStyle=c; ctx.globalAlpha=.45; ctx.fill(); ctx.globalAlpha=1; ctx.stroke(); // monitor
    ctx.beginPath(); ctx.roundRect(-w*.36,h*.1,w*.5,h*.3,3); ctx.stroke(); // keyboard
    ctx.beginPath(); ctx.roundRect(w*.28,-h/2,w*.22,h*.6,3);
    ctx.fillStyle=c; ctx.globalAlpha=.3; ctx.fill(); ctx.globalAlpha=1; ctx.stroke(); // tower
  }},
  tablet:{w:20,h:26,name:'Tablet / iPad',draw(ctx,w,h,c){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,3);
    ctx.fillStyle=c; ctx.globalAlpha=.2; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=c; ctx.stroke();
    ctx.beginPath(); ctx.arc(0,-h*.36,1.4,0,7); ctx.fillStyle=c; ctx.fill();
  }},
  tv:{w:110,h:18,name:'TV',draw(ctx,w,h,c){
    // flat screen, top-down: slim slab (screen faces down/front) + center foot
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h*.45,2);
    ctx.fillStyle=c; ctx.globalAlpha=.45; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=c; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-w*.13,h*0,w*.26,h*.45,2); ctx.stroke();
  }},
  cabinet:{w:110,h:50,name:'Cabinet',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,4);
    ctx.strokeStyle=c;
    ctx.beginPath(); ctx.moveTo(-w/6,-h/2); ctx.lineTo(-w/6,h/2);
    ctx.moveTo(w/6,-h/2); ctx.lineTo(w/6,h/2); ctx.stroke();
    ctx.fillStyle=c;
    ctx.beginPath(); ctx.arc(-w/6-5,0,2.2,0,7); ctx.arc(w/6+5,0,2.2,0,7); ctx.fill();
  }},
  bookcase:{w:130,h:34,name:'Bookcase',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,2);
    ctx.strokeStyle=c; ctx.globalAlpha=.6;
    const steps=[7,4,9,5,6,8,4,7,5,9,6,4,8,5,7,6]; // book spines
    let x=-w/2+6;
    for(let i=0; x<w/2-6; i++){
      ctx.beginPath(); ctx.moveTo(x,-h/2+4); ctx.lineTo(x,h/2-4); ctx.stroke();
      x+=steps[i%steps.length];
    }
    ctx.globalAlpha=1;
  }},
  tvunit:{w:160,h:45,name:'TV cabinet',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,3);
    ctx.strokeStyle=c;
    ctx.beginPath(); ctx.moveTo(-w/6,-h/2); ctx.lineTo(-w/6,h/2);
    ctx.moveTo(w/6,-h/2); ctx.lineTo(w/6,h/2); ctx.stroke();
    // open middle shelf with a media box
    ctx.globalAlpha=.55;
    ctx.beginPath(); ctx.roundRect(-w*.09,-h*.16,w*.18,h*.32,2); ctx.stroke();
    ctx.globalAlpha=1;
    ctx.fillStyle=c;
    ctx.beginPath(); ctx.arc(-w/6-6,h*.2,2.2,0,7); ctx.arc(w/6+6,h*.2,2.2,0,7); ctx.fill();
  }},
  stairs:{w:100,h:250,name:'Stairs',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,2);
    ctx.strokeStyle=c; ctx.globalAlpha=.55;
    const steps=Math.max(4, Math.round(h/32));
    for(let i=1;i<steps;i++){ const y=-h/2+i*h/steps;
      ctx.beginPath(); ctx.moveTo(-w/2,y); ctx.lineTo(w/2,y); ctx.stroke(); }
    ctx.globalAlpha=1;
    ctx.beginPath(); ctx.moveTo(0,h*.34); ctx.lineTo(0,-h*.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w*.1,-h*.2); ctx.lineTo(0,-h*.34); ctx.lineTo(w*.1,-h*.2); ctx.stroke();
  }},
  // ---- outdoor ----
  road:{w:1000,h:600,name:'Road',draw(ctx,w,h,c){
    ctx.fillStyle=c; ctx.globalAlpha=.15; ctx.fillRect(-w/2,-h/2,w,h); ctx.globalAlpha=1;
    ctx.strokeStyle=c;
    ctx.beginPath(); ctx.moveTo(-w/2,-h/2); ctx.lineTo(w/2,-h/2); ctx.moveTo(-w/2,h/2); ctx.lineTo(w/2,h/2); ctx.stroke();
    ctx.setLineDash([40,30]);
    ctx.beginPath(); ctx.moveTo(-w/2,0); ctx.lineTo(w/2,0); ctx.globalAlpha=.7; ctx.stroke(); ctx.globalAlpha=1;
    ctx.setLineDash([]);
  }},
  crossing:{w:400,h:300,name:'Ped. crossing',draw(ctx,w,h,c){
    ctx.fillStyle=c; ctx.globalAlpha=.12; ctx.fillRect(-w/2,-h/2,w,h); ctx.globalAlpha=1;
    const n=6, bw=w/(n*2-1);
    for(let i=0;i<n;i++){ const x=-w/2+i*bw*2;
      ctx.beginPath(); ctx.rect(x,-h/2+6,bw,h-12);
      ctx.fillStyle='#FFFFFF'; ctx.fill(); ctx.strokeStyle=c; ctx.globalAlpha=.8; ctx.stroke(); ctx.globalAlpha=1; }
  }},
  bikelane:{w:1000,h:200,name:'Bike lane',draw(ctx,w,h,c){
    ctx.fillStyle=c; ctx.globalAlpha=.14; ctx.fillRect(-w/2,-h/2,w,h); ctx.globalAlpha=1;
    ctx.strokeStyle=c; ctx.setLineDash([26,20]);
    ctx.beginPath(); ctx.moveTo(-w/2,-h/2+4); ctx.lineTo(w/2,-h/2+4); ctx.moveTo(-w/2,h/2-4); ctx.lineTo(w/2,h/2-4); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(-h*.24,h*.14,h*.16,0,7); ctx.moveTo(h*.4,h*.14); ctx.arc(h*.24,h*.14,h*.16,0,7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-h*.24,h*.14); ctx.lineTo(0,-h*.2); ctx.lineTo(h*.24,h*.14); ctx.lineTo(-h*.04,h*.14); ctx.closePath(); ctx.stroke();
  }},
  rails:{w:1000,h:150,name:'Train rails',draw(ctx,w,h,c){
    ctx.strokeStyle=c; ctx.globalAlpha=.5; ctx.lineWidth=3;
    for(let x=-w/2+22;x<w/2-10;x+=55){
      ctx.beginPath(); ctx.moveTo(x,-h/2+6); ctx.lineTo(x,h/2-6); ctx.stroke(); }
    ctx.globalAlpha=1; ctx.lineWidth=3.5;
    ctx.beginPath(); ctx.moveTo(-w/2,-h*.22); ctx.lineTo(w/2,-h*.22); ctx.moveTo(-w/2,h*.22); ctx.lineTo(w/2,h*.22); ctx.stroke();
    ctx.lineWidth=2;
  }},
  // library tile icon for the curve-able dolly track (real object rendered separately)
  track:{w:300,h:90,name:'Dolly track',draw(ctx,w,h,c){
    const q=(t,x0,y0,cx,cy,x1,y1)=>({x:(1-t)*(1-t)*x0+2*(1-t)*t*cx+t*t*x1, y:(1-t)*(1-t)*y0+2*(1-t)*t*cy+t*t*y1});
    ctx.strokeStyle=c; ctx.lineWidth=3; ctx.globalAlpha=.85;
    ctx.beginPath(); ctx.moveTo(-w/2,-h*.1); ctx.quadraticCurveTo(0,-h*.6,w/2,-h*.1);
    ctx.moveTo(-w/2,h*.42); ctx.quadraticCurveTo(0,-h*.08,w/2,h*.42); ctx.stroke();
    ctx.lineWidth=2; ctx.globalAlpha=.45;
    for(let i=0;i<=4;i++){ const t=i/4;
      const a=q(t,-w/2,-h*.1,0,-h*.6,w/2,-h*.1), b=q(t,-w/2,h*.42,0,-h*.08,w/2,h*.42);
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }
    ctx.globalAlpha=1;
  }},
  technocrane:{w:520,h:80,name:'Technocrane',draw(ctx,w,h,c){
    ctx.strokeStyle=c;
    const bx=-w/2+h*.5, hx=w/2-h*.22;
    ctx.beginPath(); ctx.roundRect(bx-h*.45,-h*.45,h*.9,h*.9,6);
    ctx.fillStyle=c; ctx.globalAlpha=.25; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    ctx.fillStyle=c;
    for(const [dx,dy] of [[-.32,-.5],[.32,-.5],[-.32,.5],[.32,.5]]){
      ctx.beginPath(); ctx.arc(bx+dx*h*.9, dy*h*.9, 4, 0, 7); ctx.fill(); }
    ctx.beginPath(); ctx.roundRect(-w/2,-h*.16,h*.3,h*.32,3); ctx.fill();
    for(const [t0,lw] of [[0,6],[.45,4.2],[.75,2.8]]){
      ctx.lineWidth=lw;
      ctx.beginPath(); ctx.moveTo(bx+(hx-bx)*t0,0); ctx.lineTo(hx,0); ctx.stroke();
    }
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(hx,0,h*.16,0,7);
    ctx.globalAlpha=.7; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
  }},
  motorcycle:{w:220,h:80,name:'Motorcycle',draw(ctx,w,h,c){
    ctx.strokeStyle=c;
    ctx.lineWidth=6;
    ctx.beginPath(); ctx.moveTo(-w/2,0); ctx.lineTo(-w*.16,0);
    ctx.moveTo(w*.16,0); ctx.lineTo(w/2,0); ctx.stroke();
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.ellipse(0,0,w*.2,h*.26,0,0,7);
    ctx.fillStyle=c; ctx.globalAlpha=.6; ctx.fill(); ctx.globalAlpha=1;
    ctx.beginPath(); ctx.moveTo(w*.3,-h/2); ctx.lineTo(w*.3,h/2); ctx.stroke();
    ctx.beginPath(); ctx.arc(-w*.1,0,h*.12,0,7); ctx.fill();
  }},
  car_small:{w:360,h:160,name:'Small car',draw(ctx,w,h,c){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,h*.34);
    ctx.fillStyle=c; ctx.globalAlpha=.25; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=c; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-w*.24,-h*.36,w*.52,h*.72,10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w*.32,-h*.32); ctx.lineTo(w*.32,h*.32); ctx.stroke();
  }},
  car_suv:{w:480,h:195,name:'SUV',draw(ctx,w,h,c){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,h*.18);
    ctx.fillStyle=c; ctx.globalAlpha=.25; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=c; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-w*.3,-h*.38,w*.58,h*.76,9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w*.35,-h*.34); ctx.lineTo(w*.35,h*.34); ctx.stroke();
    ctx.globalAlpha=.55;
    ctx.beginPath(); ctx.moveTo(-w*.3,-h*.44); ctx.lineTo(w*.24,-h*.44);
    ctx.moveTo(-w*.3,h*.44); ctx.lineTo(w*.24,h*.44); ctx.stroke();
    ctx.globalAlpha=1;
  }},
  car_police:{w:450,h:180,name:'Police car',draw(ctx,w,h,c){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,h*.3);
    ctx.fillStyle=c; ctx.globalAlpha=.25; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=c; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-w*.18,-h*.36,w*.42,h*.72,10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w*.34,-h*.34); ctx.lineTo(w*.34,h*.34); ctx.stroke();
    ctx.lineWidth=3.5; ctx.globalAlpha=.7;
    ctx.beginPath(); ctx.moveTo(-w*.42,-h*.5); ctx.lineTo(w*.34,-h*.5);
    ctx.moveTo(-w*.42,h*.5); ctx.lineTo(w*.34,h*.5); ctx.stroke();
    ctx.lineWidth=2; ctx.globalAlpha=1;
    ctx.fillStyle='#E8604C'; ctx.fillRect(-w*.02,-h*.2,w*.035,h*.4);
    ctx.fillStyle='#4B6BFB'; ctx.fillRect(-w*.02+w*.035,-h*.2,w*.035,h*.4);
    ctx.strokeStyle=c;
    ctx.beginPath(); ctx.rect(-w*.02,-h*.2,w*.07,h*.4); ctx.stroke();
  }},
  desk:{w:140,h:70,name:'Desk',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,6);
    ctx.strokeStyle=c; ctx.globalAlpha=.5;
    ctx.beginPath(); ctx.roundRect(-w*.42,-h*.34,w*.3,h*.5,4); ctx.stroke(); // drawer block
    ctx.beginPath(); ctx.moveTo(w*.02,h*.5); ctx.lineTo(w*.02,h*.14); ctx.stroke(); // knee space hint
    ctx.globalAlpha=1;
  }},
  smalltable:{w:55,h:55,name:'Small table',round:1,draw(ctx,w,h,c){
    const r=Math.min(w,h)/2;
    ctx.beginPath(); ctx.arc(0,0,r,0,7);
    ctx.fillStyle=c; ctx.globalAlpha=.25; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=c; ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,r*.2,0,7); ctx.globalAlpha=.4; ctx.stroke(); ctx.globalAlpha=1;
  }},
  relaxchair:{w:80,h:95,name:'Relax chair',draw(ctx,w,h,c){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h*.62,10);
    ctx.fillStyle=c; ctx.globalAlpha=.28; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=c; ctx.stroke();
    ctx.fillStyle=c; ctx.globalAlpha=.5;
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h*.2,8); ctx.fill(); // headrest/back
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w*.16,h*.62,8); ctx.fill();
    ctx.beginPath(); ctx.roundRect(w/2-w*.16,-h/2,w*.16,h*.62,8); ctx.fill();
    ctx.globalAlpha=1;
    ctx.beginPath(); ctx.roundRect(-w*.3,h*.2,w*.6,h*.3,7); ctx.globalAlpha=.7; ctx.stroke(); ctx.globalAlpha=1; // ottoman
  }},
  closet:{w:120,h:60,name:'Closet',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,4);
    ctx.strokeStyle=c;
    ctx.beginPath(); ctx.moveTo(0,-h/2); ctx.lineTo(0,h/2); ctx.stroke();
    ctx.globalAlpha=.55; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(-w/2,h/2); ctx.lineTo(-w*.04,h*.95); // door swing hints
    ctx.moveTo(w/2,h/2); ctx.lineTo(w*.04,h*.95); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha=1;
    ctx.fillStyle=c;
    ctx.beginPath(); ctx.arc(-w*.06,h*.3,2.5,0,7); ctx.arc(w*.06,h*.3,2.5,0,7); ctx.fill();
  }},
  kitchen:{w:240,h:65,name:'Kitchen block',draw(ctx,w,h,c){
    kitchenBody(ctx,w,h,c); kitchenFixtures(ctx,'kitchen',w,h,c,.22,.72);
  }},
  kitchen_l:{w:340,h:65,name:'Kitchen block (long)',draw(ctx,w,h,c){
    kitchenBody(ctx,w,h,c); kitchenFixtures(ctx,'kitchen_l',w,h,c,.22,.72);
  }},
  kitchen_corner:{w:240,h:180,name:'Kitchen block (corner)',draw(ctx,w,h,c){
    kitchenCornerBody(ctx,w,h,c); kitchenFixtures(ctx,'kitchen_corner',w,h,c,.2,.78);
  }},
  // ksink / island stayed placeable in v0.34 boards — kept for those, not in the library
  ksink:{w:70,h:62,name:'Kitchen sink',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,4);
    ctx.strokeStyle=c;
    ctx.beginPath(); ctx.roundRect(-w*.32,-h*.28,w*.64,h*.56,5); ctx.stroke();
    ctx.fillStyle=c;
    ctx.beginPath(); ctx.arc(0,-h*.38,2.5,0,7); ctx.fill(); // tap
    ctx.beginPath(); ctx.arc(0,0,2,0,7); ctx.fill();        // drain
  }},
  island:{w:160,h:80,name:'Cooking island',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,6);
    ctx.strokeStyle=c;
    ctx.globalAlpha=.75;
    for(const [dx,dy] of [[-.5,-.5],[.5,-.5],[-.5,.5],[.5,.5]]){
      ctx.beginPath(); ctx.arc(-w*.22+dx*w*.13, dy*h*.3, h*.14, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha=1;
    ctx.beginPath(); ctx.moveTo(w*.05,-h/2); ctx.lineTo(w*.05,h/2);
    ctx.globalAlpha=.35; ctx.stroke(); ctx.globalAlpha=1; // worktop split
  }},
  fridge:{w:70,h:70,name:'Fridge',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,5);
    ctx.strokeStyle=c;
    ctx.beginPath(); ctx.moveTo(-w*.1,-h/2); ctx.lineTo(-w*.1,h/2); ctx.stroke();
    ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(-w*.2,-h/2+5); ctx.lineTo(-w*.2,-h/2+h*.3);
    ctx.moveTo(0,-h/2+5); ctx.lineTo(0,-h/2+h*.3); ctx.stroke();
    ctx.lineWidth=2;
  }},
  camcart:{w:60,h:78,name:'Camera cart',draw(ctx,w,h,c){
    baseRect(ctx,w,h,c,5);
    ctx.strokeStyle=c;
    ctx.beginPath(); ctx.roundRect(-w*.34,-h*.4,w*.68,h*.3,3);
    ctx.fillStyle=c; ctx.globalAlpha=.45; ctx.fill(); ctx.globalAlpha=1; ctx.stroke(); // monitor
    ctx.beginPath(); ctx.moveTo(-w*.36,h*.02); ctx.lineTo(w*.36,h*.02);
    ctx.moveTo(-w*.36,h*.26); ctx.lineTo(w*.36,h*.26); ctx.globalAlpha=.5; ctx.stroke(); ctx.globalAlpha=1; // shelves
    ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(-w*.3,h/2+6); ctx.lineTo(w*.3,h/2+6); ctx.stroke(); ctx.lineWidth=2; // push bar
    ctx.fillStyle=c;
    for(const [dx,dy] of [[-.38,-.42],[.38,-.42],[-.38,.42],[.38,.42]]){
      ctx.beginPath(); ctx.arc(dx*w,dy*h,3,0,7); ctx.fill(); }
  }},
  ceilinglight:{w:35,h:35,name:'Ceiling light',round:1,draw(ctx,w,h,c){
    const r=Math.min(w,h)/2*.8;
    ctx.setLineDash([3,4]);
    ctx.beginPath(); ctx.arc(0,0,r*1.2,0,7); ctx.strokeStyle=c; ctx.globalAlpha=.5; ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha=1;
    ctx.beginPath(); ctx.arc(0,0,r*.7,0,7); ctx.fillStyle=c; ctx.globalAlpha=.45; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r*.7,0); ctx.lineTo(r*.7,0); ctx.moveTo(0,-r*.7); ctx.lineTo(0,r*.7); ctx.stroke();
  }},
  stairs_curved:{w:180,h:180,name:'Curved stairs',draw(ctx,w,h,c){
    // quarter-turn stair: annular sector with radial treads
    const r2=Math.min(w,h)*.95, r1=r2*.42;
    ctx.strokeStyle=c;
    ctx.beginPath();
    ctx.arc(-w/2,-h/2,r1,0,Math.PI/2);
    ctx.arc(-w/2,-h/2,r2,Math.PI/2,0,true);
    ctx.closePath();
    ctx.fillStyle=c; ctx.globalAlpha=.16; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    ctx.globalAlpha=.6;
    for(let i=1;i<7;i++){
      const a=i*Math.PI/14;
      ctx.beginPath();
      ctx.moveTo(-w/2+Math.cos(a)*r1,-h/2+Math.sin(a)*r1);
      ctx.lineTo(-w/2+Math.cos(a)*r2,-h/2+Math.sin(a)*r2);
      ctx.stroke();
    }
    ctx.globalAlpha=1;
    // up arrow along the arc
    const am=Math.PI/4, rm=(r1+r2)/2;
    ctx.beginPath(); ctx.arc(-w/2,-h/2,rm,Math.PI/14,am); ctx.stroke();
    ctx.save(); ctx.translate(-w/2+Math.cos(am)*rm,-h/2+Math.sin(am)*rm); ctx.rotate(am+Math.PI/2);
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-7,-4); ctx.lineTo(-7,4); ctx.closePath();
    ctx.fillStyle=c; ctx.fill(); ctx.restore();
  }},
  custom:{w:70,h:50,name:'Custom',draw(ctx,w,h,c,def){
    const shape = def && def.shape;
    if(shape==='circle'){
      const r=Math.min(w,h)/2;
      ctx.beginPath(); ctx.arc(0,0,r,0,7);
      ctx.fillStyle=c; ctx.globalAlpha=.25; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=c; ctx.stroke();
    } else if(shape==='poly' && def.pts && def.pts.length>2){
      ctx.beginPath();
      def.pts.forEach((p,i)=>{ const x=p.x*w, y=p.y*h; i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
      ctx.closePath();
      ctx.fillStyle=c; ctx.globalAlpha=.25; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=c; ctx.stroke();
    } else baseRect(ctx,w,h,c,6);
  }},
};
PROPS.light = PROPS.cstand; // v1 compat

// ---------------------------------------------------------------- cameras
const CAMS = {
  cam_std:   {w:46, h:30, name:'Camera',        fov:50,  range:320},
  cam_steadi:{w:40, h:46, name:'Steadicam',     fov:55,  range:300},
  cam_gimbal:{w:40, h:40, name:'Gimbal',        fov:65,  range:300},
  cam_gopro: {w:18, h:18, name:'GoPro / crash', fov:122, range:220},
  cam_drone: {w:48, h:48, name:'Drone',         fov:84,  range:380},
};
function drawCameraKind(ctx, kind, w, h, c){
  ctx.strokeStyle = c; ctx.lineWidth = 2;
  if(kind === 'cam_steadi'){
    // operator + vest arm + sled with camera, pointing +x
    ctx.beginPath(); ctx.arc(-w*.18, 0, h*.3, 0, 7);
    ctx.fillStyle=c; ctx.globalAlpha=.4; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w*.18+h*.28, -h*.06);
    ctx.lineTo(w*.02, -h*.28); ctx.lineTo(w*.16, -h*.06); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(w*.1, -h*.16, w*.3, h*.32, 3);
    ctx.fillStyle=c; ctx.globalAlpha=.35; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w*.4, -h*.1); ctx.lineTo(w*.5, 0); ctx.lineTo(w*.4, h*.1); ctx.closePath();
    ctx.fillStyle=c; ctx.fill();
  } else if(kind === 'cam_gimbal'){
    const r = Math.max(w,h)/2;
    ctx.beginPath(); ctx.arc(0,0,r,0,7); ctx.globalAlpha=.7; ctx.stroke(); ctx.globalAlpha=1;
    ctx.beginPath(); ctx.arc(0,0,r,-rad(35),rad(35)); ctx.lineWidth=4; ctx.stroke(); ctx.lineWidth=2;
    ctx.beginPath(); ctx.roundRect(-w*.28,-h*.24,w*.42,h*.48,3);
    ctx.fillStyle=c; ctx.globalAlpha=.35; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w*.14,-h*.14); ctx.lineTo(w*.42,0); ctx.lineTo(w*.14,h*.14); ctx.closePath();
    ctx.fillStyle=c; ctx.fill();
  } else if(kind === 'cam_gopro'){
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,3);
    ctx.fillStyle=c; ctx.globalAlpha=.35; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    ctx.beginPath(); ctx.arc(w*.18,0,Math.min(w,h)*.22,0,7); ctx.fillStyle=c; ctx.fill();
  } else if(kind === 'cam_drone'){
    const r = Math.max(w,h)/2;
    ctx.globalAlpha=.75;
    ctx.beginPath(); ctx.moveTo(-r*.6,-r*.6); ctx.lineTo(r*.6,r*.6); ctx.moveTo(r*.6,-r*.6); ctx.lineTo(-r*.6,r*.6); ctx.stroke();
    ctx.globalAlpha=.55;
    for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
      ctx.beginPath(); ctx.arc(sx*r*.6, sy*r*.6, r*.36, 0, 7); ctx.stroke(); }
    ctx.globalAlpha=1;
    ctx.beginPath(); ctx.roundRect(-w*.2,-h*.16,w*.4,h*.32,4);
    ctx.fillStyle=c; ctx.globalAlpha=.4; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    ctx.beginPath(); ctx.arc(w*.24,0,3,0,7); ctx.fillStyle=c; ctx.fill();
  } else { // cam_std (also v1 'camera')
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w*.72,h,5);
    ctx.fillStyle=c; ctx.globalAlpha=.3; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w/2+w*.72,-h*.28); ctx.lineTo(w/2,-h*.14); ctx.lineTo(w/2,h*.14); ctx.lineTo(-w/2+w*.72,h*.28); ctx.closePath();
    ctx.fillStyle=c; ctx.fill();
    ctx.beginPath(); ctx.arc(-w*.22,-h/2-4,5,0,7); ctx.arc(-w*.02,-h/2-4,5,0,7); ctx.globalAlpha=.6; ctx.stroke(); ctx.globalAlpha=1;
  }
}
const ACTORS = {
  actor:       {w:34, h:34, name:'Actor'},
  actor_ant:   {w:34, h:34, name:'Actor 2'},
  actor_extra: {w:26, h:26, name:'Extra'},
  actor_child: {w:24, h:24, name:'Child'},
  animal_dog:  {w:80, h:34, name:'Dog'},
  animal_cat:  {w:50, h:22, name:'Cat'},
  animal_horse:{w:220,h:70, name:'Horse'},
  animal_custom:{w:90,h:42, name:'Animal'},
};
function drawActorIcon(ctx,w,h,c,kind){
  kind = kind || 'actor';
  if(kind.startsWith('animal')){
    // top-down animal: body + head + facing wedge, all pointing +x
    ctx.fillStyle=c; ctx.strokeStyle=c;
    ctx.beginPath(); ctx.ellipse(-w*0.08, 0, w*0.32, h*0.42, 0, 0, 7);
    ctx.globalAlpha=.8; ctx.fill(); ctx.globalAlpha=1;
    const hr = h*0.34 + w*0.02;
    if(kind==='animal_horse'){ // neck
      ctx.beginPath(); ctx.moveTo(w*.16,-h*.2); ctx.lineTo(w*.34,-hr*.6); ctx.lineTo(w*.34,hr*.6); ctx.lineTo(w*.16,h*.2); ctx.closePath();
      ctx.globalAlpha=.8; ctx.fill(); ctx.globalAlpha=1;
    }
    ctx.beginPath(); ctx.arc(w*0.34, 0, hr, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(w*.34+hr*.4, -hr*.5); ctx.lineTo(w*.34+hr*1.4, 0); ctx.lineTo(w*.34+hr*.4, hr*.5); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 2;
    if(kind==='animal_dog' || kind==='animal_cat'){ // ears
      ctx.beginPath(); ctx.moveTo(w*.28,-hr*.8); ctx.lineTo(w*.31,-hr*1.5);
      ctx.moveTo(w*.28,hr*.8); ctx.lineTo(w*.31,hr*1.5); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-w*.38, 0); // tail
    if(kind==='animal_cat') ctx.quadraticCurveTo(-w*.5, -h*.7, -w*.44, -h*1.1);
    else if(kind==='animal_horse') ctx.lineTo(-w*.5, h*.1);
    else ctx.quadraticCurveTo(-w*.48, -h*.3, -w*.52, -h*.15);
    ctx.stroke();
    if(kind==='animal_custom'){
      ctx.setLineDash([3,3]); ctx.globalAlpha=.5;
      ctx.beginPath(); ctx.ellipse(0,0,w*.5,h*.62,0,0,7); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha=1;
    }
    return;
  }
  const r=Math.min(w,h)/2;
  if(kind==='actor_ant'){ // second actor variant: round with a dash
    ctx.beginPath(); ctx.arc(0,0,r,0,7);
    ctx.fillStyle=c; ctx.globalAlpha=.85; ctx.fill(); ctx.globalAlpha=1;
    ctx.beginPath(); ctx.moveTo(r*.55,-r*.5); ctx.lineTo(r*1.35,0); ctx.lineTo(r*.55,r*.5); ctx.closePath();
    ctx.fillStyle=c; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,r*.45,0,7); ctx.fillStyle='rgba(255,255,255,.85)'; ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.95)'; ctx.lineWidth=Math.max(2.5, r*.18); ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-r*.62,r*.62); ctx.lineTo(r*.28,-r*.28); ctx.stroke();
    return;
  }
  if(kind==='actor_extra'){ // hollow ring = extra / background
    ctx.beginPath(); ctx.arc(0,0,r*.9,0,7);
    ctx.fillStyle=c; ctx.globalAlpha=.22; ctx.fill(); ctx.globalAlpha=1;
    ctx.strokeStyle=c; ctx.lineWidth=2.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r*.5,-r*.4); ctx.lineTo(r*1.25,0); ctx.lineTo(r*.5,r*.4); ctx.closePath();
    ctx.fillStyle=c; ctx.globalAlpha=.6; ctx.fill(); ctx.globalAlpha=1;
    return;
  }
  // protagonist / child: filled circle with white core
  ctx.beginPath(); ctx.arc(0,0,r,0,7);
  ctx.fillStyle=c; ctx.globalAlpha=.85; ctx.fill(); ctx.globalAlpha=1;
  ctx.beginPath(); ctx.moveTo(r*.55,-r*.5); ctx.lineTo(r*1.35,0); ctx.lineTo(r*.55,r*.5); ctx.closePath();
  ctx.fillStyle=c; ctx.fill();
  ctx.beginPath(); ctx.arc(0,0,r*.45,0,7); ctx.fillStyle='rgba(255,255,255,.85)'; ctx.fill();
}
function drawNoteShape(ctx,o,editing){
  const w=o.w, h=o.h;
  ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,4);
  ctx.fillStyle='#FFFDF2'; ctx.fill();
  ctx.fillStyle=o.color; ctx.globalAlpha=.16; ctx.fill(); ctx.globalAlpha=1;
  ctx.strokeStyle=o.color; ctx.globalAlpha=.55; ctx.lineWidth=1.5; ctx.stroke(); ctx.globalAlpha=1;
  // folded corner
  const f=Math.min(16,w*.2,h*.2);
  ctx.beginPath(); ctx.moveTo(w/2-f,h/2); ctx.lineTo(w/2,h/2-f); ctx.lineTo(w/2,h/2); ctx.closePath();
  ctx.fillStyle=o.color; ctx.globalAlpha=.25; ctx.fill(); ctx.globalAlpha=1;
  if(!editing){
    const fs = o.fontSize || 13, lh = fs*1.32, pad = 11, maxW = w - pad*2;
    ctx.textBaseline='top';
    ctx.save();
    ctx.beginPath(); ctx.rect(-w/2+3,-h/2+3,w-6,h-6); ctx.clip();
    let y = -h/2 + pad;
    if(o.label){
      ctx.font = `700 ${fs+1}px -apple-system,Segoe UI,sans-serif`;
      ctx.fillStyle = '#3E3A2C';
      ctx.fillText(o.label, -w/2+pad, y);
      y += lh + 4;
      ctx.strokeStyle = o.color; ctx.globalAlpha = .3; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-w/2+pad, y-3); ctx.lineTo(w/2-pad, y-3); ctx.stroke();
      ctx.globalAlpha = 1;
      y += 2;
    }
    ctx.font = noteFont(o);
    ctx.fillStyle = '#4A4636';
    const lines = wrapCanvasText(ctx, o.text||'', maxW);
    for(const l of lines){
      if(y >= h/2 - 6) break;
      ctx.fillText(l, -w/2+pad, y);
      y += lh;
    }
    if(!o.text && !o.label){
      ctx.fillStyle='rgba(74,70,54,.4)';
      ctx.fillText('Double-click to type…', -w/2+pad, -h/2+pad);
    }
    ctx.restore();
  }
  ctx.textBaseline='alphabetic';
}
// live scene-info card drawn on the canvas (contents come from the Scene info panel)
function drawInfoCard(ctx, o){
  const s = (typeof drawShot !== 'undefined' && drawShot) ? drawShot : activeShot();
  const w=o.w, h=o.h, pad=14, titleH=26;
  // shared smart-card chrome: white shell + tinted title strip
  ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,3);
  ctx.fillStyle='#fff'; ctx.fill();
  ctx.strokeStyle='#D8D5CF'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,3); ctx.clip();
  ctx.fillStyle=o.color; ctx.globalAlpha=.14;
  ctx.fillRect(-w/2,-h/2,w,titleH);
  ctx.globalAlpha=1;
  ctx.textBaseline='middle';
  ctx.font='700 11px -apple-system,Segoe UI,sans-serif';
  ctx.fillStyle='#33322E';
  ctx.fillText('SCENE INFO', -w/2+10, -h/2+titleH/2+.5);
  ctx.textBaseline='top';
  let y=-h/2+titleH+10;
  ctx.font='700 14px -apple-system,Segoe UI,sans-serif';
  ctx.fillStyle='#33322E';
  ctx.fillText(trimText(ctx, s.name||'', w-pad*2), -w/2+pad, y); y+=22;
  const wrapT = (typeof addMinutes==='function') ? addMinutes(s.time, s.duration) : '';
  const rows=[
    ['SCENE', [s.scene, s.sceneDesc].filter(Boolean).join(' — ')],
    ['DATE', s.date||''],
    ['TIME', s.time ? s.time+(wrapT?'–'+wrapT:'')+(s.duration?'  ('+(typeof fmtDur==='function'?fmtDur(s.duration):s.duration+' min')+')':'') : ''],
    ['WEATHER', (s.weather && s.weather!=='Any') ? s.weather : ''],
  ].filter(r=>r[1]);
  for(const [k,v] of rows){
    if(y>h/2-16) break;
    ctx.font='700 9.5px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle='#8A877F';
    ctx.fillText(k, -w/2+pad, y); y+=13;
    ctx.font='12.5px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle='#33322E';
    for(const l of wrapCanvasText(ctx, v, w-pad*2).slice(0,2)){
      if(y>h/2-12) break;
      ctx.fillText(l, -w/2+pad, y); y+=16;
    }
    y+=4;
  }
  // the scene's script (the panel's script box) — as much as fits; the card
  // resizes, so pull it taller to read more
  if(s.script && y < h/2-30){
    ctx.font='700 9.5px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle='#8A877F';
    ctx.fillText('SCRIPT', -w/2+pad, y); y+=13;
    ctx.font='11.5px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle='#4A4636';
    const lines = wrapCanvasText(ctx, s.script, w-pad*2);
    for(let li=0; li<lines.length; li++){
      if(y > h/2-26 && li < lines.length-1){
        ctx.fillStyle='#B9B6AE';
        ctx.fillText('… (pull the card taller)', -w/2+pad, y);
        break;
      }
      ctx.fillText(lines[li], -w/2+pad, y); y+=14.5;
    }
  }
  if(!rows.length && !s.script){
    ctx.font='12px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle='#8A877F';
    ctx.fillText('Fill in the Scene info panel →', -w/2+pad, y);
  }
  ctx.restore();
  ctx.textBaseline='alphabetic';
}
function wrapCanvasText(ctx, text, maxW){
  const out=[];
  for(const para of String(text).split('\n')){
    let line='';
    for(const word of para.split(' ')){
      const t = line ? line+' '+word : word;
      if(ctx.measureText(t).width > maxW && line){ out.push(line); line=word; }
      else line=t;
    }
    out.push(line);
  }
  return out;
}

// ---------------------------------------------------------------- library catalog
const CATS = [
  {name:'Cameras', open:true, items:[
    {cat:'camera', kind:'cam_std'}, {cat:'camera', kind:'cam_steadi'}, {cat:'camera', kind:'cam_gimbal'},
    {cat:'camera', kind:'cam_gopro'}, {cat:'camera', kind:'cam_drone'},
  ]},
  {name:'Cast', open:true, items:[
    'actor','actor_ant','actor_extra','actor_child','animal_dog','animal_cat','animal_horse','animal_custom'
  ].map(k=>({cat:'actor', kind:k}))},
  {name:'Grip & light', open:true, items:[
    'cstand','kino','ledpanel','fresnel','hmi','tube','astera','bounce','negfill','flag','reflector','track','jib','technocrane','truss','monitor','camcart'
  ].map(k=>({cat:'prop', kind:k}))},
  {name:'Practicals', open:false, items:['floorlamp','tablelamp','pendant','ceilinglight','tl','neon'].map(k=>({cat:'prop', kind:k}))},
  {name:'Furniture', open:true, items:['chair','armchair','relaxchair','table','smalltable','desk','sofa','bed','bed_single','bed_hospital','wheelchair','closet','tvunit','cabinet','bookcase','kitchen','fridge','rug','stairs'].map(k=>({cat:'prop', kind:k}))},
  {name:'Bathroom', open:false, items:['bath','shower','toilet','sink','mirror'].map(k=>({cat:'prop', kind:k}))},
  {name:'Vehicles', open:false, items:['bicycle','motorcycle','car_small','car','car_suv','car_police','minivan','bus','train','tractor'].map(k=>({cat:'prop', kind:k}))},
  {name:'Outdoor', open:false, items:['road','crossing','bikelane','rails'].map(k=>({cat:'prop', kind:k}))},
  {name:'Set dressing', open:false, items:['plant','tree','crate','mirror','books','newspaper','toys','bin'].map(k=>({cat:'prop', kind:k}))},
  {name:'Tech', open:false, items:['tv','laptop','computer','tablet'].map(k=>({cat:'prop', kind:k}))},
];

// ---------------------------------------------------------------- light beams
// Directional throw per light kind — like a camera's FOV, but quieter.
// axis: beam direction in the prop's local space (spots face +x like camera
// FOV / fresnel barn doors; panels emit from their long face, so +y).
// omni: practicals just glow in a circle. Per-object overrides: o.beamSpread /
// o.beamRange (set by dragging the amber beam handles), o.beam === false hides.
const BEAM_TINT = '255,206,64'; // yellowish stage light
const LIGHT_BEAMS = {
  fresnel:      {spread:34,  range:330, axis:0,           tint:BEAM_TINT},
  hmi:          {spread:38,  range:400, axis:0,           tint:BEAM_TINT},
  kino:         {spread:85,  range:210, axis:Math.PI/2,   tint:BEAM_TINT},
  ledpanel:     {spread:78,  range:240, axis:Math.PI/2,   tint:BEAM_TINT},
  tube:         {spread:110, range:150, axis:Math.PI/2,   tint:BEAM_TINT},
  neon:         {spread:115, range:120, axis:Math.PI/2,   tint:'255,122,217'},
  astera:       {spread:120, range:170, axis:Math.PI/2,   tint:'186,120,255'}, // RGB pixel tube — gel it!
  floorlamp:    {omni:90,  tint:BEAM_TINT},
  tablelamp:    {omni:70,  tint:BEAM_TINT},
  pendant:      {omni:95,  tint:BEAM_TINT},
  ceilinglight: {omni:110, tint:BEAM_TINT},
  tl:           {omni:130, tint:'223,235,255'}, // fluorescent — cool white by default
};
// '#rrggbb' → 'r,g,b' (the beam gradients want raw components)
function hexRgb(h){
  const n = parseInt(String(h).replace('#',''), 16);
  return ((n>>16)&255) + ',' + ((n>>8)&255) + ',' + (n&255);
}
// color temperature → 'r,g,b' (Tanner Helland approximation, 1000–12000K)
function kelvinRgb(k){
  k = clamp(k, 1000, 12000) / 100;
  let r, g, b;
  if(k <= 66){
    r = 255;
    g = clamp(99.47 * Math.log(k) - 161.12, 0, 255);
  } else {
    r = clamp(329.7 * Math.pow(k - 60, -0.1332), 0, 255);
    g = clamp(288.12 * Math.pow(k - 60, -0.0755), 0, 255);
  }
  if(k >= 66) b = 255;
  else if(k <= 19) b = 0;
  else b = clamp(138.52 * Math.log(k - 10) - 305.04, 0, 255);
  return [r, g, b].map(Math.round).join(',');
}
// a light's effective beam tint: gel (color) × kelvin (white balance);
// neither set → the kind's default tint. Returns {tint:'r,g,b', a:alpha}.
function beamTintFor(o, beam){
  if(o.gel){
    let rgb = hexRgb(o.gel).split(',').map(Number);
    if(o.kelvin != null){
      const kw = kelvinRgb(o.kelvin).split(',').map(Number);
      rgb = rgb.map((v, i)=>Math.round(v * kw[i] / 255));
    }
    return {tint: rgb.join(','), a: .32};
  }
  if(o.kelvin != null) return {tint: kelvinRgb(o.kelvin), a: .3};
  return {tint: beam.tint, a: .26};
}

// ---------------------------------------------------------------- list cards
// Live filtered views of the production People registry — one registry,
// many windows. Column keys map straight onto person fields.
const LIST_CARDS = {
  crew:  {title:'CREW', tag:'crew', color:'#4B6BFB', cols:[
    {key:'role',  label:'Role',  min:74},
    {key:'name',  label:'Name',  min:96},
    {key:'call',  label:'Call',  min:48},
    {key:'phone', label:'Phone', min:104},
    {key:'email', label:'Email', min:130},
  ]},
  cast:  {title:'CAST', tag:'cast', color:'#E8934C', cols:[
    {key:'name',  label:'Name',  min:96},
    {key:'role',  label:'Part',  min:80},
    {key:'call',  label:'Call',  min:48},
    {key:'phone', label:'Phone', min:104},
    {key:'email', label:'Email', min:130},
  ]},
  client:{title:'CLIENT', tag:'client', color:'#3E9B6E', cols:[
    {key:'name',  label:'Name',  min:96},
    {key:'role',  label:'Role',  min:80},
    {key:'phone', label:'Phone', min:104},
    {key:'email', label:'Email', min:130},
  ]},
};
// shared card geometry (renderer, hit-testing and the cell editor all agree)
const LIST_GEO = {titleH:26, headH:22, rowH:26, grip:14};

// ---------------------------------------------------------------- field cards
// label:value cards. prodinfo reads/writes project.production (+ shootName);
// location binds to one entry in production.locations via o.locId — cards are
// windows onto production data, not copies of it.
const FIELD_CARDS = {
  prodinfo: {title:'PRODUCTION', color:'#4B6BFB', rows:[
    {key:'name',    label:'Production', ph:'Production name'},
    {key:'company', label:'Company',    ph:'Company'},
    {key:'address', label:'Address',    ph:'Street, city'},
    {key:'email',   label:'Email',      ph:'production@…'},
    {key:'phone',   label:'Phone',      ph:'+31 6 …'},
  ]},
  location: {title:'LOCATION', color:'#3E9B6E', rows:[
    {key:'name',     label:'Name',     ph:'Location name'},
    {key:'street',   label:'Street',   ph:'Street + number'},
    {key:'town',     label:'Town',     ph:'Town / city'},
    {key:'country',  label:'Country',  ph:'Country'},
    {key:'parking',  label:'Parking',  ph:'Where to park'},
    {key:'power',    label:'Power',    ph:'Available power'},
    {key:'hospital', label:'Hospital', ph:'Nearest hospital'},
    {key:'notes',    label:'Notes',    ph:'Access, keys, quirks…'},
  ]},
};

// wind for film crews: km/h → Beaufort
function toBft(kmh){
  const t = [1, 5, 11, 19, 28, 38, 49, 61, 74, 88, 102, 117];
  let b = 0;
  while(b < t.length && kmh >= t[b]) b++;
  return b;
}
// tiny time helpers shared by the day planner, schedule card and call sheet
function toMinutes(hhmm){
  const m = /^(\d{1,2})[:.](\d{2})$/.exec((hhmm || '').trim());
  return m ? (+m[1])*60 + (+m[2]) : null;
}
function minToHHMM(m){
  m = ((m % 1440) + 1440) % 1440;
  return String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m % 60).padStart(2,'0');
}
const FIELD_GEO = {titleH:26, rowH:26};

// ---------------------------------------------------------------- AV script card
// Row-based AV script: TIME | AUDIO (what you hear) | VIDEO (what you see),
// with optional scene-number, still and director-notes columns. The classic
// free-text two-column AV block grown into the smart-card system.
const AVS = {titleH:26, headH:22, rowPad:7, lineH:15, minRowH:36, grip:14, stillH:52,
  w:{no:44, time:64, still:96, audio:215, video:255, notes:170}};
function avCols(o){
  const c = o.cols || {};
  const out = [];
  if(c.no) out.push(['no','SC', AVS.w.no]);
  out.push(['time','TIME', AVS.w.time]);
  if(c.still) out.push(['still','STILL', AVS.w.still]);
  out.push(['audio','AUDIO — HEAR', AVS.w.audio]);
  out.push(['video','VIDEO — SEE', AVS.w.video]);
  if(c.notes) out.push(['notes','NOTES', AVS.w.notes]);
  return out;
}

// ---------------------------------------------------------------- day header
// geometry of the call-time block (renderer + hit zones + editor agree)
const DAYH = {w:320, titleH:26, bigH:58, rowH:30};
// NOAA-style sunrise/sunset, ±2 min — local time via the browser's timezone.
function sunTimes(dateStr, lat, lon){
  const d = new Date(dateStr + 'T12:00:00');
  if(isNaN(d) || lat === undefined || lat === null) return null;
  const R = Math.PI/180;
  const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
  const calc = rising=>{
    const lngH = lon/15;
    const t = doy + ((rising ? 6 : 18) - lngH)/24;
    const M = 0.9856*t - 3.289;
    let L = M + 1.916*Math.sin(M*R) + 0.020*Math.sin(2*M*R) + 282.634;
    L = ((L % 360) + 360) % 360;
    let RA = Math.atan(0.91764*Math.tan(L*R))/R;
    RA = ((RA % 360) + 360) % 360;
    RA += Math.floor(L/90)*90 - Math.floor(RA/90)*90;
    RA /= 15;
    const sinDec = 0.39782*Math.sin(L*R);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833*R) - sinDec*Math.sin(lat*R)) / (cosDec*Math.cos(lat*R));
    if(cosH > 1 || cosH < -1) return null; // polar day / night
    let H = rising ? 360 - Math.acos(cosH)/R : Math.acos(cosH)/R;
    const T = H/15 + RA - 0.06571*t - 6.622;
    const UT = ((T - lngH) % 24 + 24) % 24;
    const loc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, Math.round(UT*3600)));
    return String(loc.getHours()).padStart(2,'0') + ':' + String(loc.getMinutes()).padStart(2,'0');
  };
  return {rise: calc(true), set: calc(false)};
}

// Checklist 2.0 — named templates, picked when the tile drops
const CHECKLIST_TEMPLATES = {
  'Camera dept':  ['Batteries charged','Media cards formatted','Lenses & filters packed',
                   'Monitor + cables','Tripod / head','Backup offload drive'],
  'Grip & light': ['Stands & sandbags','Flags / negative fill','Gels & diffusion',
                   'Extension cables / distro','Practicals checked','Generator fueled'],
  'Location':     ['Permit confirmed','Parking arranged','Power available','Toilets',
                   'Neighbours informed','Hospital route known'],
  'Wrap':         ['Media backed up twice','Release forms signed','Location swept & restored',
                   'Rental returns booked','Batteries on chargers','Crew thanked'],
};
