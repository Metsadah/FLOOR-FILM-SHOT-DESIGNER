// Landing renders, part 2: two REAL Zoutwater productions re-created in Floorboard
// (Velderhof TV commercial 2024 · Nudes, fiction short). Run in the local test build:
//   await buildRealExamples()
window.buildRealExamples = async function(){
  const log = [];
  const up = async (name, blob)=>{ const r = await fetch('/upload?name=landing/img/' + name, {method:'POST', body:blob}); log.push(name + ' ' + (await r.text())); };
  const cvBlob = c => new Promise(r=>c.toBlob(r, 'image/png'));
  const {wall:W, prop:P, actor:A, cam:C, note:N, text:T, colcard:CC, av:AV, scene:SC, board:B} = TPL;
  const still = async (file)=>{ const bl = await (await fetch('/landing/img/' + file)).blob(); return storeImageFile(new File([bl], file, {type:'image/jpeg'})); };
  const rend = (shot, dim, b, grid)=>renderShotPlan(shot, dim, b || null, grid);
  const imgObj = (id, x, y, w, caption)=>{ const im = imgCache[id]; const ar = im && im.naturalWidth ? im.naturalHeight/im.naturalWidth : .5625; return {id:uid(), cat:'image', kind:'image', imgId:id, x, y, rot:0, w, h:w*ar, color:'#5B6472', label:'', caption:caption || '', path:[]}; };

  // ================================================================ Velderhof — TV commercial (30")
  project.shootName = 'Velderhof — TV commercial 2024';
  const v1 = SC(1, '1', 'INT. LIVING ROOM — BIRTHDAY PARTY', 'Living room', 240);
  v1.script = 'A 65th birthday. Bunting, confetti, cake. Five armchairs with red bows stand in the room — Willeke hands over a gift, but it is not her friend’s taste. At Velderhof that does not matter: you can try up to five chairs at home.';
  v1.walls = [W(0,0,700,0,[{t:.5,w:220,type:'window'}]), W(700,0,700,480,[{t:.25,w:90,type:'door',flip:true}]), W(700,480,0,480), W(0,480,0,0,[{t:.6,w:120,type:'window'}])];
  v1.shots = [{id:'va',name:'A'},{id:'vb',name:'B'},{id:'vc',name:'C'}];
  v1.objects = [
    P('rug',350,260,0), P('armchair',250,170,0.35,'Chair 1 · bow'), P('relaxchair',380,150,-0.2,'Chair 2 · bow'), P('armchair',510,200,-0.6,'Chair 3'), P('armchair',180,330,0.9,'Chair 4'), P('relaxchair',560,330,-1.2,'Chair 5'),
    P('smalltable',360,290,0,'Cake · bubbles'), P('plant',40,40,0), P('cabinet',640,440,0),
    A('actor',330,380,-1.2,'Willeke'), A('actor_ant',300,230,0.8,'Birthday girl'), A('actor_extra',120,120,1.0,'Guest'), A('actor_extra',600,90,2.4,'Guest'), A('actor_extra',460,420,-1.9,'Guest'), A('actor_extra',80,420,-0.4,'Guest'),
    C('cam_std',360,465,-1.57,{lens:24,fov:74,framing:'Wide',support:'Tripod',shotId:'va',sensor:'s35'}),
    C('cam_gimbal',120,250,0.1,{lens:35,fov:54,framing:'Medium',support:'Gimbal',shotId:'vb',sensor:'s35',path:[{x:180,y:250,rot:0.05},{x:260,y:320,rot:-0.4}]}),
    C('cam_std',620,220,2.6,{lens:85,fov:24,framing:'Close-up',support:'Tripod',shotId:'vc',sensor:'s35'}),
    P('hmi',350,-60,1.57,'HMI through the window'), P('ledpanel',60,440,-0.8), P('bounce',650,60,0), P('cstand',560,460,-2.4),
  ];
  v1.sun = {on:true, x:350, y:-160, hour:14};
  project.scenes = [v1]; project.activeSceneId = v1.id; migrateShot(v1);
  const vIds = []; for(let i = 1; i <= 6; i++) vIds.push(await still('velderhof-' + i + '.jpg'));
  project.moodboard = B('Mood & inspiration'); const vm = project.moodboard;
  vm.objects.push(T(-320,-330,'VELDERHOF — “Bij Velderhof geeft dat helemaal niet”',26,true));
  vIds.forEach((id,i)=>vm.objects.push(imgObj(id, -330 + (i%3)*340, -150 + Math.floor(i/3)*230, 320, ['Party, bunting, warm practicals','Cake, bubbles, hero props','Five chairs with bows','The reveal','Gift moment','Pack shot'][i])));
  vm.objects.push(N(760,-160,'Warm, cheerful, late-afternoon sun through the garden window. Confetti on every take — reset budget!',PAL.sand,230,130));
  vm.objects.push(CC(760,20,'Look','Practicals on, HMI outside as sun, soft key from the room. Super 35, 24 / 35 / 85.', '#3E9B6E'));
  project.scriptboard = B('Script & storyboard');
  project.scriptboard.objects.push(AV(0,0,'Velderhof — 30" TV', [
    {no:'1',video:'Party in full swing. Hands over eyes — a surprise.',audio:'Laughter, party ambience.',dur:'4',notes:'A wide, then B in the crowd'},
    {no:'1',video:'Willeke hands over the gift. The friend unwraps: a chair. Polite smile.',audio:'“Ohh… wat leuk.”',dur:'6',notes:'C 85 mm on the face'},
    {no:'1',video:'Reveal: five armchairs with red bows fill the room.',audio:'Music lifts.',dur:'6',notes:'B gimbal move around the chairs'},
    {no:'1',video:'She tries them, one after another. Everyone cheers.',audio:'VO: “Bij Velderhof geeft dat helemaal niet…”',dur:'8',notes:'Confetti reset between takes'},
    {no:'1',video:'Pack shot: Velderhof · 1 2 3 zitten.',audio:'VO: “…de perfecte stoel zit er altijd tussen.”',dur:'6',notes:'Locked off'}], true));
  project.shotboard = null; project.shotlist = null; ensureShotBoard();
  const vd = slNewCard(0, 0, {name:'Shoot day', date:'2024-02-12', call:'07:30'});
  for(const sh of slAllShots()) vd.rows.push(slRowFromShot(sh, 40));
  vd.rows.splice(1, 0, slBlockRow('setup', 'Confetti + bows reset', 20));
  vd.rows.push(slBlockRow('break', 'Lunch', 45));
  project.shotboard.objects.push(vd);
  await ensureShotImages(vm, false);
  await up('velderhof-plan.png', await cvBlob(rend(v1, 2400, null, true)));
  await up('velderhof-mood.png', await cvBlob(rend(vm, 2400, null, false)));
  await up('velderhof-av.png', await cvBlob(rend(project.scriptboard, 2200, null, false)));
  rend(project.shotboard, 400, null, false);
  await up('velderhof-shotlist.png', await cvBlob(rend(project.shotboard, 2200, {minX:vd.x - vd.w/2 - 30, minY:vd.y - vd.h/2 - 30, maxX:vd.x + vd.w/2 + 30, maxY:vd.y + vd.h/2 + 30}, false)));

  // ================================================================ Nudes — fiction short
  project.shootName = 'Nudes — Dan moet je wat voor me doen';
  const n1 = SC(1, '1', 'INT. CLASSROOM — DAY', 'Classroom', 180);
  n1.script = 'Bookcases along the wall, big windows. A class works in silence; phones under the tables. One girl looks up.';
  n1.walls = [W(0,0,800,0,[{t:.3,w:220,type:'window'},{t:.72,w:220,type:'window'}]), W(800,0,800,560,[{t:.85,w:90,type:'door'}]), W(800,560,0,560), W(0,560,0,0)];
  n1.shots = [{id:'n1a',name:'1A'},{id:'n1b',name:'1B'}];
  n1.objects = [P('bookcase',20,280,1.57), P('bookcase',20,120,1.57)];
  for(let r = 0; r < 2; r++) for(let c = 0; c < 4; c++){ n1.objects.push(P('desk',200 + c*140, 180 + r*150, 0)); n1.objects.push(P('chair',200 + c*140, 240 + r*150, Math.PI)); }
  n1.objects.push(P('desk',680,480,0,'Teacher'), P('chair',680,430,0));
  n1.objects.push(A('actor',340,240,Math.PI,'Fleur'), A('actor_ant',480,390,Math.PI,'Lisa'), A('actor_extra',200,240,Math.PI), A('actor_extra',620,240,Math.PI), A('actor_extra',200,390,Math.PI), A('actor_extra',620,390,Math.PI), A('actor',700,470,0,'Teacher'));
  n1.objects.push(C('cam_std',120,520,-0.9,{lens:32,fov:57,framing:'Wide',support:'Tripod',shotId:'n1a',sensor:'s35'}), C('cam_std',560,520,-1.9,{lens:85,fov:24,framing:'Close-up',support:'Tripod',shotId:'n1b',sensor:'s35'}));
  n1.objects.push(P('negfill',780,300,0), P('bounce',60,480,0));
  n1.sun = {on:true, x:400, y:-140, hour:10};
  const n2 = SC(2, '2', 'INT. TEACHERS’ ROOM — DAY', 'Teachers’ room', 240);
  n2.script = 'A small room, one table, two chairs. The teacher and a pupil, face to face. Nobody raises their voice.';
  n2.walls = [W(0,0,450,0,[{t:.5,w:160,type:'window'}]), W(450,0,450,380), W(450,380,0,380,[{t:.3,w:90,type:'door'}]), W(0,380,0,0)];
  n2.shots = [{id:'n2a',name:'2A'},{id:'n2b',name:'2B'},{id:'n2c',name:'2C'}];
  n2.objects = [P('table',225,190,0), P('chair',225,120,0), P('chair',225,260,Math.PI), P('cabinet',40,340,0), P('plant',420,40,0),
    A('actor',225,110,0,'Teacher'), A('actor_ant',225,270,Math.PI,'Pupil'),
    C('cam_std',80,60,0.9,{lens:50,fov:40,framing:'Over-shoulder',support:'Tripod',shotId:'n2a',sensor:'s35'}),
    C('cam_std',390,330,-2.3,{lens:50,fov:40,framing:'Over-shoulder',support:'Tripod',shotId:'n2b',sensor:'s35'}),
    C('cam_std',420,190,Math.PI,{lens:24,fov:74,framing:'Two-shot',support:'Tripod',shotId:'n2c',sensor:'s35'}),
    P('ledpanel',40,40,0.8), P('bounce',430,300,0), P('negfill',20,190,1.57)];
  n2.sun = {on:true, x:225, y:-120, hour:11};
  project.scenes = [n1, n2]; project.activeSceneId = n2.id; migrateShot(n1); migrateShot(n2);
  const nIds = []; for(let i = 1; i <= 6; i++) nIds.push(await still('nudes-' + i + '.jpg'));
  project.moodboard = B('Mood & inspiration'); const nm = project.moodboard;
  nm.objects.push(T(-320,-330,'NUDES — Dan moet je wat voor me doen',26,true));
  nIds.forEach((id,i)=>nm.objects.push(imgObj(id, -330 + (i%3)*340, -150 + Math.floor(i/3)*230, 320, ['Phones, chats, 00:34','Classroom, window light','Face to face','Waiting outside','Corridor','Close, quiet'][i])));
  nm.objects.push(N(760,-160,'Daylight only where we can. Long lenses, shallow, faces. No music in the conversations.',PAL.sky,230,130));
  nm.objects.push(CC(760,20,'Do / don’t','Do: stay with the listener.\nDon’t: cut on every line.', PAL.coral));
  project.scriptboard = B('Script & storyboard');
  project.scriptboard.objects.push({id:uid(),cat:'script',kind:'script',x:-300,y:0,rot:0,w:520,h:480,title:'Nudes — breakdown',text:'INT. CLASSROOM — DAY\n\nA class works in silence. Phones under the tables. Fleur looks up from her book.\n\nINT. TEACHERS’ ROOM — DAY\n\nOne table, two chairs. The teacher and Lisa, face to face. Long pauses.\n\nINT. CORRIDOR — DAY\n\nPupils wait on the bench outside. Nobody talks.\n\nINT. TEACHERS’ ROOM — LATER\n\nThe second conversation. What happened, and whether anyone was made to.',mode:'film',label:'',path:[]});
  project.scriptboard.objects.push(N(320,-200,'Selected for Cinekid, Shortcutz Amsterdam and Student World Impact Festival.',PAL.sand,230,110));
  await ensureShotImages(nm, false);
  await up('nudes-plan.png', await cvBlob(rend(n2, 2000, null, true)));
  await up('nudes-classroom.png', await cvBlob(rend(n1, 2400, null, true)));
  await up('nudes-mood.png', await cvBlob(rend(nm, 2400, null, false)));
  await up('nudes-script.png', await cvBlob(rend(project.scriptboard, 2000, null, false)));
  return log;
};
