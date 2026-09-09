// FLOOR — 00-icons.js
// Library tile glyphs (Floorboard). A tile is a filled rounded square in the
// item's hue with a bold WHITE glyph — like an app icon, not a technical
// top-down drawing. Kinds without a glyph fall back to their canvas drawing
// on a soft tint (tileCanvas in 04-ui). Every glyph draws in a 44×44 space
// with the origin in the centre; keep shapes inside ±15.
'use strict';
const TILE_GLYPH = (()=>{
  const g = {};
  const W = '#FFFFFF';
  const prep = (tc, lw)=>{ tc.strokeStyle = W; tc.fillStyle = W; tc.lineWidth = lw || 2.4; tc.lineCap = 'round'; tc.lineJoin = 'round'; };
  const rr = (tc, x, y, w, h, r)=>{ tc.beginPath(); tc.roundRect(x, y, w, h, r); };
  const circ = (tc, x, y, r)=>{ tc.beginPath(); tc.arc(x, y, r, 0, Math.PI*2); };
  const poly = (tc, pts, close)=>{ tc.beginPath(); pts.forEach((p, i)=> i ? tc.lineTo(p[0], p[1]) : tc.moveTo(p[0], p[1])); if(close) tc.closePath(); };
  const person = (tc, hx, hy, hr, bw, bh, filled)=>{
    circ(tc, hx, hy, hr); filled ? tc.fill() : tc.stroke();
    rr(tc, hx - bw/2, hy + hr + 2, bw, bh, bw/2.2); filled ? tc.fill() : tc.stroke();
  };

  // ---- cameras (side view, unmistakably a camera) ----
  g.cam_std = tc=>{ prep(tc); rr(tc,-13,-6,18,13,3); tc.fill(); poly(tc,[[5,-3],[13,-7],[13,7],[5,3]],true); tc.fill(); rr(tc,-9,-11,8,5,2); tc.fill(); };
  g.cam_steadi = tc=>{ prep(tc); rr(tc,-8,-13,14,9,2); tc.fill(); poly(tc,[[-1,-4],[-1,9]]); tc.stroke(); poly(tc,[[-8,9],[6,9]]); tc.stroke(); circ(tc,-1,13,2.2); tc.fill(); };
  g.cam_gimbal = tc=>{ prep(tc); rr(tc,-7,-9,14,9,2); tc.fill(); tc.beginPath(); tc.arc(0,-4.5,12,Math.PI*.15,Math.PI*.85); tc.stroke(); poly(tc,[[0,7.5],[0,14]]); tc.stroke(); };
  g.cam_gopro = tc=>{ prep(tc,2.6); rr(tc,-12,-10,24,20,5); tc.stroke(); circ(tc,4,0,5); tc.stroke(); circ(tc,4,0,1.6); tc.fill(); circ(tc,-6,-4.5,1.8); tc.fill(); };
  g.cam_drone = tc=>{ prep(tc,2.2); poly(tc,[[-9,-8],[9,8]]); tc.stroke(); poly(tc,[[9,-8],[-9,8]]); tc.stroke(); for(const [x,y] of [[-11,-10],[11,-10],[-11,10],[11,10]]){ circ(tc,x,y,3.6); tc.stroke(); } circ(tc,0,0,4.2); tc.fill(); };

  // ---- cast ----
  g.actor = tc=>{ prep(tc); person(tc,0,-6,5.2,20,11,true); };
  g.actor_ant = tc=>{ prep(tc); person(tc,0,-6,5.2,20,11,true); tc.fillStyle='rgba(0,0,0,.28)'; circ(tc,0,-6,5.2); tc.fill(); tc.fillStyle=W; circ(tc,0,-6,3); tc.fill(); };
  g.actor_extra = tc=>{ prep(tc,2.4); person(tc,0,-6,5.2,20,11,false); };
  g.actor_child = tc=>{ prep(tc); person(tc,0,-3,4.2,15,9,true); };
  g.animal_dog = tc=>{ prep(tc); tc.beginPath(); tc.ellipse(-3,1,9,5.5,0,0,7); tc.fill(); circ(tc,8.5,-1,4.4); tc.fill(); poly(tc,[[6,-5],[5,-10],[9.5,-5]],true); tc.fill(); poly(tc,[[-12,0],[-16,-6]]); tc.stroke(); };
  g.animal_cat = tc=>{ prep(tc); tc.beginPath(); tc.ellipse(-3,2,8,4.6,0,0,7); tc.fill(); circ(tc,8,-1,4); tc.fill(); poly(tc,[[5,-4],[5.5,-9],[8.5,-5]],true); tc.fill(); poly(tc,[[8,-9],[10.8,-5],[11.5,-4]],true); tc.fill(); poly(tc,[[-11,2],[-15,-2],[-14,-8]]); tc.stroke(); };
  g.animal_horse = tc=>{ prep(tc); tc.beginPath(); tc.ellipse(-4,3,10,5.5,0,0,7); tc.fill(); poly(tc,[[4,0],[9,-9],[13,-8],[13,-4],[9,-1]],true); tc.fill(); poly(tc,[[-13,3],[-16,10]]); tc.stroke(); };
  g.animal_custom = tc=>{ prep(tc); for(const [x,y] of [[-6,-6],[-2,-9],[3,-9],[7,-6]]){ circ(tc,x,y,2.6); tc.fill(); } tc.beginPath(); tc.ellipse(0.5,3,6.5,5.5,0,0,7); tc.fill(); };

  // ---- grip & light ----
  const rays = (tc, r0, r1, n)=>{ for(let i=0;i<n;i++){ const a=i*Math.PI*2/n; poly(tc,[[Math.cos(a)*r0,Math.sin(a)*r0],[Math.cos(a)*r1,Math.sin(a)*r1]]); tc.stroke(); } };
  g.cstand = tc=>{ prep(tc,2.2); circ(tc,0,0,5.5); tc.fill(); rays(tc,9,13,8); };
  g.kino = tc=>{ prep(tc,2.2); rr(tc,-13,-9,26,18,3); tc.stroke(); for(const y of [-4.5,0,4.5]){ poly(tc,[[-9,y],[9,y]]); tc.stroke(); } };
  g.ledpanel = tc=>{ prep(tc,2.2); rr(tc,-13,-9,26,18,3); tc.stroke(); for(const x of [-7,0,7]) for(const y of [-3.5,3.5]){ circ(tc,x,y,1.7); tc.fill(); } };
  g.fresnel = tc=>{ prep(tc,2.2); circ(tc,0,0,11); tc.stroke(); circ(tc,0,0,6); tc.stroke(); circ(tc,0,0,1.8); tc.fill(); };
  g.hmi = tc=>{ prep(tc,2.6); rays(tc,4,13,8); circ(tc,0,0,3.6); tc.fill(); };
  g.tube = tc=>{ prep(tc); rr(tc,-14,-3.6,28,7.2,3.6); tc.fill(); };
  g.astera = tc=>{ prep(tc); rr(tc,-14,-3.6,28,7.2,3.6); tc.fill(); tc.fillStyle='rgba(0,0,0,.25)'; for(const x of [-5,4]){ rr(tc,x,-3.6,1.6,7.2,0); tc.fill(); } };
  g.bounce = tc=>{ prep(tc); rr(tc,-12,-9,24,18,2); tc.fill(); };
  g.negfill = tc=>{ prep(tc,2.2); rr(tc,-12,-9,24,18,2); tc.stroke(); tc.fillStyle='rgba(0,0,0,.45)'; rr(tc,-12,-9,24,18,2); tc.fill(); };
  g.flag = tc=>{ prep(tc,2.4); poly(tc,[[-9,-13],[-9,13]]); tc.stroke(); poly(tc,[[-9,-12],[11,-7],[-9,-2]],true); tc.fill(); };
  g.reflector = tc=>{ prep(tc,2.4); circ(tc,0,0,11); tc.stroke(); poly(tc,[[-6,6],[6,-6]]); tc.stroke(); poly(tc,[[-1,8],[8,-1]]); tc.stroke(); };
  g.track = tc=>{ prep(tc,2.4); poly(tc,[[-13,-5],[13,-5]]); tc.stroke(); poly(tc,[[-13,5],[13,5]]); tc.stroke(); for(const x of [-8,0,8]){ poly(tc,[[x,-9],[x,9]]); tc.stroke(); } };
  g.dollycart = tc=>{ prep(tc); rr(tc,-11,-8,22,11,2); tc.fill(); circ(tc,-6,8,3.2); tc.fill(); circ(tc,6,8,3.2); tc.fill(); };
  g.jib = tc=>{ prep(tc,3); poly(tc,[[-11,10],[9,-8]]); tc.stroke(); rr(tc,-15,9,10,4,2); tc.fill(); rr(tc,7,-13,8,6,1.5); tc.fill(); };
  g.technocrane = tc=>{ prep(tc,3); poly(tc,[[-13,11],[-2,2],[11,-9]]); tc.stroke(); rr(tc,-16,10,9,4,2); tc.fill(); rr(tc,9,-14,7,5,1.5); tc.fill(); };
  g.truss = tc=>{ prep(tc,2); rr(tc,-14,-6,28,12,1); tc.stroke(); poly(tc,[[-14,-6],[-7,6],[0,-6],[7,6],[14,-6]]); tc.stroke(); };
  g.monitor = tc=>{ prep(tc,2.4); rr(tc,-13,-10,26,17,3); tc.stroke(); poly(tc,[[0,7],[0,12]]); tc.stroke(); poly(tc,[[-6,12],[6,12]]); tc.stroke(); };
  g.camcart = tc=>{ prep(tc,2.2); rr(tc,-9,-12,18,10,2); tc.stroke(); rr(tc,-11,0,22,7,2); tc.fill(); circ(tc,-6,11,2.8); tc.fill(); circ(tc,6,11,2.8); tc.fill(); };
  g.hazer = tc=>{ prep(tc); circ(tc,-5,1,6); tc.fill(); circ(tc,3,-2,7); tc.fill(); circ(tc,9,3,5); tc.fill(); rr(tc,-11,3,22,6,3); tc.fill(); };

  // ---- board tools: each its own shape ----
  g.text = tc=>{ prep(tc); tc.font='800 17px -apple-system,Segoe UI,sans-serif'; tc.textAlign='center'; tc.textBaseline='middle'; tc.fillText('Aa',0,1); };
  g.line = tc=>{ prep(tc,2.8); poly(tc,[[-11,10],[10,-10]]); tc.stroke(); poly(tc,[[1,-10],[10,-10],[10,-1]]); tc.stroke(); };
  g.dim = tc=>{ prep(tc,2.2); rr(tc,-14,-5,28,10,2); tc.stroke(); for(const x of [-8,-3,2,7]){ poly(tc,[[x,-5],[x,x%2?0:-1]]); tc.stroke(); } };
  g.subboard = tc=>{ prep(tc,2.4); rr(tc,-13,-9,18,14,3); tc.stroke(); rr(tc,-5,-2,18,14,3); tc.fill(); };
  g.link = tc=>{ prep(tc,2.8); tc.beginPath(); tc.ellipse(-4,4,7,4.2,-Math.PI/4,0,7); tc.stroke(); tc.beginPath(); tc.ellipse(4,-4,7,4.2,-Math.PI/4,0,7); tc.stroke(); };
  g.infocard = tc=>{ prep(tc,2.2); rr(tc,-13,-10,26,20,3); tc.stroke(); rr(tc,-13,-10,26,6,3); tc.fill(); for(const y of [1,6]){ poly(tc,[[-8,y],[8,y]]); tc.stroke(); } };
  g.colcard = tc=>{ prep(tc,2.2); rr(tc,-9,-13,18,26,3); tc.stroke(); rr(tc,-9,-13,18,7,3); tc.fill(); for(const y of [-1,4,9]){ poly(tc,[[-5,y],[5,y]]); tc.stroke(); } };
  g.note = tc=>{ prep(tc); poly(tc,[[-11,-11],[11,-11],[11,4],[4,11],[-11,11]],true); tc.fill(); tc.fillStyle='rgba(0,0,0,.22)'; poly(tc,[[11,4],[4,4],[4,11]],true); tc.fill(); };
  g.todo = tc=>{ prep(tc,2.4); for(const [y,done] of [[-7,true],[4,false]]){ rr(tc,-12,y-4.5,9,9,2); tc.stroke(); if(done){ poly(tc,[[-10,y],[-8.5,y+2.5],[-5,y-3]]); tc.stroke(); } poly(tc,[[1,y],[12,y]]); tc.stroke(); } };
  g.table = tc=>{ prep(tc,2.2); rr(tc,-13,-9,26,18,2); tc.stroke(); poly(tc,[[-13,-3],[13,-3]]); tc.stroke(); poly(tc,[[-13,3],[13,3]]); tc.stroke(); poly(tc,[[-4,-9],[-4,9]]); tc.stroke(); poly(tc,[[5,-9],[5,9]]); tc.stroke(); };
  g.colorcard = tc=>{ prep(tc); tc.globalAlpha=.55; circ(tc,-5,-3,7); tc.fill(); circ(tc,5,-3,7); tc.fill(); circ(tc,0,5,7); tc.fill(); tc.globalAlpha=1; };
  g.audio = tc=>{ prep(tc,2.8); [-10,-5,0,5,10].forEach((x,i)=>{ const h=[5,11,15,9,6][i]; poly(tc,[[x,-h/2],[x,h/2]]); tc.stroke(); }); };
  g.file = tc=>{ prep(tc); poly(tc,[[-13,-9],[-4,-9],[-1,-6],[13,-6],[13,10],[-13,10]],true); tc.fill(); };
  g.image = tc=>{ prep(tc,2.2); rr(tc,-13,-10,26,20,3); tc.stroke(); circ(tc,-6,-4,2.4); tc.fill(); poly(tc,[[-12,8],[-3,-1],[2,4],[6,0],[12,7]]); tc.stroke(); };
  g.script = tc=>{ prep(tc,2.2); poly(tc,[[-10,-13],[5,-13],[10,-8],[10,13],[-10,13]],true); tc.stroke(); for(const y of [-4,1,6]){ poly(tc,[[-6,y],[6,y]]); tc.stroke(); } };
  g.sbrow = tc=>{ prep(tc); rr(tc,-14,-8,28,16,2); tc.fill(); tc.fillStyle='rgba(0,0,0,.28)'; for(const x of [-11,-5,1,7]){ rr(tc,x,-7,3,2.5,.5); tc.fill(); rr(tc,x,4.5,3,2.5,.5); tc.fill(); } rr(tc,-9,-3,18,6,1); tc.fill(); };
  g.avscript = tc=>{ prep(tc,2.2); rr(tc,-13,-11,26,22,3); tc.stroke(); poly(tc,[[0,-11],[0,11]]); tc.stroke(); for(const y of [-5,0,5]){ poly(tc,[[-9,y],[-4,y]]); tc.stroke(); poly(tc,[[4,y],[9,y]]); tc.stroke(); } };
  g.dayheader = tc=>{ prep(tc,2.2); rr(tc,-12,-9,24,20,3); tc.stroke(); rr(tc,-12,-9,24,6,3); tc.fill(); poly(tc,[[-6,-13],[-6,-7]]); tc.stroke(); poly(tc,[[6,-13],[6,-7]]); tc.stroke(); circ(tc,-4,3,1.6); tc.fill(); circ(tc,2,3,1.6); tc.fill(); };
  g.callsheet = tc=>{ prep(tc,2.2); rr(tc,-10,-10,20,22,3); tc.stroke(); rr(tc,-5,-13,10,5,2); tc.fill(); for(const y of [-2,3,8]){ poly(tc,[[-5,y],[5,y]]); tc.stroke(); } };
  g.schedule = tc=>{ prep(tc,2.4); circ(tc,0,0,12); tc.stroke(); poly(tc,[[0,-7],[0,0],[6,3]]); tc.stroke(); };
  g.proplist = tc=>{ prep(tc); poly(tc,[[-13,-8],[1,-8],[13,4],[3,14],[-13,-2]],true); tc.fill(); tc.fillStyle='rgba(0,0,0,.3)'; circ(tc,-7,-3,2.2); tc.fill(); };
  g.gearlist = tc=>{ prep(tc,2.2); rr(tc,-13,-4,26,15,3); tc.fill(); poly(tc,[[-5,-4],[-5,-9],[5,-9],[5,-4]]); tc.stroke(); };
  g.weather = tc=>{ prep(tc); circ(tc,4,-5,6); tc.fill(); tc.fillStyle='rgba(0,0,0,.22)'; circ(tc,4,-5,6); tc.fill(); tc.fillStyle=W; circ(tc,-5,4,6); tc.fill(); circ(tc,3,2,7); tc.fill(); rr(tc,-11,4,24,6,3); tc.fill(); };
  g.listcard = tc=>{ prep(tc); person(tc,-5,-5,4,13,8,true); person(tc,6,-3,3.4,11,7,true); };
  g.crew = g.cast = g.contacts = g.listcard;
  g.fieldcard = tc=>{ prep(tc,2.2); rr(tc,-13,-10,26,20,3); tc.stroke(); for(const y of [-4,1,6]){ poly(tc,[[-9,y],[-4,y]]); tc.stroke(); poly(tc,[[-1,y],[9,y]]); tc.stroke(); } };
  g.prodinfo = g.location = g.fieldcard;
  return g;
})();
// hue per board tool (object types share TYPE_COLOR; these are the tool tiles)
const TILE_COLOR = {text:'#7A8194', line:'#E58A6F', dim:'#7A8194', subboard:'#A98BE0', link:'#6FA3E8',
  infocard:'#6FA3E8', colcard:'#6FA3E8', note:'#E1B46A', todo:'#9BA85A', table:'#7A8194',
  colorcard:'#E58A6F', audio:'#A98BE0', file:'#7A8194', image:'#6DBBAF', script:'#6FA3E8',
  sbrow:'#A98BE0', avscript:'#A98BE0', dayheader:'#E58A6F', callsheet:'#6FA3E8', schedule:'#6DBBAF',
  proplist:'#9BA85A', gearlist:'#E1B46A', weather:'#6FA3E8', listcard:'#6DBBAF', crew:'#6DBBAF',
  cast:'#E58A6F', contacts:'#6DBBAF', fieldcard:'#7A8194', prodinfo:'#7A8194', location:'#9BA85A'};
