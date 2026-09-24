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
    {kind:'table',       x:300, y:140, rot:0,           w:140, h:80,  label:'Dining table'},
    {kind:'chair',       x:255, y:80,  rot:Math.PI,     w:45,  h:45},
    {kind:'chair',       x:345, y:80,  rot:Math.PI,     w:45,  h:45},
    {kind:'chair',       x:255, y:200, rot:0,           w:45,  h:45},
    {kind:'chair',       x:345, y:200, rot:0,           w:45,  h:45},
    {kind:'bookcase',    x:20,  y:95,  rot:Math.PI/2,   w:130, h:34,  label:'Books'},
    {kind:'rug',         x:410, y:445, rot:0,           w:200, h:140},
    {kind:'sofa_corner', x:180, y:430, rot:0,           w:280, h:200, label:'Corner sofa'},
    {kind:'smalltable',  x:420, y:445, rot:0,           w:55,  h:55,  label:'Coffee table'},
    {kind:'tvunit',      x:450, y:537, rot:0,           w:160, h:45,  label:'TV'},
    {kind:'floorlamp',   x:350, y:345, rot:0,           w:45,  h:45},
    {kind:'plant',       x:570, y:530, rot:0,           w:50,  h:50},
  ],
  actors:[
    {kind:'actor',     x:830, y:150, rot:Math.PI, label:'Anna', path:[{x:700,y:200},{x:470,y:300},{x:440,y:395}]},
    {kind:'actor_ant', x:120, y:470, rot:-0.5,    label:'Bram'},
  ],
  cams:[
    {kind:'cam_std', shot:'A', x:565, y:500, rot:-2.96, lens:35, fov:39, framing:'Wide',   support:'Tripod'},
    {kind:'cam_std', shot:'B', x:140, y:270, rot:1.15,  lens:50, fov:28, framing:'Medium', support:'Dolly', path:[{x:540,y:270,rot:2.0}]},
  ],
  // the dolly track: a polyline the camera B rides along
  track:{pts:[{x:110,y:270},{x:570,y:270}]},
  lights:[
    {kind:'ledpanel', x:480, y:335, rot:2.4,       w:65,  h:40, label:'LED key'},
    {kind:'bounce',   x:70,  y:290, rot:Math.PI/2, w:120, h:15},
    {kind:'hmi',      x:176, y:-70, rot:Math.PI/2, w:55,  h:55, label:'HMI as sun'},
  ],
  sun:{on:true, x:176, y:-160, hour:15},
  // the lens picker moment on the landing page: which lenses get tried before A settles
  lensTry:[24, 50, 35],
};
if(typeof window !== 'undefined') window.ATELIER = ATELIER;
