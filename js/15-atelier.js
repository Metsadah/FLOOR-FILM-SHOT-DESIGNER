// Floorboard — 15-atelier.js · the "floor plan in a minute" room
// One scene, shared by the landing page (landing/howto.js animates it step by
// step: walls, openings, set dressing, cast + cameras + lens, the blocking)
// and by the example production "Atelier" (14-templates.js turns it into a
// real, editable scene). Units are centimetres, y down, walls listed
// clockwise on screen so the interior is to the right of every wall.
// Change the room here and both follow. w/h are spelled out so the landing
// page can draw without the catalogue.
const ATELIER = {
  name:'Atelier — living room with kitchen nook',
  script:'Anna comes in from the hall, crosses the room and joins Bram on the sofa. One wide from the tripod, one dolly move that follows her across.',
  // [x1, y1, x2, y2, openings]  · t = position along the wall, w in cm
  walls:[
    [0,0,880,0,[{t:.2,w:200,type:'window'},{t:.55,w:180,type:'window'}]],
    [880,0,880,300,[{t:.5,w:90,type:'door',flip:true}]],
    [880,300,600,300,[]],
    [600,300,600,560,[{t:.35,w:90,type:'door',flip:true}]],
    [600,560,0,560,[]],
    [0,560,0,0,[{t:.5,w:160,type:'window'}]],
  ],
  props:[
    {kind:'kitchen',     x:730, y:40,  rot:0,           w:240, h:65,  label:'Kitchen'},
    {kind:'fridge',      x:845, y:240, rot:0,           w:70,  h:70},
    {kind:'table',       x:300, y:175, rot:0,           w:140, h:80},
    {kind:'chair',       x:255, y:115, rot:Math.PI,     w:45,  h:45},
    {kind:'chair',       x:345, y:115, rot:Math.PI,     w:45,  h:45},
    {kind:'chair',       x:255, y:235, rot:0,           w:45,  h:45},
    {kind:'chair',       x:345, y:235, rot:0,           w:45,  h:45},
    {kind:'bookcase',    x:20,  y:95,  rot:Math.PI/2,   w:130, h:34,  label:'Books'},
    {kind:'rug',         x:410, y:445, rot:0,           w:200, h:140},
    {kind:'sofa_corner', x:180, y:430, rot:0,           w:280, h:200, label:'Corner sofa'},
    {kind:'smalltable',  x:420, y:445, rot:0,           w:55,  h:55,  label:'Coffee table'},
    {kind:'tvunit',      x:450, y:537, rot:0,           w:160, h:45,  label:'TV'},
    {kind:'floorlamp',   x:350, y:345, rot:0,           w:45,  h:45},
    {kind:'plant',       x:570, y:530, rot:0,           w:50,  h:50},
  ],
  actors:[
    {kind:'actor',     x:830, y:150, rot:Math.PI, label:'Anna', path:[{x:650,y:230},{x:500,y:320},{x:360,y:400}]},
    {kind:'actor_ant', x:120, y:470, rot:-0.5,    label:'Bram'},
  ],
  cams:[
    {kind:'cam_std', shot:'A', x:575, y:518, rot:-2.93, lens:35, fov:39, framing:'Wide',   support:'Tripod'},
    // the dolly rides along the windows, three to four metres from Anna, and pans with her
    {kind:'cam_std', shot:'B', x:560, y:45, rot:0.37,  lens:50, fov:28, framing:'Medium', support:'Dolly', path:[{x:120,y:45,rot:1.0}]},
  ],
  // the dolly track: a polyline the camera B rides along
  track:{pts:[{x:90,y:45},{x:590,y:45}]},
  lights:[
    {kind:'kino',     x:545, y:462, rot:-2.35,      w:120, h:35, label:'Kino fill'},
    {kind:'bounce',   x:70,  y:290, rot:Math.PI/2,  w:120, h:15, label:'Bounce'},
    {kind:'bounce',   x:700, y:285, rot:0,          w:120, h:15, label:'Bounce'},
    {kind:'hmi',      x:109, y:-60, rot:0.73,       w:55,  h:55, label:'HMI as sun'},
  ],
  // afternoon sun from the top left: it falls through the two north windows and the west window
  sun:{on:true, x:-30, y:-140, hour:15},
  // the lens picker moment on the landing page: which lenses get tried before A settles
  lensTry:[24, 50, 35],
};
if(typeof window !== 'undefined') window.ATELIER = ATELIER;
