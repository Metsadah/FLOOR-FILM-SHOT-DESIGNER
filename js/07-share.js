// FLOOR — 07-share.js
// Sharing rung 2: read-only share links + position-pinned comments.
// A share = one frozen snapshot (project + assets, like .floorproj) uploaded
// to the public 'shares' Storage bucket under an unguessable token, plus a
// row in public.shares. ?view=TOKEN boots the app in a locked viewer mode —
// no tools, no save — where anyone can drop comment pins (Supabase Realtime
// keeps them live). Commenters physically can't touch project data: RLS.
'use strict';

const SHARE_URL = 'https://jcasjylzosgtitaxbrjo.supabase.co';
const SHARE_KEY = 'sb_publishable_Hon-GqliiypoM52l6uuUaA_w4UFkfdB';

let _shareSb = null;
function shareClient(){
  if(!_shareSb){
    if(window.FLOOR_SB) _shareSb = window.FLOOR_SB;
    else if(window.supabase) _shareSb = window.supabase.createClient(SHARE_URL, SHARE_KEY);
  }
  return _shareSb;
}
function shareToken(){
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map(b=>'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}
function shareUrlFor(token){
  return location.origin + location.pathname + '?view=' + token;
}

// ---------------------------------------------------------------- owner side
async function createShareLink(){
  const sb = shareClient();
  if(!window.FLOOR_USER || !sb){
    toast('Sharing needs the cloud version — sign in first (or send a .floorproj)');
    return;
  }
  toast('Freezing a copy of this production…');
  try{
    await saveProject();
    const assets = await collectAssets();
    const token = shareToken();
    const pack = {shared:1, exported:new Date().toISOString(),
      name:project.shootName || 'production', project, assets};
    const up = await sb.storage.from('shares')
      .upload(token + '.json', new Blob([JSON.stringify(pack)], {type:'application/json'}),
        {contentType:'application/json', upsert:false});
    if(up.error) throw up.error;
    const ins = await sb.from('shares').insert({token, title:project.shootName || 'Untitled production'});
    if(ins.error) throw ins.error;
    const url = shareUrlFor(token);
    try{ await navigator.clipboard.writeText(url); toast('Share link copied — anyone with it can view & comment'); }
    catch(_){ prompt('Share link (copy it):', url); }
    buildSharePop();
  }catch(e){
    console.error('share failed', e);
    toast('Could not create the share link — see the console');
  }
}
async function deleteShareLink(token){
  const sb = shareClient();
  if(!sb) return;
  await sb.from('shares').delete().eq('token', token);
  await sb.storage.from('shares').remove([token + '.json']);
  toast('Share link revoked');
  buildSharePop();
}
async function buildSharePop(){
  const pop = document.getElementById('sharePop');
  if(!pop) return;
  pop.innerHTML = '<div style="font-weight:600;margin-bottom:2px">Share this production</div>';
  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:10.5px;color:var(--ink2);margin-bottom:10px;line-height:1.5;';
  pop.appendChild(sub);
  if(!window.FLOOR_USER || !shareClient()){
    sub.textContent = 'Read-only share links need the cloud version (sign in with your email). ' +
      'Offline alternative: Export .floorproj from the production switcher and send the file.';
    return;
  }
  sub.textContent = 'A link is a frozen copy — viewers can look and comment, never edit. ' +
    'Re-share after big changes to send a fresh snapshot.';
  const mk = document.createElement('button');
  mk.className = 'btn primary';
  mk.style.cssText = 'width:100%;';
  mk.textContent = '+ Create read-only link';
  mk.addEventListener('click', createShareLink);
  pop.appendChild(mk);
  const sb = shareClient();
  const {data, error} = await sb.from('shares').select('*')
    .eq('owner', window.FLOOR_USER.id).order('created_at', {ascending:false});
  if(error || !data || !data.length) return;
  pop.insertAdjacentHTML('beforeend', '<div class="xp-title" style="margin-top:10px">Active links</div>');
  for(const s of data){
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 2px;font-size:11.5px;';
    row.innerHTML = '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
      esc(s.title || s.token) + '</span>' +
      '<span style="color:var(--ink2)">' + new Date(s.created_at).toLocaleDateString() + '</span>';
    const cp = document.createElement('button');
    cp.className = 'btn'; cp.textContent = 'Copy';
    cp.addEventListener('click', async ()=>{
      try{ await navigator.clipboard.writeText(shareUrlFor(s.token)); toast('Link copied'); }
      catch(_){ prompt('Share link:', shareUrlFor(s.token)); }
    });
    const op = document.createElement('button');
    op.className = 'btn'; op.textContent = 'View';
    op.addEventListener('click', ()=>window.open(shareUrlFor(s.token), '_blank'));
    const rm = document.createElement('button');
    rm.className = 'btn'; rm.textContent = '×'; rm.title = 'Revoke this link';
    rm.addEventListener('click', ()=>deleteShareLink(s.token));
    row.appendChild(cp); row.appendChild(op); row.appendChild(rm);
    pop.appendChild(row);
  }
}
(function wireShareBtn(){
  const b = document.getElementById('shareBtn');
  if(!b) return;
  b.addEventListener('click', ()=>{
    const pop = document.getElementById('sharePop');
    const on = pop.classList.toggle('show');
    if(on) buildSharePop();
  });
  document.addEventListener('pointerdown', e=>{
    const pop = document.getElementById('sharePop');
    if(pop && pop.classList.contains('show') && !pop.contains(e.target) &&
       e.target.id !== 'shareBtn') pop.classList.remove('show');
  });
})();

// ---------------------------------------------------------------- viewer side
let VIEW_TOKEN = null;
let shareComments = [];      // rows from share_comments for this token
let commentMode = false;

function viewerBoardKey(){
  return BOARD_TABS.has(activeTab) ? activeTab : 'scene:' + project.activeSceneId;
}

async function __floorViewerBoot(token){
  VIEW_TOKEN = token;
  window.VIEW_ONLY = true;
  document.body.classList.add('view-only');
  try{
    const res = await fetch(SHARE_URL + '/storage/v1/object/public/shares/' +
      encodeURIComponent(token) + '.json');
    if(!res.ok) throw new Error('snapshot not found');
    const pack = await res.json();
    // assets live in the snapshot; the storage shim serves them and eats writes
    const mem = {};
    for(const [k,v] of Object.entries((pack.assets && pack.assets.img) || {})) mem['sd:img:'+k] = v;
    for(const [k,v] of Object.entries((pack.assets && pack.assets.file) || {})) mem['sd:file:'+k] = v;
    window.storage = {
      async get(k){ return mem[k] !== undefined ? {key:k, value:mem[k]} : null; },
      async set(){}, async delete(){},
      async list(prefix){ return {keys:Object.keys(mem).filter(k=>!prefix || k.startsWith(prefix))}; },
    };
    project = pack.project;
    project.scenes.forEach(migrateShot);
    if(project.moodboard) migrateShot(project.moodboard);
    if(project.prodboard) migrateShot(project.prodboard);
    if(project.scriptboard) migrateShot(project.scriptboard);
    normalizeProduction();
    if(!project.customProps) project.customProps = [];
    if(!project.scenes.find(s=>s.id===project.activeSceneId)) project.activeSceneId = project.scenes[0].id;
    markDirty = function(){}; // read-only: no saves, no history
    const loading = document.getElementById('loading');
    if(loading) loading.remove();
    const st = document.getElementById('saveState');
    if(st) st.textContent = 'Read-only';
    buildShotList(); buildLibrary(); syncTitle(); buildStills(); buildInfo(); syncSunBtn();
    setTool('select');
    resize();
    // comment pins draw on top of every frame
    const origRender = render;
    render = function(){ origRender(); drawCommentPins(); };
    switchTab('org'); // a shared production opens on the production board
    await ensureShotImages(activeScene(), false);
    zoomFit(); updateZoomPct();
    initViewerComments(token, pack.name);
  }catch(e){
    console.error('viewer boot failed', e);
    document.body.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100vh;' +
      'font-family:-apple-system,Segoe UI,sans-serif;color:#33322E;text-align:center;padding:20px">' +
      '<div><div style="font-size:18px;font-weight:600">This share link is not available</div>' +
      '<div style="color:#8A877F;margin-top:8px;font-size:13px">It may have been revoked, or the link is incomplete.<br>' +
      'Ask the sender for a fresh FLOOR Studio link.</div></div></div>';
  }
}

async function initViewerComments(token, name){
  // floating comment controls
  const bar = document.createElement('div');
  bar.id = 'viewerBar';
  bar.innerHTML = '<span style="font-weight:600">' + esc(name || 'Shared production') + '</span>' +
    '<span style="color:var(--ink2);font-size:11px">read-only</span>' +
    '<button class="btn" id="cmtToggle">💬 Comment</button>';
  document.body.appendChild(bar);
  const tg = bar.querySelector('#cmtToggle');
  tg.addEventListener('click', ()=>{
    commentMode = !commentMode;
    tg.classList.toggle('primary', commentMode);
    toast(commentMode ? 'Click anywhere on the board to pin a comment' : 'Comment mode off');
  });
  const sb = shareClient();
  if(!sb) return;
  const {data} = await sb.from('share_comments').select('*').eq('token', token)
    .order('created_at', {ascending:true});
  shareComments = data || [];
  render();
  sb.channel('share-' + token)
    .on('postgres_changes',
      {event:'INSERT', schema:'public', table:'share_comments', filter:'token=eq.' + token},
      payload=>{
        if(!shareComments.find(c=>c.id === payload.new.id)) shareComments.push(payload.new);
        render();
      })
    .subscribe();
}

function drawCommentPins(){
  if(!VIEW_TOKEN) return;
  const key = viewerBoardKey();
  const pins = shareComments.filter(c=>c.board_key === key);
  if(!pins.length) return;
  const s = Math.max(view.scale, .3);
  ctx.save();
  // same world transform render() uses for objects
  ctx.setTransform(dpr*view.scale, 0, 0, dpr*view.scale, -view.x*view.scale*dpr, -view.y*view.scale*dpr);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for(const c of pins){
    ctx.beginPath(); ctx.arc(c.x, c.y, 11/s, 0, 7);
    ctx.fillStyle = '#E8934C'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2/s; ctx.stroke();
    ctx.font = `700 ${12/s}px -apple-system,Segoe UI,sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText('"', c.x, c.y + 2/s);
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

// viewer taps: pin comments / open existing ones; called from pointerdown
function __viewerTap(wx, wy, cx, cy){
  if(!VIEW_TOKEN) return false;
  const key = viewerBoardKey();
  const near = shareComments.filter(c=>c.board_key === key &&
    dist(wx, wy, c.x, c.y) <= 14/Math.max(view.scale, .3));
  if(near.length){ showCommentThread(near, cx, cy); return true; }
  if(commentMode){ showCommentForm(wx, wy, cx, cy); return true; }
  return false;
}

function closeCommentPop(){
  const old = document.getElementById('cmtPop');
  if(old) old.remove();
}
function commentPopShell(cx, cy){
  closeCommentPop();
  const pop = document.createElement('div');
  pop.id = 'cmtPop';
  pop.style.left = Math.min(cx + 12, window.innerWidth - 280) + 'px';
  pop.style.top = Math.min(cy - 10, window.innerHeight - 220) + 'px';
  document.body.appendChild(pop);
  setTimeout(()=>{
    const close = ev=>{
      if(!pop.contains(ev.target)){ pop.remove(); document.removeEventListener('pointerdown', close, true); }
    };
    document.addEventListener('pointerdown', close, true);
  }, 0);
  return pop;
}
function showCommentThread(list, cx, cy){
  const pop = commentPopShell(cx, cy);
  pop.innerHTML = list.map(c=>
    '<div style="margin-bottom:8px"><b style="font-size:11.5px">' + esc(c.author || 'Anonymous') + '</b>' +
    '<span style="color:var(--ink2);font-size:10px"> · ' + new Date(c.created_at).toLocaleString() + '</span>' +
    '<div style="font-size:12px;line-height:1.45;margin-top:2px">' + esc(c.body) + '</div></div>').join('');
  const rep = document.createElement('button');
  rep.className = 'btn';
  rep.textContent = 'Reply here';
  rep.addEventListener('click', ()=>showCommentForm(list[0].x, list[0].y, cx, cy));
  pop.appendChild(rep);
}
function showCommentForm(wx, wy, cx, cy){
  const pop = commentPopShell(cx, cy);
  pop.innerHTML =
    '<input id="cmtName" placeholder="Your name" style="width:100%;margin-bottom:6px">' +
    '<textarea id="cmtBody" rows="3" placeholder="Say something useful…" style="width:100%"></textarea>' +
    '<div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px">' +
    '<button class="btn" id="cmtCancel">Cancel</button>' +
    '<button class="btn primary" id="cmtSend">Pin comment</button></div>';
  const nameI = pop.querySelector('#cmtName');
  nameI.value = localStorage.getItem('floor-comment-name') || '';
  pop.querySelectorAll('input,textarea').forEach(el=>el.addEventListener('keydown', e=>e.stopPropagation()));
  pop.querySelector('#cmtCancel').addEventListener('click', closeCommentPop);
  pop.querySelector('#cmtSend').addEventListener('click', async ()=>{
    const body = pop.querySelector('#cmtBody').value.trim();
    if(!body){ toast('Write something first'); return; }
    const author = nameI.value.trim();
    localStorage.setItem('floor-comment-name', author);
    const sb = shareClient();
    const {data, error} = await sb.from('share_comments')
      .insert({token:VIEW_TOKEN, board_key:viewerBoardKey(), x:wx, y:wy, author, body})
      .select().single();
    if(error){ toast('Could not post the comment'); return; }
    if(data && !shareComments.find(c=>c.id === data.id)) shareComments.push(data);
    closeCommentPop();
    render();
    toast('Comment pinned');
  });
  pop.querySelector('#cmtBody').focus();
}
