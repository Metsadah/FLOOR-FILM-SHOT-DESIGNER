// Floorboard — 14-templates.js · new productions: templates and the example
// A template lays the tools out per floor for a kind of job (commercial,
// brand film, documentary, fiction, music video, socials) — empty, ready to
// fill in. The examples are finished productions — a fictional 15-second
// commercial, two real Zoutwater productions and the landing page's room —
// so a new user sees how the floors connect and has something to change.
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

// ---------------------------------------------------------------- more examples
// stills for the real productions come from the landing page's own images;
// offline (or on a self-host without landing/img) the boards simply have no stills
async function tplStill(file){
  try{
    const r = await fetch('landing/img/' + file);
    if(!r.ok) return null;
    const bl = await r.blob();
    return await storeImageFile(new File([bl], file, {type:bl.type || 'image/jpeg'}));
  }catch(_){ return null; }
}
function tplImg(id, x, y, w, caption){
  const im = imgCache[id];
  const ar = im && im.naturalWidth ? im.naturalHeight / im.naturalWidth : .5625;
  return {id:uid(), cat:'image', kind:'image', imgId:id, x, y, rot:0, w, h:w * ar, color:'#5B6472', label:'', caption:caption || '', path:[]};
}
function tplCamText(cam){ return [CAMS[cam.kind].name, cam.framing, cam.lens ? cam.lens + 'mm' : '', cam.support].filter(Boolean).join(' · '); }
function tplSlRow(s, cam, sh, dur, video, audio, notes){
  return {id:uid(), key:s.id + '|' + cam.id, no:String(s.scene), shot:sh, dur:String(dur), cam:tplCamText(cam), camAuto:tplCamText(cam), video:video || '', audio:audio || '', notes:notes || '', imgs:[]};
}
function tplSlBlock(kind, what, dur){
  return {id:uid(), block:kind, no:'', shot:'', dur:String(dur), cam:'', video:what, audio:'', notes:'', imgs:[], label:(SL_BLOCKS[kind] || ['Block'])[0]};
}
function tplDayCard(name, date, call, rows, y){
  return {id:uid(), cat:'avscript', kind:'avscript', mode:'shotlist', x:0, y:y || 0, rot:0, w:900, h:150, color:PAL.coral, cols:{no:true, still:false, notes:true}, rows, day:{name, date:date || '', call:call || '08:00'}};
}
const tplCams = s=>s.objects.filter(o=>o.cat === 'camera');

// Velderhof — TV commercial 2024 (Zoutwater). A 65th birthday; five armchairs
// with red bows. Credits as on zoutwater.com.
async function buildVelderhofProject(){
  const p = tplBlank('Velderhof — TV commercial 2024');
  const {wall:W, prop:P, actor:A, cam:C} = TPL;
  p.production.company = 'Zoutwater Films';
  p.production.locations = [{id:uid(), name:'Living room — birthday house', street:'', town:'', notes:'Garden window on the north side: HMI outside as afternoon sun. Confetti reset between takes.', contact:'', phone:''}];
  const v1 = TPL.scene(1, '1', 'INT. LIVING ROOM — BIRTHDAY PARTY', 'Living room', 240);
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
  p.scenes = [v1]; p.activeSceneId = v1.id;
  // mood — the real stills
  const ids = []; for(let i = 1; i <= 6; i++) ids.push(await tplStill('velderhof-' + i + '.jpg'));
  const vm = TPL.board('Mood & inspiration');
  vm.objects.push(TPL.text(-320,-330,'VELDERHOF — “Bij Velderhof geeft dat helemaal niet”',26,true));
  const vcap = ['Party, bunting, warm practicals','Cake, bubbles, hero props','Five chairs with bows','The reveal','Gift moment','Pack shot'];
  ids.forEach((id, i)=>{ if(id) vm.objects.push(tplImg(id, -330 + (i % 3) * 340, -150 + Math.floor(i / 3) * 230, 320, vcap[i])); else vm.objects.push(TPL.note(-330 + (i % 3) * 340, -150 + Math.floor(i / 3) * 230, vcap[i], PAL.sand, 320, 180)); });
  vm.objects.push(TPL.note(760,-160,'Warm, cheerful, late-afternoon sun through the garden window. Confetti on every take — reset budget!',PAL.sand,230,130));
  vm.objects.push(TPL.colcard(760,20,'Look','Practicals on, HMI outside as sun, soft key from the room. Super 35, 24 / 35 / 85.', '#3E9B6E'));
  p.moodboard = vm;
  // script
  const sb = TPL.board('Script & storyboard');
  sb.objects.push(TPL.av(0,0,'Velderhof — 30" TV', [
    {no:'1',video:'Party in full swing. Hands over eyes — a surprise.',audio:'Laughter, party ambience.',dur:'4',notes:'A wide, then B in the crowd'},
    {no:'1',video:'Willeke hands over the gift. The friend unwraps: a chair. Polite smile.',audio:'“Ohh… wat leuk.”',dur:'6',notes:'C 85 mm on the face'},
    {no:'1',video:'Reveal: five armchairs with red bows fill the room.',audio:'Music lifts.',dur:'6',notes:'B gimbal move around the chairs'},
    {no:'1',video:'She tries them, one after another. Everyone cheers.',audio:'VO: “Bij Velderhof geeft dat helemaal niet…”',dur:'8',notes:'Confetti reset between takes'},
    {no:'1',video:'Pack shot: Velderhof · 1 2 3 zitten.',audio:'VO: “…de perfecte stoel zit er altijd tussen.”',dur:'6',notes:'Locked off'}], true));
  p.scriptboard = sb;
  // shot list
  const cams = tplCams(v1);
  const rows = [tplSlRow(v1, cams[0], 'A', 40, 'Party wide, hands over eyes', 'Party ambience', 'Bunting + confetti dressed by 07:00'),
    tplSlBlock('setup', 'Confetti + bows reset', 20),
    tplSlRow(v1, cams[1], 'B', 60, 'Gimbal move around the five chairs', 'Music', 'Two passes, chairs 1–5'),
    tplSlBlock('break', 'Lunch', 45),
    tplSlRow(v1, cams[2], 'C', 45, 'Faces: the gift, the polite smile', '“Ohh… wat leuk.”', '85 mm, eyeline just off lens')];
  const sl = TPL.board('Shot list'); sl.objects.push(tplDayCard('Shoot day', '2024-02-12', '07:30', rows)); p.shotboard = sl;
  // production
  tplProdBoard(p, {cast:true, client:true});
  const dh = p.prodboard.objects.find(o=>o.cat === 'dayheader'); dh.call = '07:30'; dh.shootCall = '08:30'; dh.wrap = '18:00'; dh.locIds = [p.production.locations[0].id];
  p.prodboard.objects.find(o=>o.cat === 'fieldcard').locId = p.production.locations[0].id;
  p.production.people = TPL.people([
    ['crew','Producer','Jan-Peter Boer','07:00','',''],['crew','Director','Kees-Jan Mulder','07:30','',''],['crew','Cinematography & edit','Gerbert Floor','07:00','',''],['crew','Script','Wicher Schuurman','','',''],['crew','Art direction','Floortje Mols','06:30','',''],
    ['cast','Willeke','Willeke Alberti','09:00','',''],['client','Velderhof','','10:00','','']]);
  tplBudget(p);
  return p;
}

// Nudes — Dan moet je wat voor me doen (fiction short, Zoutwater)
async function buildNudesProject(){
  const p = tplBlank('Nudes — Dan moet je wat voor me doen');
  const {wall:W, prop:P, actor:A, cam:C} = TPL;
  p.production.company = 'Zoutwater Films';
  p.production.locations = [{id:uid(), name:'Secondary school', street:'', town:'', notes:'Classroom with bookcases and big windows; teachers’ room across the corridor. Shoot on a study day — no pupils in the building.', contact:'', phone:''}];
  const n1 = TPL.scene(1, '1', 'INT. CLASSROOM — DAY', 'Classroom', 180);
  n1.script = 'Bookcases along the wall, big windows. A class works in silence; phones under the tables. One girl looks up.';
  n1.walls = [W(0,0,800,0,[{t:.3,w:220,type:'window'},{t:.72,w:220,type:'window'}]), W(800,0,800,560,[{t:.85,w:90,type:'door'}]), W(800,560,0,560), W(0,560,0,0)];
  n1.shots = [{id:'n1a',name:'1A'},{id:'n1b',name:'1B'}];
  n1.objects = [P('bookcase',20,280,1.57), P('bookcase',20,120,1.57)];
  for(let r = 0; r < 2; r++) for(let cc = 0; cc < 4; cc++){ n1.objects.push(P('desk',200 + cc*140, 180 + r*150, 0)); n1.objects.push(P('chair',200 + cc*140, 240 + r*150, Math.PI)); }
  n1.objects.push(P('desk',680,480,0,'Teacher'), P('chair',680,430,0));
  n1.objects.push(A('actor',340,240,Math.PI,'Fleur'), A('actor_ant',480,390,Math.PI,'Lisa'), A('actor_extra',200,240,Math.PI), A('actor_extra',620,240,Math.PI), A('actor_extra',200,390,Math.PI), A('actor_extra',620,390,Math.PI), A('actor',700,470,0,'Teacher'));
  n1.objects.push(C('cam_std',120,520,-0.9,{lens:32,fov:57,framing:'Wide',support:'Tripod',shotId:'n1a',sensor:'s35'}), C('cam_std',560,520,-1.9,{lens:85,fov:24,framing:'Close-up',support:'Tripod',shotId:'n1b',sensor:'s35'}));
  n1.objects.push(P('negfill',780,300,0), P('bounce',60,480,0));
  n1.sun = {on:true, x:400, y:-140, hour:10};
  const n2 = TPL.scene(2, '2', 'INT. TEACHERS’ ROOM — DAY', 'Teachers’ room', 240);
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
  p.scenes = [n1, n2]; p.activeSceneId = n2.id;
  const ids = []; for(let i = 1; i <= 6; i++) ids.push(await tplStill('nudes-' + i + '.jpg'));
  const nm = TPL.board('Mood & inspiration');
  nm.objects.push(TPL.text(-320,-330,'NUDES — Dan moet je wat voor me doen',26,true));
  const ncap = ['Phones, chats, 00:34','Classroom, window light','Face to face','Waiting outside','Corridor','Close, quiet'];
  ids.forEach((id, i)=>{ if(id) nm.objects.push(tplImg(id, -330 + (i % 3) * 340, -150 + Math.floor(i / 3) * 230, 320, ncap[i])); else nm.objects.push(TPL.note(-330 + (i % 3) * 340, -150 + Math.floor(i / 3) * 230, ncap[i], PAL.sky, 320, 180)); });
  nm.objects.push(TPL.note(760,-160,'Daylight only where we can. Long lenses, shallow, faces. No music in the conversations.',PAL.sky,230,130));
  nm.objects.push(TPL.colcard(760,20,'Do / don’t','Do: stay with the listener.\nDon’t: cut on every line.', PAL.coral));
  p.moodboard = nm;
  const sb = TPL.board('Script & storyboard');
  sb.objects.push({id:uid(),cat:'script',kind:'script',x:-300,y:0,rot:0,w:520,h:480,title:'Nudes — breakdown',text:'INT. CLASSROOM — DAY\n\nA class works in silence. Phones under the tables. Fleur looks up from her book.\n\nINT. TEACHERS’ ROOM — DAY\n\nOne table, two chairs. The teacher and Lisa, face to face. Long pauses.\n\nINT. CORRIDOR — DAY\n\nPupils wait on the bench outside. Nobody talks.\n\nINT. TEACHERS’ ROOM — LATER\n\nThe second conversation. What happened, and whether anyone was made to.',mode:'film',label:'',path:[]});
  sb.objects.push(TPL.note(320,-200,'Selected for Cinekid, Shortcutz Amsterdam and Student World Impact Festival.',PAL.sand,230,110));
  p.scriptboard = sb;
  const c1 = tplCams(n1), c2 = tplCams(n2);
  const sl = TPL.board('Shot list');
  sl.objects.push(tplDayCard('Day 1 — classroom', '', '08:00', [
    tplSlRow(n1, c1[0], '1A', 60, 'The class in silence, phones under the tables', 'Room tone, pens', 'Window light only — shoot before noon'),
    tplSlRow(n1, c1[1], '1B', 45, 'Fleur looks up', 'Silence', '85 mm, hold on her'),
    tplSlBlock('move', 'Across the corridor to the teachers’ room', 20)]));
  sl.objects.push(tplDayCard('Day 2 — teachers’ room', '', '08:00', [
    tplSlBlock('setup', 'Two-shot and both over-shoulders, one light setup', 40),
    tplSlRow(n2, c2[2], '2C', 30, 'Two-shot, the whole conversation', 'Dialogue', 'Full takes, no cuts'),
    tplSlRow(n2, c2[0], '2A', 60, 'Over the teacher onto Lisa', 'Dialogue', 'Stay with the listener'),
    tplSlRow(n2, c2[1], '2B', 60, 'Over Lisa onto the teacher', 'Dialogue', '')], 420));
  p.shotboard = sl;
  tplProdBoard(p, {cast:true, client:false});
  const dh = p.prodboard.objects.find(o=>o.cat === 'dayheader'); dh.call = '08:00'; dh.shootCall = '09:00'; dh.wrap = '18:00'; dh.locIds = [p.production.locations[0].id];
  p.prodboard.objects.find(o=>o.cat === 'fieldcard').locId = p.production.locations[0].id;
  p.production.people = TPL.people([
    ['crew','Director & writer','Kees-Jan Mulder','08:00','',''],['crew','Director & writer','Gerbert Floor','08:00','',''],['crew','Director, writer & producer','Robert Pruis','07:30','',''],['crew','Cinematography','Gerbert Floor','07:30','',''],
    ['cast','Fleur','','09:00','',''],['cast','Lisa','','09:00','',''],['cast','Teacher','','09:00','','']]);
  tplBudget(p);
  return p;
}

// Atelier — the room the landing page animates (js/15-atelier.js)
async function buildAtelierProject(){
  const D = window.ATELIER;
  const p = tplBlank('Atelier — floor plan in a minute');
  const {wall:W, prop:P, actor:A, cam:C} = TPL;
  const s = TPL.scene(1, '1', 'INT. ATELIER — DAY', D.name, 90);
  s.script = D.script;
  s.walls = D.walls.map(w=>W(w[0], w[1], w[2], w[3], w[4]));
  s.shots = D.cams.map(cm=>({id:'at' + cm.shot.toLowerCase(), name:cm.shot}));
  s.objects = [];
  for(const pr of D.props.concat(D.lights)){
    const o = P(PROPS[pr.kind] ? pr.kind : 'crate', pr.x, pr.y, pr.rot || 0, pr.label);
    if(pr.w) o.w = pr.w; if(pr.h) o.h = pr.h;
    s.objects.push(o);
  }
  if(D.track){
    const pts = D.track.pts.map(q=>({x:q.x, y:q.y}));
    s.objects.push({id:uid(), cat:'prop', kind:'track', x:(pts[0].x + pts[pts.length - 1].x) / 2, y:(pts[0].y + pts[pts.length - 1].y) / 2, rot:0, w:30, h:30, color:'#5B6472', label:'', path:[], pts});
  }
  for(const a of D.actors){
    const o = A(ACTORS[a.kind] ? a.kind : 'actor', a.x, a.y, a.rot || 0, a.label);
    o.path = (a.path || []).map(q=>({x:q.x, y:q.y}));
    s.objects.push(o);
  }
  for(const cm of D.cams)
    s.objects.push(C(CAMS[cm.kind] ? cm.kind : 'cam_std', cm.x, cm.y, cm.rot, {lens:cm.lens, fov:cm.fov, framing:cm.framing, support:cm.support, sensor:'s35', shotId:'at' + cm.shot.toLowerCase(), path:(cm.path || []).map(q=>({x:q.x, y:q.y, rot:q.rot}))}));
  s.sun = Object.assign({}, D.sun);
  p.scenes = [s]; p.activeSceneId = s.id;
  const sb = TPL.board('Script & storyboard');
  sb.objects.push(TPL.av(0,0,'Atelier — the scene', [
    {no:'1',video:'Anna comes in from the hall, crosses the room.',audio:'Door. Footsteps on wood.',dur:'6',notes:'B follows her on the dolly'},
    {no:'1',video:'She joins Bram on the sofa.',audio:'“Zo. Daar ben ik.”',dur:'4',notes:'A wide, 35 mm'}], true));
  sb.objects.push(TPL.note(600,-160,'This is the room from the landing page (“A floor plan in a minute”). Change the walls, the furniture or the dolly move on the 2nd floor — it is yours.',PAL.lilac,240,130));
  p.scriptboard = sb;
  tplMood(p, 'Atelier — a floor plan in a minute', [['Walls, doors and windows to scale', PAL.sky],['Set dressing with real sizes', PAL.sand],['Cast, cameras, lens, light — then the blocking', PAL.teal]]);
  const cams = tplCams(s);
  const sl = TPL.board('Shot list');
  sl.objects.push(tplDayCard('Shoot day', '', '08:00', [tplSlRow(s, cams[1], 'B', 60, 'Dolly follows Anna across the room', 'Door, footsteps', 'Two rehearsals for the pull'), tplSlRow(s, cams[0], 'A', 30, 'Wide: she joins Bram on the sofa', 'Dialogue', '')]));
  p.shotboard = sl;
  tplProdBoard(p, {cast:true, client:false});
  return p;
}

const EXAMPLES = [
  {key:'haver', name:'Haver — 15" commercial', kind:'Commercial · fictional brand', blurb:'Five shots in a bedroom, a kitchen and the street, one shoot day. AV script, shot list, prop list, call sheet and budget filled in.', build:buildExampleProject},
  {key:'velderhof', name:'Velderhof — TV commercial 2024', kind:'Commercial · real production by Zoutwater', blurb:'A 65th birthday and five armchairs with red bows. Living room on Super 35 with a gimbal move; the finished spot’s stills on the mood board.', build:buildVelderhofProject},
  {key:'nudes', name:'Nudes — Dan moet je wat voor me doen', kind:'Fiction short · real production by Zoutwater', blurb:'A classroom and a teachers’ room: two over-shoulders and a two-shot on 50 mm, two shoot days, breakdown and the real stills.', build:buildNudesProject},
  {key:'atelier', name:'Atelier — floor plan in a minute', kind:'The room from the landing page', blurb:'L-shaped living room with a kitchen nook, corner sofa, a tripod wide and a dolly shot that follows Anna across. Edit it here.', build:buildAtelierProject},
];
async function openExample(ex, btn){
  if(btn) btn.textContent = 'Opening…';
  try{
    const p = await ex.build();
    await createProductionFromData(p, p.shootName);
  }catch(e){
    console.error(e); toast('Could not build the example — ' + (e && e.message || e));
    if(btn) btn.textContent = 'Open';
  }
}
// landing.html links straight to an example: index.html?example=velderhof
function openExampleFromURL(){
  const q = new URLSearchParams(location.search);
  const ex = EXAMPLES.find(e=>e.key === q.get('example'));
  if(!ex) return;
  q.delete('example');
  history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  if(window.FLOOR_BILLING && typeof FLOOR_BILLING.canCreate === 'function' && !FLOOR_BILLING.canCreate()){
    if(typeof FLOOR_BILLING.gate === 'function') FLOOR_BILLING.gate();
    return;
  }
  toast('Building “' + ex.name + '”…');
  openExample(ex, null);
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
    '<div class="tpl-examples"><div class="tpl-exhead"><b>Or open an example first</b><span>Finished productions to poke around in — every one of them becomes yours to change.</span></div>' +
      EXAMPLES.map(e=>'<div class="tpl-ex"><div><b>' + esc(e.name) + '</b><i>' + esc(e.kind) + '</i><span>' + esc(e.blurb) + '</span></div><button class="btn" data-ex="' + e.key + '">Open</button></div>').join('') +
    '</div>' +
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
  el.querySelectorAll('[data-ex]').forEach(b=>b.addEventListener('click', ()=>openExample(EXAMPLES.find(e=>e.key === b.dataset.ex), b)));
}
