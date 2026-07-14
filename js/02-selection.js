// FLOOR — 02-selection.js
// Extracted from the original single-file build. All files share global scope
// (loaded as classic scripts, in order). True ES modules come with the build step later.
'use strict';
// ---------------------------------------------------------------- handles & selection
const H_R = 6;
function handleList(){
  if(!sel) return [];
  const shot = activeShot();
  const hs = [];
  const s = view.scale;
  if(sel.type === 'sun'){
    const su = shot.sun;
    if(su && su.on){
      const nA = northAngle(su);
      const v = sunVec(su.hour, nA);
      hs.push({id:'sunH', x:su.x + v.x*52, y:su.y + v.y*52});
      hs.push({id:'sunN', x:su.x + Math.cos(nA)*60, y:su.y + Math.sin(nA)*60});
    }
    return hs;
  }
  if(sel.type === 'object'){
    const o = shot.objects.find(x=>x.id===sel.id); if(!o) return [];
    if(o.locked) return hs;
    if(o.cat === 'line'){
      hs.push({id:'l1', x:o.p1.x, y:o.p1.y});
      hs.push({id:'l2', x:o.p2.x, y:o.p2.y});
      const m = o.mid || {x:(o.p1.x+o.p2.x)/2, y:(o.p1.y+o.p2.y)/2};
      hs.push({id:'lm', x:m.x, y:m.y});
      return hs;
    }
    if(['ink','listcard','fieldcard','dayheader','avscript'].includes(o.cat)) return hs; // self-sizing — no resize/rotate
    if(o.cat === 'callsheet' || o.cat === 'schedule' || o.cat === 'proplist'){
      // width-only handle: give the cells more room (height stays automatic)
      hs.push({id:'cardW', x:o.x + o.w/2 + 10/s, y:o.y});
      return hs;
    }
    if(o.cat === 'table'){
      // spreadsheet-style: drag the corner to add/remove rows and columns
      hs.push({id:'tgrow', x:o.x + o.w/2 + 10/s, y:o.y + o.h/2 + 10/s});
      return hs;
    }
    if(o.kind === 'track'){
      (o.pts||[]).forEach((p,i)=> hs.push({id:'tp'+i, x:p.x, y:p.y}));
      return hs;
    }
    const rx = o.x + Math.cos(o.rot - Math.PI/2)*(o.h/2 + 26/s);
    const ry = o.y + Math.sin(o.rot - Math.PI/2)*(o.h/2 + 26/s);
    // on the free boards only photos rotate; the shot designer keeps rotation everywhere
    if(!(BOARD_TABS.has(activeTab) && o.cat !== 'image'))
      hs.push({id:'rotate', x:rx, y:ry});
    const c = Math.cos(o.rot), sn = Math.sin(o.rot);
    const lx = o.w/2 + 8/s, ly = o.h/2 + 8/s;
    hs.push({id:'resize', x:o.x + lx*c - ly*sn, y:o.y + lx*sn + ly*c});
    if(o.cat === 'camera'){
      for(const sgn of [-1,1]){
        const a = o.rot + sgn*rad(o.fov/2);
        hs.push({id:'fov'+(sgn<0?'A':'B'), x:o.x+Math.cos(a)*o.range, y:o.y+Math.sin(a)*o.range});
      }
    }
    // directional lights: amber handles on the beam edges (drag = spread + throw)
    if(o.cat === 'prop' && LIGHT_BEAMS[o.kind] && !LIGHT_BEAMS[o.kind].omni && o.beam !== false){
      const b = LIGHT_BEAMS[o.kind];
      const ax = o.rot + (b.axis || 0);
      const sp = o.beamSpread || b.spread, rg = o.beamRange || b.range;
      for(const sgn of [-1,1]){
        const a = ax + sgn*rad(sp/2);
        hs.push({id:'beam'+(sgn<0?'A':'B'), x:o.x+Math.cos(a)*rg, y:o.y+Math.sin(a)*rg});
      }
    }
    if(isCrane(o)){
      const hp = jibHeadPos(o);
      hs.push({id:'jibHead', x:hp.x, y:hp.y});
    }
    // per-point keyframe handles
    if(o.path && isCrane(o)){
      o.path.forEach((p,i)=>{
        hs.push({id:'pt'+i, x:p.x, y:p.y}); // base position
        const len = p.len ?? armLen(o), pr = p.rot ?? o.rot;
        hs.push({id:'ch'+i, x:p.x + Math.cos(pr)*len, y:p.y + Math.sin(pr)*len}); // arm head
      });
      return hs;
    }
    if(o.path) o.path.forEach((p,i)=>{
      hs.push({id:'pt'+i, x:p.x, y:p.y});
      const pr = prot(o,i);
      hs.push({id:'pr'+i, x:p.x + Math.cos(pr - Math.PI/2)*(o.h/2 + 26/s),
                          y:p.y + Math.sin(pr - Math.PI/2)*(o.h/2 + 26/s)});
      if(o.cat === 'camera'){
        const pf = p.fov ?? o.fov, prg = p.range ?? o.range;
        for(const sgn of [-1,1]){
          const a = pr + sgn*rad(pf/2);
          hs.push({id:'pf'+(sgn<0?'A':'B')+i, x:p.x+Math.cos(a)*prg, y:p.y+Math.sin(a)*prg});
        }
      }
    });
  } else if(sel.type === 'wall'){
    const w = shot.walls.find(x=>x.id===sel.id); if(!w || w.locked) return hs;
    hs.push({id:'w1', x:w.x1, y:w.y1});
    hs.push({id:'w2', x:w.x2, y:w.y2});
    // bend handle: drag to bow the wall, drop near the chord center to straighten
    const m = w.mid || {x:(w.x1+w.x2)/2, y:(w.y1+w.y2)/2};
    hs.push({id:'wm', x:m.x, y:m.y});
  }
  return hs;
}
function handleColor(id){
  if(id.startsWith('beam')) return '#E2A93B';
  if(id === 'rotate' || id.startsWith('pr') || id === 'sunH' || id === 'sunN') return '#E2A93B';
  if(id.startsWith('fov') || id.startsWith('pf') || id === 'jibHead' || id.startsWith('ch')) return '#8B5CF6';
  return '#4B6BFB';
}
function drawSelection(shot){
  if(!sel) return;
  const s = view.scale;
  ctx.save();
  if(sel.type === 'multi'){
    ctx.strokeStyle = '#4B6BFB'; ctx.lineWidth = 1.4/s; ctx.setLineDash([5/s,4/s]);
    for(const id of sel.ids){
      const o = shot.objects.find(x=>x.id===id);
      if(!o) continue;
      ctx.save(); ctx.translate(o.x,o.y); ctx.rotate(o.rot||0);
      ctx.strokeRect(-(o.w||20)/2-6/s, -(o.h||20)/2-6/s, (o.w||20)+12/s, (o.h||20)+12/s);
      ctx.restore();
    }
    ctx.setLineDash([]);
    // walls in the group glow like a single selected wall
    ctx.lineWidth = 3/s; ctx.globalAlpha = .8;
    for(const id of (sel.wallIds || [])){
      const w = shot.walls.find(x=>x.id===id);
      if(!w) continue;
      const smp = wallSamples(w);
      ctx.beginPath();
      smp.forEach((p,i)=> i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }
  if(sel.type === 'object'){
    const o = shot.objects.find(x=>x.id===sel.id);
    if(o && o.kind === 'track'){
      // glow along the centerline
      const smp = samplePath(o.pts, false, 14);
      ctx.strokeStyle = '#4B6BFB'; ctx.lineWidth = 1.6/s; ctx.globalAlpha=.7; ctx.setLineDash([6/s,5/s]);
      ctx.beginPath();
      smp.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha=1;
    } else if(o){
      ctx.save(); ctx.translate(o.x,o.y); ctx.rotate(o.rot);
      ctx.strokeStyle = '#4B6BFB'; ctx.lineWidth = 1.4/s; ctx.setLineDash([5/s,4/s]);
      ctx.strokeRect(-o.w/2-6/s, -o.h/2-6/s, o.w+12/s, o.h+12/s);
      ctx.setLineDash([]);
      if(!o.locked){
        ctx.beginPath(); ctx.moveTo(0,-o.h/2-6/s); ctx.lineTo(0,-o.h/2-26/s); ctx.globalAlpha=.5; ctx.stroke(); ctx.globalAlpha=1;
      } else {
        ctx.font = `${13/s}px -apple-system,Segoe UI,sans-serif`;
        ctx.fillStyle = '#8A877F';
        ctx.fillText('\ud83d\udd12', -o.w/2-4/s, -o.h/2-10/s);
      }
      ctx.restore();
    }
  } else if(sel.type === 'wall'){
    const w = shot.walls.find(x=>x.id===sel.id);
    if(w){
      const smp = wallSamples(w);
      ctx.strokeStyle = '#4B6BFB'; ctx.lineWidth = 3/s; ctx.globalAlpha = .8;
      ctx.beginPath();
      smp.forEach((p,i)=> i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
      ctx.stroke(); ctx.globalAlpha=1;
      // quiet length readout: arc length, floated a little off the midpoint
      const geom = wallGeom(w);
      const pc = wallPointAt(geom, geom.L/2);
      const L = Math.round(geom.L);
      const txt = L >= 100 ? (L/100).toFixed(2).replace(/\.?0+$/,'') + ' m' : L + ' cm';
      const ox = -Math.sin(pc.ang) * 16/s, oy = Math.cos(pc.ang) * 16/s;
      ctx.font = `600 ${11/Math.max(s,.35)}px -apple-system,Segoe UI,sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(75,107,251,.75)';
      ctx.fillText(txt, pc.x + ox, pc.y + oy);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
  } else if(sel.type === 'opening'){
    const w = shot.walls.find(x=>x.id===sel.wallId);
    const op = w && w.openings[sel.index];
    if(op){
      const geom = wallGeom(w);
      const pc = wallPointAt(geom, op.t*geom.L);
      const cx = pc.x, cy = pc.y;
      ctx.strokeStyle = '#4B6BFB'; ctx.lineWidth = 1.6/s;
      ctx.beginPath(); ctx.arc(cx, cy, (op.w/2)+8/s, 0, 7); ctx.setLineDash([5/s,4/s]); ctx.stroke(); ctx.setLineDash([]);
    }
  } else if(sel.type === 'sun'){
    const su = shot.sun;
    if(su && su.on){
      ctx.strokeStyle = '#4B6BFB'; ctx.lineWidth = 1.6/s; ctx.setLineDash([5/s,4/s]);
      ctx.beginPath(); ctx.arc(su.x, su.y, 30, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      // orbit hint for the hour handle
      ctx.globalAlpha=.35;
      ctx.beginPath(); ctx.arc(su.x, su.y, 52, 0, 7); ctx.setLineDash([3/s,5/s]); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha=1;
    }
  }
  for(const hd of handleList()){
    ctx.beginPath(); ctx.arc(hd.x, hd.y, H_R/s, 0, 7);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 2/s;
    ctx.strokeStyle = handleColor(hd.id);
    ctx.stroke();
  }
  ctx.restore();
}

function drawToolPreview(){
  const s = view.scale;
  if(drag && drag.kind === 'drawWall'){
    ctx.save();
    ctx.strokeStyle = WALL_COLOR; ctx.globalAlpha = .55; ctx.lineWidth = 11; ctx.lineCap='butt';
    ctx.beginPath(); ctx.moveTo(drag.x1, drag.y1); ctx.lineTo(drag.x2, drag.y2); ctx.stroke();
    ctx.globalAlpha=1;
    const L = Math.round(dist(drag.x1,drag.y1,drag.x2,drag.y2));
    ctx.font = `${12/s}px -apple-system,sans-serif`;
    ctx.fillStyle = '#33322E';
    ctx.fillText((L>=100 ? (L/100).toFixed(2).replace(/\.?0+$/,'')+' m' : L+' cm'), (drag.x1+drag.x2)/2 + 10/s, (drag.y1+drag.y2)/2 - 10/s);
    ctx.restore();
  }
  if(drag && drag.kind === 'drawRoom'){
    ctx.save();
    ctx.strokeStyle = WALL_COLOR; ctx.globalAlpha=.55; ctx.lineWidth = 11;
    ctx.strokeRect(Math.min(drag.x1,drag.x2), Math.min(drag.y1,drag.y2), Math.abs(drag.x2-drag.x1), Math.abs(drag.y2-drag.y1));
    ctx.restore();
  }
  if((tool==='door'||tool==='window'||tool==='gap') && hoverWall){
    const {wall, t} = hoverWall;
    const geom = wallGeom(wall);
    const pc = wallPointAt(geom, t*geom.L);
    const cx = pc.x, cy = pc.y;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx,cy, 10/s, 0, 7);
    ctx.fillStyle = 'rgba(75,107,251,.25)'; ctx.fill();
    ctx.strokeStyle = '#4B6BFB'; ctx.lineWidth = 1.6/s; ctx.stroke();
    ctx.restore();
  }
  if(drag && drag.kind === 'marquee'){
    ctx.save();
    ctx.strokeStyle = '#4B6BFB'; ctx.lineWidth = 1.6/s; ctx.setLineDash([6/s,5/s]);
    ctx.strokeRect(Math.min(drag.x1,drag.x2), Math.min(drag.y1,drag.y2),
                   Math.abs(drag.x2-drag.x1), Math.abs(drag.y2-drag.y1));
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(75,107,251,.05)';
    ctx.fillRect(Math.min(drag.x1,drag.x2), Math.min(drag.y1,drag.y2),
                 Math.abs(drag.x2-drag.x1), Math.abs(drag.y2-drag.y1));
    ctx.restore();
  }
  if(drag && drag.kind === 'crop'){
    ctx.save();
    ctx.strokeStyle = '#4B6BFB'; ctx.lineWidth = 1.8/s; ctx.setLineDash([7/s,5/s]);
    ctx.strokeRect(Math.min(drag.x1,drag.x2), Math.min(drag.y1,drag.y2),
                   Math.abs(drag.x2-drag.x1), Math.abs(drag.y2-drag.y1));
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(75,107,251,.06)';
    ctx.fillRect(Math.min(drag.x1,drag.x2), Math.min(drag.y1,drag.y2),
                 Math.abs(drag.x2-drag.x1), Math.abs(drag.y2-drag.y1));
    ctx.restore();
  }
  if(drag && drag.kind === 'ink' && drag.pts.length > 1){
    ctx.save();
    ctx.strokeStyle = inkColor; ctx.lineWidth = inkWeight;
    ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath();
    ctx.moveTo(drag.pts[0].x, drag.pts[0].y);
    for(let i=1;i<drag.pts.length;i++) ctx.lineTo(drag.pts[i].x, drag.pts[i].y);
    ctx.stroke();
    ctx.restore();
  }
  if(tool==='poly' && polyDraw){
    ctx.save();
    ctx.strokeStyle = '#4B6BFB'; ctx.fillStyle = '#4B6BFB';
    ctx.lineWidth = 1.8/s;
    if(polyDraw.pts.length){
      ctx.globalAlpha=.9;
      ctx.beginPath();
      polyDraw.pts.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
      if(polyDraw.mouse) ctx.lineTo(polyDraw.mouse.x, polyDraw.mouse.y);
      ctx.stroke();
      // close hint
      if(polyDraw.pts.length>2){
        ctx.setLineDash([4/s,4/s]); ctx.globalAlpha=.45;
        ctx.beginPath();
        const a=polyDraw.mouse||polyDraw.pts[polyDraw.pts.length-1];
        ctx.moveTo(a.x,a.y); ctx.lineTo(polyDraw.pts[0].x, polyDraw.pts[0].y);
        ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha=1;
      }
      for(const p of polyDraw.pts){
        ctx.beginPath(); ctx.arc(p.x,p.y,4/s,0,7); ctx.fill();
      }
    }
    ctx.restore();
  }
}
