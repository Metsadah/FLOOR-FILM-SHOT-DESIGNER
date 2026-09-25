// Floorboard — 16-tour.js · a short guided tour for new users
// Coach marks: the page dims, one control is lit, a card explains it. Eight
// stops: the floors, the production switcher, the library, the canvas, share,
// help. Starts once per device after the first load (localStorage
// floorTourDone), restarts from the help panel ("Take the tour") or via
// startTour(). Read-only and view-only sessions never get it.
'use strict';

const TOUR_STEPS = [
  {sel:'#tabbar', tab:'mood', title:'Six floors, one production',
   text:'Every department gets its own floor: Mood, Script, Shot designer, Shot list, Budget and Production. They all stand on the same plan — change a camera on the 2nd floor and the shot list on the 3rd knows.'},
  {sel:'#tabbar button[data-tab="mood"]', tab:'mood', title:'Ground floor · Mood',
   text:'Start with the feeling. Drop references, stills, GIFs, video and notes anywhere on the board; group them in sub-boards. Anything here can travel to a camera as a frame later.'},
  {sel:'#tabbar button[data-tab="write"]', tab:'write', title:'1st floor · Script',
   text:'Write or import the script (Fountain, PDF, Word) or fill in an AV script in seconds. Break it down and every scene becomes a floor plan on the 2nd floor.'},
  {sel:'#sidebar', tab:'design', title:'2nd floor · Shot designer',
   text:'The library: walls, doors and windows, furniture at real size, cast, cameras with sensor and lens, and light. Drag onto the plan. One unit is one centimetre.', pos:'right'},
  {sel:'#main', tab:'design', title:'The plan',
   text:'Drag to move, handles to rotate and resize, scroll to zoom. Give a camera a move and an actor a path, press play and watch the blocking. Tap a wall for a door; the ⓘ hint at the bottom shows what the current tool does.', pos:'center'},
  {sel:'#tabbar button[data-tab="shots"]', tab:'shots', title:'3rd · 4th · 5th floor',
   text:'Shot list: cameras become a shooting order per day with breaks and moves. Budget: a quote-style budget. Production: crew, cast, locations, prop lists and the call sheet — all exportable as A4 PDFs in your house style.'},
  {sel:'#projBtn', title:'Productions and examples',
   text:'Switch productions, start from a template, or open a finished example — the Velderhof commercial, the short film Nudes, the Haver spot — and change it as you like.'},
  {sel:'#shareBtn', title:'Share and co-edit',
   text:'Read-only links for a client, or invite people by name and email as co-editor or read-only, per floor. Press ? any time for the guide per floor, and to take this tour again.'},
];

// the iPad / shot-designer build (FLOOR_MODE === 'shot') is a different product:
// one floor, the plan. Its tour never mentions boards.
const TOUR_SHOT = [
  {sel:'#toolbar', title:'Draw the room',
   text:'Walls, doors and windows, curves, a measure tool. One unit is one centimetre, everything snaps to 90° and to wall ends.'},
  {sel:'#sidebar', pos:'right', title:'The library',
   text:'Furniture at real size, cast, cameras with sensor and lens, light with its throw. Drag onto the plan. Rooms you scanned with Floor Scanner wait behind the house button.'},
  {sel:'#main', pos:'center', title:'The plan',
   text:'Drag to move, handles to rotate and resize, pinch to zoom. Give a camera a move and an actor a path and press play to see the blocking. Tap a wall for a door.'},
  {sel:'.scriptbtn', title:'Scripts in, scenes out',
   text:'Import a script (Fountain, PDF, Word) or write one here; every scene heading becomes a plan of its own.'},
  {sel:'#roomLibBtn', title:'Room library',
   text:'Rooms you drew or scanned before, across productions — insert one into any scene.'},
  {sel:'#exportBtn', title:'Export',
   text:'A PNG of the plan or a PDF with scene pages, shots and stills. The ? button has the guide, and this tour again.'},
];
const tourSteps = ()=>window.FLOOR_MODE === 'shot' ? TOUR_SHOT : TOUR_STEPS;
let tourI = -1, tourEls = null, tourResize = null;
function tourEl(){
  if(tourEls) return tourEls;
  const dim = document.createElement('div'); dim.id = 'tourDim';
  const ring = document.createElement('div'); ring.id = 'tourRing';
  const card = document.createElement('div'); card.id = 'tourCard';
  document.body.append(dim, ring, card);
  dim.addEventListener('click', endTour);
  tourEls = {dim, ring, card};
  return tourEls;
}
function startTour(){
  if(window.VIEW_ONLY || window.FLOOR_READONLY) return;
  if(typeof toggleHelp === 'function') toggleHelp(false);
  tourEl();
  tourI = -1;
  tourResize = ()=>{ if(tourI >= 0) placeTour(); };
  window.addEventListener('resize', tourResize);
  document.addEventListener('keydown', tourKeys, true);
  tourGo(0);
}
function tourKeys(e){
  if(e.key === 'Escape'){ endTour(); e.stopPropagation(); }
  else if(e.key === 'ArrowRight' || e.key === 'Enter'){ tourGo(tourI + 1); e.stopPropagation(); }
  else if(e.key === 'ArrowLeft'){ tourGo(tourI - 1); e.stopPropagation(); }
}
function endTour(){
  if(!tourEls) return;
  tourI = -1;
  tourEls.dim.remove(); tourEls.ring.remove(); tourEls.card.remove(); tourEls = null;
  window.removeEventListener('resize', tourResize);
  document.removeEventListener('keydown', tourKeys, true);
  try{ localStorage.floorTourDone = '1'; }catch(_){}
}
function tourGo(i){
  if(i < 0) i = 0;
  if(i >= tourSteps().length){ endTour(); toast('That is the tour — the ? button has the guide per floor'); return; }
  tourI = i;
  const st = tourSteps()[i];
  if(st.tab && typeof switchTab === 'function' && typeof activeTab !== 'undefined' && activeTab !== st.tab && (typeof floorAllowed !== 'function' || floorAllowed(st.tab))) switchTab(st.tab);
  const {card} = tourEl();
  card.innerHTML = '<div class="tour-n">' + (i + 1) + ' / ' + tourSteps().length + '</div><h3>' + esc(st.title) + '</h3><p>' + esc(st.text) + '</p>' +
    '<div class="tour-b"><button class="btn" id="tourSkip">Skip</button><span style="flex:1"></span>' +
    (i ? '<button class="btn" id="tourBack">Back</button>' : '') +
    '<button class="btn primary" id="tourNext">' + (i === tourSteps().length - 1 ? 'Done' : 'Next') + '</button></div>';
  card.querySelector('#tourSkip').addEventListener('click', endTour);
  const bk = card.querySelector('#tourBack'); if(bk) bk.addEventListener('click', ()=>tourGo(i - 1));
  card.querySelector('#tourNext').addEventListener('click', ()=>tourGo(i + 1));
  // the tab switch relayouts — place after the frame settles
  requestAnimationFrame(()=>requestAnimationFrame(placeTour));
}
function placeTour(){
  const st = tourSteps()[tourI]; if(!st || !tourEls) return;
  const {ring, card} = tourEls;
  const el = document.querySelector(st.sel);
  const vw = window.innerWidth, vh = window.innerHeight;
  let r = el && el.offsetParent !== null ? el.getBoundingClientRect() : null;
  if(r && (!r.width || !r.height)) r = null;
  if(r){
    const pad = st.pos === 'center' ? -6 : 6;
    ring.style.display = 'block';
    ring.style.left = (r.left - pad) + 'px'; ring.style.top = (r.top - pad) + 'px';
    ring.style.width = (r.width + pad * 2) + 'px'; ring.style.height = (r.height + pad * 2) + 'px';
  } else ring.style.display = 'none';
  // card: below the target when there is room, else above; centred stops sit in the middle
  const cw = Math.min(360, vw - 24), ch = card.offsetHeight || 180;
  let x, y;
  if(!r || st.pos === 'center'){ x = (vw - cw) / 2; y = Math.max(16, (vh - ch) / 2); }
  else if(st.pos === 'right'){ x = Math.min(vw - cw - 12, r.right + 14); y = Math.max(12, Math.min(vh - ch - 12, r.top + 20)); }
  else {
    x = Math.max(12, Math.min(vw - cw - 12, r.left + r.width / 2 - cw / 2));
    y = r.bottom + 14 + ch <= vh ? r.bottom + 14 : Math.max(12, r.top - ch - 14);
  }
  card.style.width = cw + 'px'; card.style.left = x + 'px'; card.style.top = y + 'px';
}
// first load on this device → the tour, once
function maybeStartTour(){
  if(window.VIEW_ONLY || window.FLOOR_READONLY) return;
  let done = null; try{ done = localStorage.floorTourDone; }catch(_){}
  if(done) return;
  if(new URLSearchParams(location.search).has('join')) return; // they came for a production, not a lesson
  setTimeout(()=>{ if(!document.querySelector('.fb-ov') && !document.getElementById('helpOverlay').classList.contains('show')) startTour(); }, 1400);
}
// "Take the tour" in the help panel
(function tourHelpButton(){
  const nav = document.querySelector('#helpCard .help-nav');
  if(!nav) return;
  const b = document.createElement('button');
  b.textContent = '▶ Take the tour'; b.className = 'tour-start'; b.title = 'A one-minute walk through the floors';
  b.addEventListener('click', startTour);
  nav.appendChild(b);
})();
