/* =====================================================================
   FLOOR — Stage 2 storage adapter (Supabase)
   =====================================================================
   What this does: replaces the local (per-browser) IndexedDB storage
   with cloud storage + a magic-link login, so your projects follow you
   across devices and survive a cleared browser.

   Setup (once, ~15 minutes — full steps in README.md):
     1. Create a free project at https://supabase.com
     2. In the SQL editor, run the "kv table" SQL from README.md
     3. Paste your Project URL and anon key below
     4. In index.html, uncomment the two <script> lines in the <head>
   ===================================================================== */

(function(){
  // ── 1. PASTE YOUR VALUES HERE ─────────────────────────────────────
  const SUPABASE_URL      = 'https://jcasjylzosgtitaxbrjo.supabase.co'; // FLOOR - FILM SHOT DESIGNER (eu-west-1)
  const SUPABASE_ANON_KEY = 'sb_publishable_Hon-GqliiypoM52l6uuUaA_w4UFkfdB'; // publishable key 'floor_shot_designer' (safe to be public — data is protected by RLS)
  // ──────────────────────────────────────────────────────────────────

  if(!window.supabase){
    console.warn('[FLOOR] supabase-js not loaded — falling back to local storage.');
    document.addEventListener('DOMContentLoaded', ()=>{
      const b = document.createElement('div');
      b.style.cssText = 'position:fixed;bottom:14px;left:50%;transform:translateX(-50%);' +
        'background:#33322E;color:#fff;font:12px -apple-system,Segoe UI,sans-serif;' +
        'padding:9px 14px;border-radius:9px;z-index:300;box-shadow:0 8px 30px rgba(0,0,0,.25)';
      b.textContent = 'Cloud login could not start (Supabase library failed to load) — working locally instead.';
      document.body.appendChild(b);
      setTimeout(()=>b.remove(), 8000);
    }, {once:true});
    return;
  }
  if(SUPABASE_URL.startsWith('PASTE')){
    console.warn('[FLOOR] supabase-adapter.js has no credentials yet — falling back to local storage.');
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ---- tiny magic-link login overlay -------------------------------
  function loginOverlay(){
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;z-index:200;background:#F2F1EE;' +
        'display:flex;align-items:center;justify-content:center;font-family:-apple-system,Segoe UI,sans-serif;';
      el.innerHTML = `
        <div style="background:#fff;border:1px solid #E5E3DE;border-radius:16px;padding:30px 34px;
                    width:340px;box-shadow:0 18px 60px rgba(40,38,32,.14)">
          <div style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:16px">
            <div style="width:10px;height:10px;border-radius:3px;background:#4B6BFB"></div>FLOOR Studio
          </div>
          <div style="color:#8A877F;font-size:12.5px;margin:6px 0 18px">
            Sign in to load your FLOOR Studio projects. We'll email you a one-time login link — no password needed.
          </div>
          <input id="flEmail" type="email" placeholder="you@example.com"
                 style="width:100%;border:1px solid #E5E3DE;border-radius:8px;padding:9px 11px;font-size:13px">
          <button id="flSend"
                  style="width:100%;margin-top:10px;background:#4B6BFB;color:#fff;border:none;
                         border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer">
            Email me a login link</button>
          <div id="flMsg" style="color:#8A877F;font-size:12px;margin-top:12px;line-height:1.5"></div>
        </div>`;
      document.body.appendChild(el);
      const msg = el.querySelector('#flMsg');
      el.querySelector('#flSend').addEventListener('click', async ()=>{
        const email = el.querySelector('#flEmail').value.trim();
        if(!email){ msg.textContent = 'Enter your email address first.'; return; }
        msg.textContent = 'Sending…';
        const {error} = await sb.auth.signInWithOtp({
          email, options:{ emailRedirectTo: location.href }
        });
        msg.textContent = error
          ? 'Could not send the link: ' + error.message
          : 'Check your inbox for your FLOOR Studio login link (sent via Supabase — check spam the first time) and open it on THIS device. This page will unlock automatically.';
      });
      sb.auth.onAuthStateChange((_e, session)=>{
        if(session){ el.remove(); resolve(session.user); }
      });
    });
  }

  const ready = (async ()=>{
    // wait for the page body to exist before any overlay work — this script
    // runs in <head>, and the session check can resolve before the body parses
    if(!document.body){
      await new Promise(r => document.addEventListener('DOMContentLoaded', r, {once:true}));
    }
    const {data} = await sb.auth.getSession();
    if(data.session) return data.session.user;
    return loginOverlay();
  })();

  // ---- storage API (same shape the app expects) ---------------------
  window.FLOOR_STORAGE = {
    async get(key){
      await ready;
      const {data, error} = await sb.from('kv').select('value').eq('key', key).maybeSingle();
      if(error) throw error;
      return data ? {key, value:data.value} : null;
    },
    async set(key, value){
      await ready;
      const {data:{user}} = await sb.auth.getUser();
      const {error} = await sb.from('kv')
        .upsert({user_id:user.id, key, value, updated_at:new Date().toISOString()},
                {onConflict:'user_id,key'});
      if(error) throw error;
      return {key, value};
    },
    async delete(key){
      await ready;
      const {error} = await sb.from('kv').delete().eq('key', key);
      if(error) throw error;
      return {key, deleted:true};
    },
    async list(prefix){
      await ready;
      const {data, error} = await sb.from('kv').select('key');
      if(error) throw error;
      const keys = (data||[]).map(r=>r.key).filter(k=>!prefix || k.startsWith(prefix));
      return {keys};
    },
  };
})();
