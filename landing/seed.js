// Landing-page renders: builds the example production "Licht" in the running
// app and uploads crisp PNGs of every floor to /landing/img via the dev server.
// Run from the browser console (local test build only): await buildLanding()
window.buildLanding = async function(){
  const log = [];
  const up = async (name, blob)=>{ const r = await fetch('/upload?name=landing/img/' + name, {method:'POST', body:blob}); log.push(name + ' ' + (await r.text())); };
  const cvBlob = c => new Promise(r=>c.toBlob(r, 'image/png'));
  const W = (x1,y1,x2,y2,ops)=>({id:uid(),x1,y1,x2,y2,openings:(ops||[]).map(o=>({id:uid(),t:o.t,w:o.w,type:o.type,flip:!!o.flip})),locked:false});
  const P = (kind,x,y,rot,label)=>({id:uid(),cat:'prop',kind,x,y,rot:rot||0,w:PROPS[kind].w,h:PROPS[kind].h,color:GEAR_KINDS.has(kind)?PAL.sand:PAL.slate,label:label||'',path:[]});
  const A = (kind,x,y,rot,label)=>({id:uid(),cat:'actor',kind,x,y,rot:rot||0,w:ACTORS[kind].w,h:ACTORS[kind].h,color:PAL.coral,label,path:[]});
  const C = (kind,x,y,rot,o)=>Object.assign({id:uid(),cat:'camera',kind,x,y,rot:rot||0,w:CAMS[kind].w,h:CAMS[kind].h,fov:CAMS[kind].fov,range:CAMS[kind].range,lens:null,color:PAL.sky,label:'',path:[]}, o||{});

  // ---------------------------------------------------------------- production
  project.shootName = 'Licht — Van Gogh brand film';
  normalizeProduction();
  const PR = project.production;
  PR.company = 'Zoutwater Films'; PR.email = 'info@zoutwater.com'; PR.phone = '+31 20 555 0134';
  PR.brand = {accent:'#4B6BFB', style:'band', footer:'Zoutwater Films · Amsterdam · KvK 12345678'};

  // ---------------------------------------------------------------- scenes
  project.scenes = [];
  const s1 = newShot(1); s1.scene = '1'; s1.sceneDesc = 'INT. ATELIER — DAY'; s1.name = 'Atelier'; s1.duration = 90; s1.date = '2026-10-06'; s1.time = '08:30';
  s1.script = 'A north-facing atelier, early light. VINCENT (38) stands at the easel, brush poised. THEO watches from the doorway.\n\nTHEO\nYou haven\'t slept.\n\nVINCENT\nThe light doesn\'t wait for anyone.';
  s1.walls = [W(0,0,700,0,[{t:.28,w:150,type:'window'},{t:.72,w:150,type:'window'}]), W(700,0,700,500,[{t:.5,w:90,type:'door',flip:true}]), W(700,500,0,500), W(0,500,0,0,[{t:.5,w:120,type:'window'}])];
  s1.shots = [{id:'s1a',name:'1A'},{id:'s1b',name:'1B'},{id:'s1c',name:'1C'}];
  s1.objects = [
    P('rug',380,300,0), P('table',420,300,0.08,'Worktable'), P('chair',330,240,-0.5), P('chair',515,245,0.6), P('cabinet',70,400,0), P('plant',655,55,0), P('bookcase',400,42,0),
    A('actor',290,180,0.7,'Vincent'), A('actor_ant',690,250,Math.PI,'Theo'),
    C('cam_std',150,340,-0.55,{lens:24,fov:74,framing:'Wide',support:'Tripod',shotId:'s1a'}),
    C('cam_gimbal',520,430,-2.15,{lens:85,fov:24,framing:'Close-up',support:'Gimbal',shotId:'s1b',path:[{x:400,y:450,rot:-1.95},{x:270,y:420,rot:-1.55}]}),
    P('ledpanel',110,95,0.85), P('fresnel',630,470,-2.35), P('bounce',260,470,0), P('cstand',600,95,2.4),
  ];
  s1.sun = {on:true, x:830, y:40, hour:10};
  const s2 = newShot(2); s2.scene = '2'; s2.sceneDesc = 'EXT. WHEAT FIELD — GOLDEN HOUR'; s2.name = 'Wheat field'; s2.duration = 60; s2.date = '2026-10-06'; s2.time = '17:30';
  s2.script = 'Wind through the wheat. VINCENT walks the path towards camera, the sun low behind him. A drone rises over the field.';
  s2.shots = [{id:'s2a',name:'2A'},{id:'s2b',name:'2B'}];
  s2.objects = [
    P('tree',80,80,0), P('tree',720,60,0.3), P('tree',760,420,0), P('car',120,480,0.2,'Crew van'),
    A('actor',400,300,-1.57,'Vincent'),
    Object.assign(P('track',400,470,0),{pts:[{x:220,y:470},{x:580,y:470}]}),
    C('cam_std',400,470,-1.57,{lens:35,fov:54,framing:'Full shot',support:'Dolly',shotId:'s2a',path:[{x:300,y:470,rot:-1.57},{x:520,y:470,rot:-1.57}]}),
    C('cam_drone',560,140,2.2,{lens:24,fov:84,framing:'Extreme wide',support:'Drone',shotId:'s2b'}),
    P('hmi',640,300,2.9), P('reflector',300,220,0.6),
  ];
  s2.sun = {on:true, x:60, y:300, hour:18};
  const s3 = newShot(3); s3.scene = '3'; s3.sceneDesc = 'INT. CAFÉ — NIGHT'; s3.name = 'Café'; s3.duration = 120; s3.date = '2026-10-07'; s3.time = '19:00';
  s3.script = 'A small café, warm tungsten, rain on the windows. Four friends at the corner table; VINCENT sketches on a napkin.';
  s3.walls = [W(0,0,900,0,[{t:.2,w:180,type:'window'},{t:.6,w:180,type:'window'}]), W(900,0,900,600), W(900,600,0,600,[{t:.85,w:100,type:'door'}]), W(0,600,0,0)];
  s3.shots = [{id:'s3a',name:'3A'},{id:'s3b',name:'3B'}];
  s3.objects = [
    P('island',650,120,0,'Bar'), P('smalltable',200,200,0), P('smalltable',200,420,0), P('smalltable',450,420,0), P('smalltable',450,200,0),
    P('chair',140,200,1.57), P('chair',260,200,-1.57), P('chair',140,420,1.57), P('chair',260,420,-1.57), P('chair',390,420,1.57), P('chair',510,420,-1.57), P('chair',450,140,0), P('chair',450,260,Math.PI),
    P('pendant',200,200,0), P('pendant',450,200,0), P('pendant',200,420,0), P('pendant',450,420,0),
    A('actor',150,420,0,'Vincent'), A('actor_ant',250,420,Math.PI,'Theo'), A('actor_extra',390,420,0,'Agostina'), A('actor_extra',510,420,Math.PI,'Paul'),
    C('cam_steadi',330,560,-1.9,{lens:35,fov:54,framing:'Two-shot',support:'Steadicam',shotId:'s3a'}),
    C('cam_std',780,480,-2.6,{lens:50,fov:40,framing:'Medium',support:'Tripod',shotId:'s3b'}),
    P('tube',60,300,1.57), P('tube',860,330,1.57), P('negfill',600,540,0),
  ];
  for(const s of [s1,s2,s3]){ migrateShot(s); project.scenes.push(s); }
  project.activeSceneId = s1.id;

  // ---------------------------------------------------------------- moodboard (painterly colour fields as references)
  project.moodboard = null; ensureMoodboard();
  const mb = project.moodboard; mb.objects = [];
  const paint = (w,h,cols,seed)=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d'); const g=x.createLinearGradient(0,0,w,h); cols.forEach((col,i)=>g.addColorStop(i/(cols.length-1),col)); x.fillStyle=g; x.fillRect(0,0,w,h); let r=seed; const rnd=()=>{ r=(r*9301+49297)%233280; return r/233280; }; for(let i=0;i<220;i++){ x.globalAlpha=.08+rnd()*.14; x.fillStyle=cols[Math.floor(rnd()*cols.length)]; x.beginPath(); x.ellipse(rnd()*w,rnd()*h,20+rnd()*140,8+rnd()*40,rnd()*3.1,0,7); x.fill(); } x.globalAlpha=1; return c; };
  const refs = [[['#E1B46A','#B7862E','#F2D28B','#6FA3E8'],1,'Wheat & sky'],[['#2E3A5C','#6FA3E8','#F2E8C9','#8B5CF6'],2,'Starry blue'],[['#9BA85A','#5C6B2E','#E8D9A0','#C7B36E'],3,'Olive & straw'],[['#E58A6F','#F6C4A6','#7A8194','#F4F3F0'],4,'Skin & plaster'],[['#4B4A44','#8A7D5C','#D8C9A0','#F2F1EE'],5,'Atelier neutrals'],[['#2B2A27','#E1B46A','#6DBBAF','#F4F3F0'],6,'Night café']];
  let mx = -520;
  for(const [cols, sd, name] of refs){
    const c = paint(800,560,cols,sd); const blob = await cvBlob(c); const id = await storeImageFile(new File([blob], name + '.png', {type:'image/png'}));
    const im = imgCache[id]; const ar = im.naturalHeight/im.naturalWidth;
    mb.objects.push({id:uid(), cat:'image', kind:'image', imgId:id, x:mx, y:(refs.indexOf([cols,sd,name])), rot:0, w:300, h:300*ar, color:'#5B6472', label:'', caption:name, path:[]});
    mx += 330;
  }
  // re-lay images in two rows of three
  mb.objects.filter(o=>o.cat==='image').forEach((o,i)=>{ o.x = -360 + (i%3)*330; o.y = -120 + Math.floor(i/3)*250; });
  mb.objects.push({id:uid(), cat:'text', kind:'text', x:-260, y:-330, rot:0, w:520, h:44, fontSize:28, bold:true, italic:false, text:'LICHT — a brand film in three rooms', color:'#2B2A27', label:'', path:[]});
  mb.objects.push({id:uid(), cat:'note', kind:'note', x:700, y:-140, rot:-0.04, w:210, h:130, color:PAL.sand, text:'Natural light only in the atelier — no fill above 20%. Let the windows burn.', label:'', path:[]});
  mb.objects.push({id:uid(), cat:'note', kind:'note', x:700, y:40, rot:0.03, w:210, h:120, color:PAL.teal, text:'Café: tungsten practicals, 2800K, rain on glass.', label:'', path:[]});
  mb.objects.push({id:uid(), cat:'colcard', kind:'colcard', x:700, y:240, rot:0, w:220, h:120, cw:220, color:'#E2A93B', title:'Idea', text:'Open every scene on hands — brush, bread, glass — before we see a face.', label:'', path:[]});

  // ---------------------------------------------------------------- script board
  project.scriptboard = null; ensureScriptBoard();
  const sb = project.scriptboard;
  const sc = sb.objects.find(o=>o.cat==='script');
  if(sc){ sc.title = 'LICHT — shooting script'; sc.text = 'INT. ATELIER — DAY\n\n' + s1.script + '\n\nEXT. WHEAT FIELD — GOLDEN HOUR\n\n' + s2.script + '\n\nINT. CAFÉ — NIGHT\n\n' + s3.script; sc.x = -300; sc.y = 0; }
  sb.objects.push({id:uid(), cat:'avscript', kind:'avscript', x:420, y:-40, rot:0, w:560, h:150, color:'#8B5CF6', label:'LICHT — 45" online cut', cols:{no:true, still:false, notes:true},
    rows:[{id:uid(),no:'1',video:'Hands on the brush. Morning light rakes across the canvas.',audio:'VO: "He painted what he could not say."',dur:'6',notes:'Open on hands',imgs:[]},
          {id:uid(),no:'1',video:'Wide: Vincent at the easel, Theo in the doorway.',audio:'Room tone, birds outside.',dur:'5',notes:'',imgs:[]},
          {id:uid(),no:'2',video:'Wheat field, golden hour, walking towards camera.',audio:'Music enters — strings.',dur:'8',notes:'Drone rises at :14',imgs:[]},
          {id:uid(),no:'3',video:'Café, four friends, laughter, sketch on a napkin.',audio:'Dialogue under music.',dur:'9',notes:'Two-shot first',imgs:[]},
          {id:uid(),no:'3',video:'Close: the napkin — a sunflower in three strokes.',audio:'VO: "Light. That is all."',dur:'5',notes:'',imgs:[]},
          {id:uid(),no:'—',video:'Logo. Van Gogh Museum — Licht, from 12 March.',audio:'Music resolves.',dur:'4',notes:'',imgs:[]}]});

  // ---------------------------------------------------------------- shot list board
  project.shotboard = null; project.shotlist = null; ensureShotBoard();
  const all = slAllShots();
  const d1 = slNewCard(0, 0, {name:'Day 1', date:'2026-10-06', call:'08:00'});
  for(const sh of all.filter(x=>x.sceneId===s1.id)) d1.rows.push(slRowFromShot(sh, 25));
  d1.rows.push(slBlockRow('break','Lunch',45));
  d1.rows.push(slBlockRow('move','To the wheat field (40 min drive)',60));
  for(const sh of all.filter(x=>x.sceneId===s2.id)) d1.rows.push(slRowFromShot(sh, 30));
  d1.rows[0].video = 'Hands on the brush, rake light'; d1.rows[0].audio = 'Room tone'; d1.rows[0].notes = 'Wait for the sun on the canvas';
  d1.rows[1].video = 'Theo in the doorway, push in'; d1.rows[1].notes = 'Gimbal move, two takes';
  const d2 = slNewCard(0, 480, {name:'Day 2', date:'2026-10-07', call:'16:00'});
  d2.rows.push(slBlockRow('setup','Practicals + rain rig',90));
  for(const sh of all.filter(x=>x.sceneId===s3.id)) d2.rows.push(slRowFromShot(sh, 35));
  project.shotboard.objects.push(d1, d2);

  // ---------------------------------------------------------------- production board
  project.prodboard = null; ensureProdBoard(); normalizeProduction();
  const reg = peopleReg(); reg.length = 0;
  [['crew','Director / DoP','Gerbert Floor','07:30','+31 6 1234 5678','gerbert@zoutwater.com'],['crew','1st AC','Sanne de Wit','07:30','+31 6 2345 6789','sanne@example.com'],['crew','Gaffer','Morten Brogaard','07:00','+31 6 2452 7563','morten@example.com'],['crew','Sound','Noor El Amrani','08:00','+31 6 3456 7890','noor@example.com'],['crew','Producer','Inga Lovric','07:30','+31 6 4567 8901','inga@example.com'],
   ['cast','Vincent','Daan Roovers','08:30','+31 6 5678 9012','daan@example.com'],['cast','Theo','Felix Berger','09:00','+31 6 6789 0123','felix@example.com'],['cast','Agostina','Lea Marín','16:30','+31 6 7890 1234','lea@example.com']]
   .forEach(([tag,role,name,call,phone,email])=>reg.push({id:uid(),tag,role,name,call,phone,email}));
  PR.locations = [{id:uid(), name:'Atelier Zuid', street:'Zeeburgerpad 12', town:'1019 AB Amsterdam', notes:'Parking on the quay · power 3×16A', contact:'Mark de Groot', phone:'+31 6 8901 2345'}];
  const pb = project.prodboard; pb.objects = [];
  const dh = {id:uid(), cat:'dayheader', kind:'dayheader', x:-420, y:-200, rot:0, w:320, h:140, color:PAL.coral, date:'2026-10-06', call:'07:30', shootCall:'08:30', wrap:'19:00', locIds:[PR.locations[0].id], label:'', path:[]};
  pb.objects.push(dh);
  pb.objects.push({id:uid(), cat:'listcard', kind:'crew', x:60, y:-180, rot:0, w:560, h:150, color:PAL.sky, label:'', path:[]});
  pb.objects.push({id:uid(), cat:'listcard', kind:'cast', x:60, y:20, rot:0, w:560, h:150, color:'#E8934C', label:'', path:[]});
  pb.objects.push({id:uid(), cat:'fieldcard', kind:'location', x:-420, y:20, rot:0, w:280, h:130, color:PAL.olive, locId:PR.locations[0].id, label:'', path:[]});
  pb.objects.push({id:uid(), cat:'proplist', kind:'proplist', x:-420, y:250, rot:0, w:280, h:160, color:'#7FA05A', props:{[s1.id]:[{id:uid(),name:'Easel + canvas (blank)',count:1,done:true},{id:uid(),name:'Brushes, palette, rags',done:true},{id:uid(),name:'Straw hat',done:false}],[s3.id]:[{id:uid(),name:'Napkins + fountain pen',done:false},{id:uid(),name:'Rain rig hose',done:false}]}, hide:{}, done:{}, label:'', path:[]});
  const cs = {id:uid(), cat:'callsheet', kind:'callsheet', x:760, y:-60, rot:0, w:380, h:300, color:PAL.sky, dayId:dh.id, label:'', path:[]};
  pb.objects.push(cs);

  // ---------------------------------------------------------------- budget
  project.budget = null; budgetData(); for(const ph of ['pre','prod','post','var']) budgetAddStandard(ph);
  const B = budgetData(); B.vat = 21; B.contPct = 5;
  const rates = {'Brainstorm · research · script':3500,'Shot list · storyboard · script walk-through':1800,'Production · contacts · admin':1500,'Location scouting':600,'Location visit with director / styling':900,'Set dressing / styling prep':600,'Casting / booking actors':800,'Camera prep · tests · rental visit':500,
    'Director':1500,'Director of photography':1250,'Focus puller / 1st AC':650,'Runner / 2nd AC':350,'Gaffer + best boy (light)':1450,'Make-up artist':550,'Set dresser':550,'Producer / production manager':700,'Sound recordist (incl. recording kit)':750,'Camera package (cameras, lenses, tripod, gimbal)':1900,'Light package + van':1600,
    'Editing (feedback rounds, incl. director edit day)':3600,'Colour grading':1100,'Audio mix / sound design':950,'Contingency':0};
  for(const it of B.items){ if(rates[it.name] != null) it.rate = rates[it.name]; if(it.phase === 'prod' && it.unit === 'days') it.qty = 2; }
  B.target = {pre:11000, prod:26000, post:6000};

  markDirty();

  // ================================================================ renders
  const bounds1 = {minX:-70, minY:-80, maxX:880, maxY:560};
  const rend = (shot, dim, b, grid)=>renderShotPlan(shot, dim, b || null, grid);
  await up('shot-designer.png', await cvBlob(rend(s1, 2400, null, true)));
  await up('cafe.png', await cvBlob(rend(s3, 2000, null, true)));
  await up('field.png', await cvBlob(rend(s2, 2000, null, true)));
  // how a plan grows: walls → doors & windows → set dressing → cameras, cast, light
  const step = (walls, objs, sun)=>{ const c = newShot(9); Object.assign(c, {walls, objects:objs, sun:sun||null, shots:s1.shots}); return c; };
  const bare = s1.walls.map(w=>({...w, openings:[]}));
  const furniture = s1.objects.filter(o=>o.cat==='prop' && !GEAR_KINDS.has(o.kind));
  await up('step1.png', await cvBlob(rend(step(bare, []), 1400, bounds1, true)));
  await up('step2.png', await cvBlob(rend(step(s1.walls, []), 1400, bounds1, true)));
  await up('step3.png', await cvBlob(rend(step(s1.walls, furniture), 1400, bounds1, true)));
  await up('step4.png', await cvBlob(rend(step(s1.walls, s1.objects, s1.sun), 1400, bounds1, true)));
  // boards
  await ensureShotImages(mb, false);
  await up('moodboard.png', await cvBlob(rend(mb, 2400, null, false)));
  await up('script.png', await cvBlob(rend(sb, 2400, null, false)));
  const cardB = o=>({minX:o.x - o.w/2 - 30, minY:o.y - o.h/2 - 30, maxX:o.x + o.w/2 + 30, maxY:o.y + o.h/2 + 30});
  // shot list: render once so the card sizes itself, then crop to it
  rend(project.shotboard, 400, null, false);
  await up('shotlist.png', await cvBlob(rend(project.shotboard, 2400, cardB(d1), false)));
  // production board (call sheet composes itself on render)
  rend(pb, 400, null, false);
  await up('production.png', await cvBlob(rend(pb, 2600, null, false)));
  await up('callsheet-card.png', await cvBlob(rend(pb, 1600, cardB(cs), false)));
  // documents → PDF page 1 → PNG
  const got = {}; const _dl = window.dlBlob; window.dlBlob = (n, b)=>{ got[n] = b; };
  try{
    switchTab('org'); await new Promise(r=>setTimeout(r, 200)); render();
    exportCallSheetDoc(cs); exportBudgetPDF(); exportShotListPDF(null); exportPropListPDF(pb.objects.find(o=>o.cat==='proplist'));
  } finally { window.dlBlob = _dl; }
  await loadPdfJs();
  const pdfPng = async (blob, pageNo)=>{ const pdf = await pdfjsLib.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise; const page = await pdf.getPage(pageNo || 1); const vp = page.getViewport({scale:2}); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await page.render({canvasContext:c.getContext('2d'), viewport:vp}).promise; return cvBlob(c); };
  for(const [n, b] of Object.entries(got)){
    const key = /callsheet/.test(n) ? 'pdf-callsheet' : /budget/.test(n) ? 'pdf-budget' : /shot-list/.test(n) ? 'pdf-shotlist' : 'pdf-proplist';
    await up(key + '.png', await pdfPng(b, 1));
  }
  // room library thumbnail
  const room = roomFromScene(s1, 'Atelier', 'Zeeburgerpad 12'); await roomSave(room);
  await up('room-thumb.jpg', await (await fetch(room.thumb)).blob());
  // the library sidebar as an image (real tiles)
  switchTab('design'); await new Promise(r=>setTimeout(r, 300));
  const lib = document.getElementById('library'); const lr = lib.getBoundingClientRect();
  const sc2 = 2, c = document.createElement('canvas'); c.width = Math.round(lr.width*sc2); c.height = Math.round(Math.min(lr.scrollHeight, 1100)*sc2);
  const x = c.getContext('2d'); x.scale(sc2, sc2); x.fillStyle = getComputedStyle(document.body).getPropertyValue('--panel') || '#fff'; x.fillRect(0,0,lr.width,1100);
  lib.scrollTop = 0;
  for(const el of lib.querySelectorAll('.cat-head, .lib-item')){
    const r = el.getBoundingClientRect(); const ox = r.left - lr.left, oy = r.top - lr.top; if(oy > 1100) break;
    if(el.classList.contains('cat-head')){ x.font = '700 10.5px -apple-system, Segoe UI, sans-serif'; x.fillStyle = getComputedStyle(el).color; const dot = el.querySelector('.cat-dot, i, span'); x.fillText(el.textContent.trim().replace(/^▾\s*/, '').toUpperCase(), ox + 22, oy + r.height/2 + 4); const dc = dot && getComputedStyle(dot).backgroundColor; if(dc && dc !== 'rgba(0, 0, 0, 0)'){ x.fillStyle = dc; x.beginPath(); x.arc(ox + 12, oy + r.height/2, 3.5, 0, 7); x.fill(); } continue; }
    x.fillStyle = getComputedStyle(el).backgroundColor; x.strokeStyle = getComputedStyle(el).borderColor; x.lineWidth = 1;
    x.beginPath(); x.roundRect(ox, oy, r.width, r.height, 8); x.fill(); x.stroke();
    const tc = el.querySelector('canvas'); if(tc){ const tr = tc.getBoundingClientRect(); x.drawImage(tc, tr.left - lr.left, tr.top - lr.top, tr.width, tr.height); }
    const sp = el.querySelector('span'); if(sp){ const sr = sp.getBoundingClientRect(); x.font = '10.5px -apple-system, Segoe UI, sans-serif'; x.fillStyle = getComputedStyle(sp).color; x.textAlign = 'center'; x.fillText(sp.textContent, ox + r.width/2, sr.top - lr.top + sr.height - 3); x.textAlign = 'left'; }
  }
  await up('sidebar.png', await cvBlob(c));
  return log;
};
