// Floorboard — 14-templates.js · new productions: templates and the example
// A template lays the tools out per floor for a kind of job (commercial,
// brand film, documentary, fiction, music video, socials) — empty, ready to
// fill in. The example is a finished tiny production (a 15-second commercial,
// five shots, three locations) so a new user sees how the floors connect.
'use strict';

// ---------------------------------------------------------------- helpers (object shapes as the app makes them)
const TPL = {
  wall:(x1,y1,x2,y2,ops)=>({id:uid(),x1,y1,x2,y2,openings:(ops||[]).map(o=>({id:uid(),t:o.t,w:o.w,type:o.type,flip:!!o.flip})),locked:false}),
  prop:(kind,x,y,rot,label)=>({id:uid(),cat:'prop',kind,x,y,rot:rot||0,w:PROPS[kind].w,h:PROPS[kind].h,color:GEAR_KINDS.has(kind)?PAL.sand:PAL.slate,label:label||'',path:[]}),
  actor:(kind,x,y,rot,label)=>({id:uid(),cat:'actor',kind,x,y,rot:rot||0,w:ACTORS[kind].w,h:ACTORS[kind].h,color:PAL.coral,label:label||'',path:[]}),
  cam:(kind,x,y,rot,o)=>Object.assign({id:uid(),cat:'camera',kind,x,y,rot:rot||0,w:CAMS[kind].w,h:CAMS[kind].h,fov:CAMS[kind].fov,range:CAMS[kind].range,lens:null,color:PAL.sky,label:'',path:[]}, o||{}),
  note:(x,y,text,color,w,h)=>({id:uid(),cat:'note',kind:'note',x,y,rot:0,w:w||210,h:h||120,color:color||PAL.sand,text:text||'',label:'',path:[]}),
  text:(x,y,text,size,bold)=>({id:uid(),cat:'text',kind:'text',x,y,rot:0,w:Math.max(200,text.length*(size||18)*.6),h:(size||18)*1.6,fontSize:size||18,bold:!!bold,italic:false,text,color:'#2B2A27',label:'',path:[]}),
  colcard:(x,y,title,text,color)=>({id:uid(),cat:'colcard',kind:'colcard',x,y,rot:0,w:220,h:120,cw:220,color:color||'#E2A93B',title,text:text||'',label:'',path:[]}),
  av:(x,y,label,rows,notes)=>({id:uid(),cat:'avscript',kind:'avscript',x,y,rot:0,w:560,h:150,color:'#8B5CF6',label,cols:{no:true,still:false,notes:!!notes},rows:rows.map(r=>Object.assign({id:uid(),no:'',video:'',audio:'',dur:'',notes:'',imgs:[]},r))}),
  scene:(n,scene,desc,name,dur)=>{ const s=newShot(n); s.scene=scene; s.sceneDesc=desc; s.name=name||desc; s.duration=dur||60; return s; },
  board:(name)=>{ const b=newShot(0); b.name=name; return b; },
  people:(rows)=>rows.map(([tag,role,name,call,phone,email])=>({id:uid(),tag,role,name:name||'',call:call||'',phone:phone||'',email:email||''})),
};
function tplBlank(name){
  const p = {v:4, scenes:[newShot(1)], activeSceneId:null, customProps:[], shootName:name || ''};
  p.activeSceneId = p.scenes[0].id;
  p.production = {people:[], locations:[], company:'', email:'', phone:'', logo:null, brand:{accent:'#4B6BFB', style:'band', footer:''}};
  return p;
}
// production-floor skeleton shared by every template: day header, lists, location, prop list, call sheet
function tplProdBoard(p, opts){
  const b = TPL.board('Production board');
  const dh = {id:uid(),cat:'dayheader',kind:'dayheader',x:-420,y:-200,rot:0,w:320,h:140,color:PAL.coral,date:'',call:'08:00',shootCall:'09:00',wrap:'18:00',locIds:[],label:'',path:[]};
  b.objects.push(dh);
  b.objects.push({id:uid(),cat:'listcard',kind:'crew',x:60,y:-180,rot:0,w:560,h:150,color:PAL.sky,label:'',path:[]});
  if(opts.cast) b.objects.push({id:uid(),cat:'listcard',kind:'cast',x:60,y:20,rot:0,w:560,h:150,color:'#E8934C',label:'',path:[]});
  if(opts.client) b.objects.push({id:uid(),cat:'listcard',kind:'client',x:60,y:opts.cast ? 200 : 20,rot:0,w:560,h:150,color:'#3E9B6E',label:'',path:[]});
  b.objects.push({id:uid(),cat:'fieldcard',kind:'location',x:-420,y:20,rot:0,w:280,h:130,color:PAL.olive,locId:null,label:'',path:[]});
  b.objects.push({id:uid(),cat:'proplist',kind:'proplist',x:-420,y:250,rot:0,w:280,h:160,color:'#7FA05A',props:{},hide:{},done:{},label:'',path:[]});
  b.objects.push({id:uid(),cat:'callsheet',kind:'callsheet',x:760,y:-60,rot:0,w:380,h:300,color:PAL.sky,dayId:dh.id,label:'',path:[]});
  p.prodboard = b;
}
function tplBudget(p, phases){
  p.budget = {currency:'EUR', vat:21, contPct:5, target:{pre:0, prod:0, post:0}, items:[]};
  for(const ph of (phases || ['pre','prod','post','var']))
    for(const name of (BUDGET_STANDARD[ph] || []))
      p.budget.items.push({id:uid(), phase:ph, name, qty:1, unit:ph === 'prod' && /Director|photography|AC|Gaffer|Make-up|dresser|Producer|Sound|package/.test(name) ? 'days' : 'flat', rate:0, note:''});
}
function tplShotBoard(p, dayName){
  const b = TPL.board('Shot list');
  b.objects.push({id:uid(),cat:'avscript',kind:'avscript',mode:'shotlist',x:0,y:0,rot:0,w:900,h:150,color:PAL.coral,cols:{no:true,still:false,notes:true},rows:[],day:{name:dayName || 'Day 1',date:'',call:'08:00'}});
  p.shotboard = b;
}
function tplMood(p, title, notes){
  const b = TPL.board('Mood & inspiration');
  b.objects.push(TPL.text(-260,-300,title,28,true));
  notes.forEach((n,i)=>b.objects.push(TPL.note(-360 + i*240, -150, n[0], n[1] || PAL.sand)));
  b.objects.push(TPL.colcard(-360, 60, 'Idea', 'One sentence that the whole film serves.'));
  b.objects.push(TPL.colcard(-120, 60, 'Do / don’t', 'Do: … \nDon’t: …', PAL.coral));
  b.objects.push(TPL.colcard(120, 60, 'Look', 'Colour, contrast, lenses, movement.', '#3E9B6E'));
  p.moodboard = b;
}

// ---------------------------------------------------------------- templates
const TEMPLATES = [
  {key:'commercial', name:'Commercial', blurb:'AV script in seconds, three short scenes, client on the call sheet, quote-style budget.',
   build(p, name){
     p.scenes = [TPL.scene(1,'1','INT. — DAY','Scene 1',45), TPL.scene(2,'2','EXT. — DAY','Scene 2',45), TPL.scene(3,'3','INT. — DAY','Scene 3',45)];
     const sb = TPL.board('Script & storyboard');
     sb.objects.push(TPL.av(0,0,(name || 'Commercial') + ' — 15" / 30"', [1,2,3,4,5].map(i=>({no:String(Math.min(i,3)), dur:''})), true));
     sb.objects.push(TPL.note(520,-160,'Write the AV script here: what we see, what we hear, seconds per beat. Then Break down → scenes.',PAL.lilac,230,120));
     p.scriptboard = sb;
     tplMood(p, (name || 'Commercial') + ' — mood', [['Reference films / spots', PAL.sky],['Product: how does it look in the light?', PAL.sand],['Tone of voice', PAL.teal]]);
     tplProdBoard(p, {cast:true, client:true}); tplBudget(p); tplShotBoard(p, 'Shoot day');
   }},
  {key:'brandfilm', name:'Brand film', blurb:'Longer AV script with interview and b-roll beats, two shoot days, budget with variable costs.',
   build(p, name){
     p.scenes = [TPL.scene(1,'1','INT. INTERVIEW — DAY','Interview',120), TPL.scene(2,'2','B-ROLL — WORKPLACE','B-roll workplace',90), TPL.scene(3,'3','B-ROLL — PRODUCT','B-roll product',60), TPL.scene(4,'4','EXT. ESTABLISHING','Establishing',30)];
     const sb = TPL.board('Script & storyboard');
     sb.objects.push(TPL.av(0,0,(name || 'Brand film') + ' — 90"', [{no:'1',video:'Interview: opening statement',dur:''},{no:'2',video:'B-roll: hands at work',dur:''},{no:'1',video:'Interview: the why',dur:''},{no:'3',video:'B-roll: the product',dur:''},{no:'4',video:'Establishing shot, logo',dur:''}], true));
     sb.objects.push({id:uid(),cat:'script',kind:'script',x:-620,y:0,rot:0,w:480,h:380,title:'Interview questions',text:'1. Start at the beginning — why does this company exist?\n2. …\n3. …',mode:'film',label:'',path:[]});
     p.scriptboard = sb;
     tplMood(p, (name || 'Brand film') + ' — mood', [['Reference films', PAL.sky],['Interview setup: light, background, lens', PAL.sand],['Music direction', PAL.teal]]);
     tplProdBoard(p, {cast:false, client:true}); tplBudget(p); tplShotBoard(p, 'Day 1');
   }},
  {key:'documentary', name:'Documentary', blurb:'Interview and observational scenes, question sheet, gear list, no cast list.',
   build(p, name){
     p.scenes = [TPL.scene(1,'1','INT. INTERVIEW A — DAY','Interview A',120), TPL.scene(2,'2','OBSERVATIONAL — LOCATION','Observational',180), TPL.scene(3,'3','INT. INTERVIEW B — DAY','Interview B',120)];
     const sb = TPL.board('Script & storyboard');
     sb.objects.push({id:uid(),cat:'script',kind:'script',x:-300,y:0,rot:0,w:520,h:420,title:(name || 'Documentary') + ' — treatment & questions',text:'TREATMENT\n\nWhat is this film about, in three sentences?\n\nQUESTIONS — INTERVIEW A\n1. …\n2. …\n\nSEQUENCES TO OBSERVE\n- …',mode:'film',label:'',path:[]});
     sb.objects.push(TPL.av(360,-40,'Sequence plan',[{no:'1',video:'Opening image'},{no:'2',video:'Meet the protagonist'},{no:'3',video:'The problem'},{no:'2',video:'Turning point'},{no:'3',video:'Resolution'}], true));
     p.scriptboard = sb;
     tplMood(p, (name || 'Documentary') + ' — mood', [['Reference docs', PAL.sky],['Access: who, where, when?', PAL.sand],['Sound: rooms, ambience', PAL.teal]]);
     tplProdBoard(p, {cast:false, client:false}); tplBudget(p); tplShotBoard(p, 'Day 1');
   }},
  {key:'fiction', name:'Fiction', blurb:'Screenplay card that breaks down into scenes, cast list, shooting days, full budget.',
   build(p, name){
     p.scenes = [TPL.scene(1,'1','INT. — DAY','Scene 1',90), TPL.scene(2,'2','EXT. — NIGHT','Scene 2',90), TPL.scene(3,'3','INT. — NIGHT','Scene 3',90)];
     const sb = TPL.board('Script & storyboard');
     sb.objects.push({id:uid(),cat:'script',kind:'script',x:-300,y:0,rot:0,w:520,h:460,title:(name || 'Untitled') + ' — screenplay',text:'INT. KITCHEN — DAY\n\nAction line. Who is here, what do we see.\n\nNAME\nDialogue.\n\nEXT. STREET — NIGHT\n\n…',mode:'film',label:'',path:[]});
     sb.objects.push(TPL.note(360,-160,'Paste the screenplay here, or Import script… in the top bar. Every scene heading becomes a scene on the 2nd floor.',PAL.lilac,240,120));
     p.scriptboard = sb;
     tplMood(p, (name || 'Fiction') + ' — mood', [['Reference films', PAL.sky],['Characters: wardrobe, colour', PAL.coral],['Locations wish list', PAL.teal]]);
     tplProdBoard(p, {cast:true, client:false}); tplBudget(p); tplShotBoard(p, 'Day 1');
   }},
  {key:'musicvideo', name:'Music video', blurb:'Beat sheet against the track, performance and narrative scenes, artist as cast.',
   build(p, name){
     p.scenes = [TPL.scene(1,'1','PERFORMANCE — STUDIO','Performance',120), TPL.scene(2,'2','NARRATIVE — EXT.','Narrative A',90), TPL.scene(3,'3','NARRATIVE — INT.','Narrative B',90)];
     const sb = TPL.board('Script & storyboard');
     sb.objects.push(TPL.av(0,0,(name || 'Music video') + ' — beat sheet', [{no:'1',audio:'Intro 0:00–0:12',video:'Performance wide'},{no:'2',audio:'Verse 1',video:'Narrative A'},{no:'1',audio:'Chorus',video:'Performance close'},{no:'3',audio:'Verse 2',video:'Narrative B'},{no:'1',audio:'Final chorus',video:'Performance, all setups'}], true));
     p.scriptboard = sb;
     tplMood(p, (name || 'Music video') + ' — mood', [['Reference videos', PAL.sky],['Artist: look, wardrobe', PAL.coral],['Light: colour, haze, practicals', PAL.sand]]);
     tplProdBoard(p, {cast:true, client:true}); tplBudget(p); tplShotBoard(p, 'Shoot day');
   }},
  {key:'socials', name:'Socials', blurb:'Short vertical pieces: 9:16 beat sheets, one location, small crew, quick budget.',
   build(p, name){
     p.scenes = [TPL.scene(1,'1','INT. — SET A','Set A',60), TPL.scene(2,'2','INT. — SET B','Set B',60)];
     const sb = TPL.board('Script & storyboard');
     sb.objects.push(TPL.av(0,0,(name || 'Socials') + ' — piece 1 (9:16, 15")', [{no:'1',video:'Hook (first 2 seconds)',dur:'2'},{no:'1',video:'Beat 2',dur:''},{no:'2',video:'Beat 3',dur:''},{no:'2',video:'Call to action',dur:'3'}], true));
     sb.objects.push(TPL.av(0,320,(name || 'Socials') + ' — piece 2 (9:16, 15")', [{no:'1',video:'Hook',dur:'2'},{no:'1',video:'Beat 2',dur:''},{no:'2',video:'Call to action',dur:'3'}], true));
     p.scriptboard = sb;
     tplMood(p, (name || 'Socials') + ' — mood', [['Vertical framing: keep faces in the middle third', PAL.sky],['Text safe zones (UI overlays)', PAL.sand],['References', PAL.teal]]);
     tplProdBoard(p, {cast:true, client:true}); tplBudget(p, ['prod','post']); tplShotBoard(p, 'Shoot day');
   }},
];

// ---------------------------------------------------------------- the example production
// "Haver — 15 seconds": an oat-milk commercial. Five shots in three locations:
// a bedroom (upstairs), a kitchen (ground floor) and the street outside.
async function buildExampleProject(){
  const p = tplBlank('Haver — 15" commercial');
  const {wall:W, prop:P, actor:A, cam:C} = TPL;
  p.production.company = 'Your production company';
  p.production.locations = [{id:uid(), name:'Townhouse — Lauriergracht', street:'Lauriergracht 40', town:'1016 RL Amsterdam', notes:'Bedroom 1st floor, kitchen ground floor. Street shot in front of the door. Parking: garage Marnixstraat.', contact:'Home owner: Mieke', phone:'+31 6 1234 5678'}];
  // scene 1 — bedroom (upstairs)
  const s1 = TPL.scene(1,'1','INT. BEDROOM — DAWN','Bedroom',60);
  s1.script = 'Grey light through the curtains. SAM (30) wakes before the alarm, reaches out and switches it off. A beat. Then a smile: today is a slow day.';
  s1.walls = [W(0,0,450,0,[{t:.5,w:140,type:'window'}]), W(450,0,450,380,[{t:.7,w:90,type:'door',flip:true}]), W(450,380,0,380), W(0,380,0,0)];
  s1.shots = [{id:'e1a',name:'1A'},{id:'e1b',name:'1B'}];
  s1.objects = [P('bed',225,150,0), P('smalltable',60,60,0,'Nightstand'), P('closet',380,340,0), P('rug',225,320,0), P('tablelamp',60,60,0),
    A('actor',225,150,0,'Sam'),
    C('cam_std',225,340,-1.57,{lens:24,fov:74,framing:'Wide',support:'Tripod',shotId:'e1a'}),
    C('cam_std',110,120,0.5,{lens:85,fov:24,framing:'Close-up',support:'Slider',shotId:'e1b'}),
    P('ledpanel',400,40,2.4), P('bounce',60,330,0)];
  s1.sun = {on:true, x:225, y:-120, hour:7};
  // scene 2 — kitchen (ground floor)
  const s2 = TPL.scene(2,'2','INT. KITCHEN — MORNING','Kitchen',75);
  s2.script = 'Sun on the worktop. Sam pours oat milk into a glass — the pour is the hero. Bare feet, radio on low.';
  s2.walls = [W(0,0,600,0,[{t:.3,w:160,type:'window'},{t:.75,w:160,type:'window'}]), W(600,0,600,450), W(600,450,0,450,[{t:.2,w:90,type:'door'}]), W(0,450,0,0,[{t:.5,w:100,type:'gap'}])];
  s2.shots = [{id:'e2a',name:'2A'},{id:'e2b',name:'2B'}];
  s2.objects = [P('kitchen_l',150,80,0), P('island',330,240,0), P('fridge',560,60,0), P('chair',330,340,0), P('plant',560,400,0),
    A('actor',330,170,Math.PI,'Sam'),
    C('cam_gimbal',330,400,-1.57,{lens:35,fov:54,framing:'Medium',support:'Gimbal',shotId:'e2a',path:[{x:230,y:400,rot:-1.35},{x:430,y:400,rot:-1.8}]}),
    C('cam_std',330,240,-1.57,{lens:50,fov:40,framing:'Top shot',support:'Jib',shotId:'e2b'}),
    P('ledpanel',60,400,0.8), P('negfill',560,300,0), P('reflector',120,300,0.4)];
  s2.sun = {on:true, x:300, y:-130, hour:9};
  // scene 3 — street
  const s3 = TPL.scene(3,'3','EXT. STREET — MORNING','Street',45);
  s3.script = 'Front door opens. Sam steps out with the glass, breathes, sits on the stoop. The city wakes around them. Pack shot on the step.';
  s3.shots = [{id:'e3a',name:'3A'}];
  s3.objects = [P('road',400,420,0), P('bikelane',400,300,0), P('tree',80,60,0), P('tree',720,60,0), P('car',650,420,0,'Parked car'), P('bicycle',200,300,0.3),
    A('actor',400,150,1.57,'Sam'), A('actor_extra',150,300,0,'Cyclist'),
    C('cam_steadi',400,330,-1.57,{lens:35,fov:54,framing:'Full shot',support:'Steadicam',shotId:'e3a',path:[{x:250,y:330,rot:-1.2},{x:400,y:250,rot:-1.57}]}),
    P('reflector',520,120,2.6), P('hmi',700,220,2.6)];
  s3.sun = {on:true, x:60, y:-80, hour:10};
  p.scenes = [s1, s2, s3]; p.activeSceneId = s2.id;

  // script floor
  const sb = TPL.board('Script & storyboard');
  sb.objects.push(TPL.av(0,0,'Haver — 15" TV / online', [
    {no:'1',video:'Dawn. Sam wakes, reaches, switches the alarm off — before it rings.',audio:'Room tone. A bird.',dur:'3',notes:'1A wide, then 1B on the hand'},
    {no:'1',video:'Close: the hand rests. A small smile.',audio:'Soft piano starts.',dur:'2',notes:'1B, 85 mm'},
    {no:'2',video:'Kitchen, sun. Oat milk pours into the glass — slow, thick, the hero shot.',audio:'Pour. Radio, barely.',dur:'4',notes:'2A gimbal move; 2B top shot for the pour'},
    {no:'3',video:'Front door. Sam sits on the stoop with the glass; the street wakes.',audio:'City ambience up.',dur:'4',notes:'3A steadicam, one take'},
    {no:'3',video:'Pack shot on the step. HAVER — slow mornings.',audio:'VO: "Haver. Take the morning."',dur:'2',notes:'Locked off, product in focus'}], true));
  sb.objects.push({id:uid(),cat:'script',kind:'script',x:-560,y:0,rot:0,w:460,h:420,title:'Haver — director’s notes',text:'One character, one glass, one morning.\n\nWe never see the product before the pour. The pour is the only slow-motion shot (100 fps). Everything else is calm, real time, natural light plus a soft key.\n\nCasting: Sam is 28–35, not a model. Wardrobe: worn linen, no logos.',mode:'film',label:'',path:[]});
  p.scriptboard = sb;
  // mood
  tplMood(p, 'Haver — slow mornings', [['Natural light, one soft key, no fill above 20%', PAL.sand],['Palette: oat, linen, morning blue', PAL.sky],['Sound: rooms first, music late', PAL.teal]]);
  p.moodboard.objects.push(TPL.text(-260,-240,'15 seconds · 5 shots · 3 locations · 1 day',15,false));
  // shot list
  const sl = TPL.board('Shot list');
  const day = {id:uid(),cat:'avscript',kind:'avscript',mode:'shotlist',x:0,y:0,rot:0,w:900,h:150,color:PAL.coral,cols:{no:true,still:false,notes:true},rows:[],day:{name:'Shoot day',date:'',call:'06:30'}};
  const row = (s, cam, sh, dur, video, audio, notes)=>({id:uid(), key:s.id + '|' + cam.id, no:s.scene, shot:sh, dur:String(dur), cam:[CAMS[cam.kind].name, cam.framing, cam.lens + 'mm', cam.support].filter(Boolean).join(' · '), camAuto:[CAMS[cam.kind].name, cam.framing, cam.lens + 'mm', cam.support].filter(Boolean).join(' · '), video, audio, notes, imgs:[]});
  const cams = s=>s.objects.filter(o=>o.cat === 'camera');
  day.rows.push(row(s1, cams(s1)[0], '1A', 30, 'Wake, reach for the alarm', 'Room tone', 'Real dawn light 07:00–07:30 — be ready at 06:45'));
  day.rows.push(row(s1, cams(s1)[1], '1B', 25, 'Hand rests, smile', 'Piano in', ''));
  day.rows.push({id:uid(),block:'move',no:'',shot:'',dur:'15',cam:'',video:'Downstairs to the kitchen',audio:'',notes:'',imgs:[],label:'Company move'});
  day.rows.push({id:uid(),block:'setup',no:'',shot:'',dur:'45',cam:'',video:'Kitchen key + jib build',audio:'',notes:'',imgs:[],label:'Setup / build'});
  day.rows.push(row(s2, cams(s2)[0], '2A', 40, 'Pour, gimbal push', 'Pour, radio', '100 fps for the pour'));
  day.rows.push(row(s2, cams(s2)[1], '2B', 30, 'Top shot on the glass', '', 'Product styling: wipe the glass between takes'));
  day.rows.push({id:uid(),block:'break',no:'',shot:'',dur:'30',cam:'',video:'Lunch',audio:'',notes:'',imgs:[],label:'Break'});
  day.rows.push(row(s3, cams(s3)[0], '3A', 45, 'Door opens, sits on the stoop', 'City up', 'Traffic: PA holds the bike lane'));
  sl.objects.push(day);
  p.shotboard = sl;
  // production
  tplProdBoard(p, {cast:true, client:true});
  const dh = p.prodboard.objects.find(o=>o.cat === 'dayheader'); dh.call = '06:30'; dh.shootCall = '07:00'; dh.wrap = '15:00'; dh.locIds = [p.production.locations[0].id];
  p.prodboard.objects.find(o=>o.cat === 'fieldcard').locId = p.production.locations[0].id;
  const pl = p.prodboard.objects.find(o=>o.cat === 'proplist');
  pl.props = {[s1.id]:[{id:uid(),name:'Alarm clock (analogue)',done:true},{id:uid(),name:'Linen bedding, oat colour',done:false}], [s2.id]:[{id:uid(),name:'Haver cartons ×6 (hero + backups)',done:false},{id:uid(),name:'Glasses ×4, identical',done:false},{id:uid(),name:'Radio (practical)',done:false}], [s3.id]:[{id:uid(),name:'Haver carton for the pack shot',done:false}]};
  p.production.people = TPL.people([
    ['crew','Director','',  '06:30','',''],['crew','DoP','','06:30','',''],['crew','Gaffer','','06:00','',''],['crew','Sound','','07:00','',''],['crew','Producer / PA','','06:00','',''],
    ['cast','Sam','', '06:45','',''],['client','Brand manager, Haver','','09:00','','']]);
  // budget
  tplBudget(p);
  const rates = {'Brainstorm · research · script':1500,'Shot list · storyboard · script walk-through':800,'Production · contacts · admin':900,'Location scouting':400,'Casting / booking actors':600,'Director':1200,'Director of photography':1000,'Focus puller / 1st AC':550,'Gaffer + best boy (light)':1200,'Producer / production manager':600,'Sound recordist (incl. recording kit)':650,'Camera package (cameras, lenses, tripod, gimbal)':1400,'Light package + van':900,'Editing (feedback rounds, incl. director edit day)':1800,'Colour grading':700,'Audio mix / sound design':600,'Location fee':750,'Actor fees / buy-out':1500,'Catering':180};
  for(const it of p.budget.items) if(rates[it.name] != null) it.rate = rates[it.name];
  p.budget.target = {pre:4500, prod:9500, post:3500};
  return p;
}

// ---------------------------------------------------------------- create & open
async function createProductionFromData(data, indexName){
  await flushSave();
  const id = uid();
  await window.storage.set('sd:project:' + id, JSON.stringify(data));
  const idx2 = (await loadProjectIndex()) || [];
  idx2.push({id, name:indexName || data.shootName || 'Untitled production', updated:Date.now()});
  await saveProjectIndex(idx2);
  await window.storage.set('sd:current', id);
  location.reload();
}
function newProductionOverlay(){
  const el = document.createElement('div');
  el.className = 'fb-ov';
  el.innerHTML = '<div class="fb-ov-box" style="width:640px"><div class="fb-ov-title">New production</div>' +
    '<div class="fb-ov-sub">Give it a name and pick a starting point. A template lays the right tools out on every floor, empty — nothing you cannot change later.</div>' +
    '<input id="npName" class="fb-inp" placeholder="Production name (client — title)" style="margin-bottom:12px">' +
    '<div class="tpl-grid">' +
      '<button class="tpl on" data-key="blank"><b>Blank</b><span>One empty scene, nothing else. The way it always was.</span></button>' +
      TEMPLATES.map(t=>'<button class="tpl" data-key="' + t.key + '"><b>' + esc(t.name) + '</b><span>' + esc(t.blurb) + '</span></button>').join('') +
    '</div>' +
    '<div class="tpl-example"><div><b>Or open the example first</b><span>“Haver — 15" commercial”: five shots in a bedroom, a kitchen and the street, one shoot day, with AV script, shot list, prop list, call sheet and budget filled in. Poke around, then start your own.</span></div><button class="btn" id="npExample">Open example</button></div>' +
    '<div class="fb-ov-actions"><button class="btn" id="npNo">Cancel</button><span style="flex:1"></span><button class="btn primary" id="npGo">Create production</button></div></div>';
  document.body.appendChild(el);
  el.addEventListener('keydown', e=>e.stopPropagation());
  el.querySelector('#npNo').addEventListener('click', ()=>el.remove());
  el.addEventListener('click', e=>{ if(e.target === el) el.remove(); });
  let key = 'blank';
  el.querySelectorAll('.tpl').forEach(b=>b.addEventListener('click', ()=>{ key = b.dataset.key; el.querySelectorAll('.tpl').forEach(x=>x.classList.toggle('on', x === b)); }));
  el.querySelector('#npName').focus();
  el.querySelector('#npGo').addEventListener('click', async ()=>{
    const name = el.querySelector('#npName').value.trim();
    const p = tplBlank(name);
    const t = TEMPLATES.find(x=>x.key === key);
    if(t) t.build(p, name);
    el.querySelector('#npGo').textContent = 'Creating…';
    await createProductionFromData(p, name || (t ? t.name : 'Untitled production'));
  });
  el.querySelector('#npExample').addEventListener('click', async ()=>{
    el.querySelector('#npExample').textContent = 'Opening…';
    const p = await buildExampleProject();
    await createProductionFromData(p, p.shootName);
  });
}
