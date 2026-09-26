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
  // Shared read-only viewer (?view=TOKEN): no login, no cloud kv — the
  // snapshot travels with the link; js/07-share.js takes over at boot.
  if(new URLSearchParams(location.search).get('view')) return;
  // ── configuration lives in config.js (window.FLOOR_CONFIG) ────────
  const CFG = window.FLOOR_CONFIG || {};
  const SUPABASE_URL      = CFG.supabaseUrl || '';
  const SUPABASE_ANON_KEY = CFG.supabaseKey || '';
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY){
    // LOCAL MODE: no backend configured — the app falls back to IndexedDB,
    // no login, and cloud-only UI (Share, presence) hides itself
    console.info('[FLOOR] no cloud config — running fully local');
    return;
  }
  // ──────────────────────────────────────────────────────────────────

  if(!window.supabase){
    console.warn('[FLOOR] supabase-js not loaded — falling back to local storage.');
    document.addEventListener('DOMContentLoaded', ()=>{
      const b = document.createElement('div');
      b.style.cssText = 'position:fixed;bottom:14px;left:50%;transform:translateX(-50%);' +
        'background:var(--ink);color:var(--panel);font:12px -apple-system,Segoe UI,sans-serif;' +
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
  window.FLOOR_SB = sb; // sharing (07-share.js) reuses the logged-in client

  // ---- login overlay: password (default) + magic link + reset ------
  // Password sign-in means returning on a new device/browser never has to
  // round-trip through email — only first-time signup (and password reset)
  // send one. Magic link stays available as a fallback for accounts that
  // never set a password.
  function loginOverlay(){
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;z-index:200;background:var(--bg);' +
        'display:flex;align-items:center;justify-content:center;font-family:-apple-system,Segoe UI,sans-serif;';
      document.body.appendChild(el);

      let mode = 'signin'; // signin | signup | magiclink | forgot | reset

      function field(id, type, ph){
        return `<input id="${id}" type="${type}" placeholder="${ph}" autocomplete="${
          type==='password' ? 'current-password' : type==='email' ? 'email' : 'off'}"
          style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 11px;
                 font-size:13px;margin-top:8px;box-sizing:border-box">`;
      }
      function btn(id, label, primary){
        return `<button id="${id}" style="width:100%;margin-top:10px;border-radius:8px;padding:10px;
          font-size:13px;font-weight:600;cursor:pointer;border:${primary ? 'none' : '1px solid var(--line)'};
          background:${primary ? 'var(--accent)' : 'var(--panel)'};color:${primary ? 'var(--panel)' : 'var(--ink)'}">${label}</button>`;
      }
      function link(id, label){
        return `<button id="${id}" style="background:none;border:none;color:var(--accent);font-size:12px;
          cursor:pointer;padding:2px 0;text-align:left">${label}</button>`;
      }

      function render(){
        const body =
          mode === 'signin' ? `
            ${field('flEmail','email','you@example.com')}
            ${field('flPass','password','Password')}
            ${btn('flGo','Sign in',true)}
            <div style="margin-top:10px">${link('flForgot','Forgot password?')}</div>
            <div style="border-top:1px solid var(--line);margin-top:12px;padding-top:12px">
              <div style="font-size:12.5px;color:var(--ink2);margin-bottom:2px">New to Floorboard?</div>
              ${btn('flToSignup','Create account — first month free',false)}
              <div style="font-size:11.5px;color:var(--ink3);margin-top:6px;line-height:1.45">No card needed. Invited by someone? Create an account with the e-mail the invite went to — working in their productions is always free.</div>
            </div>
            <div style="border-top:1px solid var(--line);margin-top:12px;padding-top:10px">
              ${link('flToMagic','Email me a login link instead')}
            </div>` :
          mode === 'signup' ? `
            <div style="color:var(--ink2);font-size:12.5px;margin-bottom:2px">Every floor for a month, no card, nothing renews by itself. Then €7 a month or €77 a year — or free as a collaborator.</div>
            ${field('flEmail','email','you@example.com')}
            ${field('flPass','password','Choose a password (6+ characters)')}
            ${field('flPromo','text','Promo code (optional)')}
            <label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;
                          font-size:12px;color:var(--body);line-height:1.45;cursor:pointer">
              <input id="flConsent" type="checkbox" style="margin-top:2px">
              <span>I agree to the <a href="privacy.html" target="_blank" rel="noopener"
                style="color:var(--accent)">privacy policy</a> — my email (and any profile
                details I choose to add later) are stored to run my account.</span>
            </label>
            ${btn('flGo','Create account',true)}
            <div style="margin-top:10px">${link('flToSignin','Already have an account? Sign in')}</div>` :
          mode === 'forgot' ? `
            <div style="color:var(--ink2);font-size:12.5px;margin-bottom:4px">
              We'll email you a one-time link to set a new password.</div>
            ${field('flEmail','email','you@example.com')}
            ${btn('flGo','Send reset link',true)}
            <div style="margin-top:10px">${link('flToSignin','Back to sign in')}</div>` :
          mode === 'reset' ? `
            <div style="color:var(--ink2);font-size:12.5px;margin-bottom:4px">
              Set a new password for your account.</div>
            ${field('flPass','password','New password (6+ characters)')}
            ${field('flPass2','password','Repeat new password')}
            ${btn('flGo','Set password & continue',true)}` :
          /* magiclink */ `
            <div style="color:var(--ink2);font-size:12.5px;margin-bottom:4px">
              We'll email you a one-time login link — no password needed.</div>
            ${field('flEmail','email','you@example.com')}
            ${btn('flGo','Email me a login link',true)}
            <div style="margin-top:10px">${link('flToSignin','Use a password instead')}</div>`;

        // two panes: the form, and a welcome column with tips, news and the way to Floor Scanner
        el.innerHTML = `
          <div class="fl-wrap">
            <div class="fl-card">
              <a href="landing.html" class="fl-logo" title="Back to the front page">
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7.5 16.5h9M7.5 12.5h6M7.5 8.5h3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="15.5" cy="8.5" r="1.8" fill="#E58A6F"/></svg>
                Floorboard <small>for film &amp; commercials</small>
              </a>
              <div id="flTitle" style="color:var(--ink);font-size:15px;font-weight:700;margin-top:14px">
                ${mode==='signin' ? 'Sign in' : mode==='signup' ? 'Create your account'
                  : mode==='forgot' ? 'Reset password' : mode==='reset' ? 'New password' : 'Email login link'}
              </div>
              <div id="flMsg" style="color:var(--ink2);font-size:12px;margin-top:6px;line-height:1.5"></div>
            </div>
            <aside class="fl-side">
              <div class="fl-block">
                <h3>New here? Three things to try</h3>
                <ol>
                  <li><b>Open the example.</b> Production ▾ → + New production → <i>Open example</i>: a 15-second commercial, five shots, three locations, every floor filled in.</li>
                  <li><b>Draw a room in a minute.</b> 2nd floor, drag the Room tool, tap a wall for a door — then drop a camera and pick a lens.</li>
                  <li><b>Let the paperwork write itself.</b> Cameras become the shot list, people the call sheet, both a PDF in your house style.</li>
                </ol>
              </div>
              <div class="fl-block fl-scanner">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-6h5v6"/></svg>
                <div><h3>Scouting? Take Floor Scanner.</h3><p>The iPhone companion scans a room with LiDAR or the camera and frames photos through a real lens. Sign in with the same account and the rooms are here when you sit down to plan.</p><a href="landing.html#scanner">About Floor Scanner →</a></div>
              </div>
              <div class="fl-block" id="flNews"><h3>News</h3><p style="color:var(--ink2)">Loading…</p></div>
              <div class="fl-links"><a href="landing.html">Front page</a> · <a href="news.html">News</a> · <a href="selfhost.html">Self-host</a> · <a href="privacy.html">Privacy</a></div>
            </aside>
          </div>`;
        if(!document.getElementById('flStyle')){
          document.head.insertAdjacentHTML('beforeend', `<style id="flStyle">
            .fl-wrap{display:grid;grid-template-columns:360px 380px;gap:22px;align-items:start;max-width:96vw;max-height:96vh;overflow:auto;padding:14px}
            .fl-card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:28px 30px;box-shadow:0 18px 60px rgba(40,38,32,.14)}
            .fl-logo{display:flex;align-items:center;gap:8px;font-weight:800;font-size:17px;color:var(--ink);text-decoration:none;letter-spacing:-.2px}
            .fl-logo svg{width:26px;height:26px;color:var(--accent)} .fl-logo small{font-weight:500;color:var(--ink2);font-size:12px;margin-left:4px}
            .fl-side{display:flex;flex-direction:column;gap:12px;padding-top:6px}
            .fl-block{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 18px;font-size:12.5px;color:var(--body);line-height:1.5}
            .fl-block h3{margin:0 0 8px;font-size:13px;color:var(--ink)} .fl-block ol{margin:0;padding-left:18px} .fl-block li{margin:4px 0} .fl-block p{margin:0 0 6px}
            .fl-block a{color:var(--accent);text-decoration:none;font-weight:600}
            .fl-scanner{display:flex;gap:12px;align-items:flex-start;background:var(--accent-soft);border-color:transparent}
            .fl-scanner svg{width:26px;height:26px;flex:none;color:var(--accent);fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;margin-top:2px}
            .fl-news{display:flex;flex-direction:column;gap:8px} .fl-news div{border-top:1px solid var(--line);padding-top:8px} .fl-news div:first-child{border-top:none;padding-top:0}
            .fl-news small{color:var(--ink3);font-size:11px} .fl-news b{display:block;color:var(--ink)}
            .fl-links{font-size:12px;color:var(--ink2);padding:0 4px} .fl-links a{color:var(--ink2)}
            @media (max-width:820px){ .fl-wrap{grid-template-columns:1fr;max-width:100vw} .fl-side{order:2} }
          </style>`);
        }
        el.querySelector('.fl-card').insertAdjacentHTML('beforeend', body);
        fetch('news.json', {cache:'no-store'}).then(r=>r.json()).then(items=>{
          const box = el.querySelector('#flNews'); if(!box) return;
          box.innerHTML = '<h3>News</h3><div class="fl-news">' + items.slice(0, 2).map(n=>'<div><small>' + escA(n.date) + (n.tag ? ' · ' + escA(n.tag) : '') + '</small><b>' + escA(n.title) + '</b>' + escA((n.text || '').slice(0, 140)) + (n.text && n.text.length > 140 ? '…' : '') + (n.link ? ' <a href="' + escA(safeLink(n.link)) + '">More</a>' : '') + '</div>').join('') + '</div><p style="margin:8px 0 0"><a href="news.html">All news →</a></p>';
        }).catch(()=>{ const box = el.querySelector('#flNews'); if(box) box.remove(); });
        wire();
      }

      const msg = ()=>el.querySelector('#flMsg');
      const go = (m)=>{ mode = m; render(); };

      function wire(){
        el.querySelector('#flToSignup')?.addEventListener('click', ()=>go('signup'));
        el.querySelector('#flToSignin')?.addEventListener('click', ()=>go('signin'));
        el.querySelector('#flToMagic')?.addEventListener('click', ()=>go('magiclink'));
        el.querySelector('#flForgot')?.addEventListener('click', ()=>go('forgot'));
        el.querySelector('#flGo')?.addEventListener('click', onGo);
        el.querySelectorAll('input').forEach(inp=>
          inp.addEventListener('keydown', e=>{ if(e.key==='Enter') onGo(); }));
      }

      async function onGo(){
        const email = el.querySelector('#flEmail')?.value.trim();
        const pass = el.querySelector('#flPass')?.value;
        if(mode === 'signin'){
          if(!email || !pass){ msg().textContent = 'Enter your email and password.'; return; }
          msg().textContent = 'Signing in…';
          const {error} = await sb.auth.signInWithPassword({email, password:pass});
          if(error) msg().textContent = 'Could not sign in: ' + error.message;
          // success resolves via onAuthStateChange below
        } else if(mode === 'signup'){
          if(!email || !pass){ msg().textContent = 'Enter an email and a password.'; return; }
          if(pass.length < 10){ msg().textContent = 'Password needs at least 10 characters — a short sentence works well.'; return; }
          if(!el.querySelector('#flConsent')?.checked){
            msg().textContent = 'Please agree to the privacy policy to create an account.';
            return;
          }
          msg().textContent = 'Creating account…';
          try{ const pc = el.querySelector('#flPromo')?.value.trim(); if(pc) localStorage.floorPromo = pc; }catch(_){}
          const {data, error} = await sb.auth.signUp({email, password:pass,
            options:{ emailRedirectTo: location.href }});
          if(error) msg().textContent = 'Could not create the account: ' + error.message;
          else if(data.session) { /* email confirmation off — resolves via onAuthStateChange */ }
          else msg().textContent = 'Check your inbox to confirm your address, then come back and sign in — just this once.';
        } else if(mode === 'forgot'){
          if(!email){ msg().textContent = 'Enter your email address first.'; return; }
          msg().textContent = 'Sending…';
          const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.href});
          msg().textContent = error
            ? 'Could not send the reset link: ' + error.message
            : 'Check your inbox for a password reset link and open it on this device.';
        } else if(mode === 'reset'){
          if(!pass || pass.length < 10){ msg().textContent = 'Password needs at least 10 characters — a short sentence works well.'; return; }
          const pass2 = el.querySelector('#flPass2')?.value;
          if(pass !== pass2){ msg().textContent = 'The two passwords don’t match.'; return; }
          msg().textContent = 'Setting password…';
          const {error} = await sb.auth.updateUser({password: pass});
          if(error){ msg().textContent = 'Could not set the password: ' + error.message; return; }
          const {data} = await sb.auth.getSession();
          if(data.session){ el.remove(); resolve(data.session.user); }
        } else { // magiclink
          if(!email){ msg().textContent = 'Enter your email address first.'; return; }
          msg().textContent = 'Sending…';
          const {error} = await sb.auth.signInWithOtp({email, options:{ emailRedirectTo: location.href }});
          msg().textContent = error
            ? 'Could not send the link: ' + error.message
            : 'Check your inbox for your Floorboard login link (sent via Supabase — check spam the first time) and open it on THIS device. This page will unlock automatically.';
        }
      }

      // a password-reset link lands here with the recovery event instead of
      // a normal sign-in — catch it before the generic SIGNED_IN resolve
      sb.auth.onAuthStateChange((evt, session)=>{
        if(evt === 'PASSWORD_RECOVERY'){ go('reset'); return; }
        if(session && mode !== 'reset'){ el.remove(); resolve(session.user); }
      });

      render();
    });
  }

  const ready = (async ()=>{
    // wait for the page body to exist before any overlay work — this script
    // runs in <head>, and the session check can resolve before the body parses
    if(!document.body){
      await new Promise(r => document.addEventListener('DOMContentLoaded', r, {once:true}));
    }
    const {data} = await sb.auth.getSession();
    if(data.session){ try{ localStorage.floorSeen = '1'; }catch(_){} return data.session.user; }
    // logged-out visitors land on the landing page (share/invite links and the
    // landing page's own "Open the app" — ?start=1 — go straight to sign-in)
    const q = new URLSearchParams(location.search);
    if(!q.has('view') && !q.has('join') && !q.has('start') && !q.has('type') && !q.has('example')){
      location.replace('landing.html');
      return new Promise(()=>{}); // the page is leaving — never resolve
    }
    try{ localStorage.floorSeen = '1'; }catch(_){}
    return loginOverlay();
  })();
  ready.then(u=>{ window.FLOOR_USER = u; });
  window.FLOOR_READY = ready; // co-editing (07-share.js) awaits login before fetching memberships

  // ---- storage API (same shape the app expects) ---------------------
  // freshness stamps: the updated_at we last read/wrote per project doc.
  // Saving checks the cloud stamp first — a mismatch means ANOTHER session
  // (second device / co-editor) saved in between, and silently overwriting
  // it is how work disappears. The save path turns that into a choice.
  window.FLOOR_STAMPS = window.FLOOR_STAMPS || {};
  // compare stamps by INSTANT, not string — Postgres returns '+00:00' with
  // microseconds while Date.toISOString() gives 'Z' millis; comparing the raw
  // strings made every second save cry wolf about a conflict (v0.35 fix)
  window.FLOOR_STAMP_DIFF = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) > 1500;
  window.FLOOR_STORAGE = {
    async get(key){
      await ready;
      const {data, error} = await sb.from('kv').select('value, updated_at').eq('key', key).maybeSingle();
      if(error) throw error;
      if(data && /^sd:project:/.test(key)) window.FLOOR_STAMPS[key] = data.updated_at;
      return data ? {key, value:data.value} : null;
    },
    async set(key, value){
      await ready;
      const {data:{user}} = await sb.auth.getUser();
      if(/^sd:project:/.test(key) && window.FLOOR_STAMPS[key]){
        const {data:cur} = await sb.from('kv').select('updated_at').eq('key', key).maybeSingle();
        if(cur && window.FLOOR_STAMP_DIFF(cur.updated_at, window.FLOOR_STAMPS[key])){
          const err = new Error('A newer version of this production exists in the cloud');
          err.floorConflict = true;
          throw err;
        }
      }
      const stamp = new Date().toISOString();
      const {data:wrote, error} = await sb.from('kv')
        .upsert({user_id:user.id, key, value, updated_at:stamp},
                {onConflict:'user_id,key'})
        .select('updated_at');
      if(error) throw error;
      if(/^sd:project:/.test(key))
        window.FLOOR_STAMPS[key] = (wrote && wrote[0] && wrote[0].updated_at) || stamp;
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

  // ---- account & privacy (GDPR rights live here) ---------------------
  // profile fields are OPTIONAL by design; consent (privacy policy version +
  // timestamp) is recorded on the profile row. FLOOR_ACCOUNT.open() is the
  // in-app panel: view/edit (rectification), download my data (access +
  // portability), sign out, delete account (erasure via delete_my_account RPC).
  const PRIVACY_VERSION = '2026-09-25'; // retention table + sub-processors added
  const escA = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeLink = u => (typeof u === 'string' && /^(https?:\/\/|[a-z0-9_./#-]+$)/i.test(u) && !/^javascript:/i.test(u)) ? u : 'news.html';
  // everything this browser remembers about the account, gone at sign-out (shared computers)
  async function wipeLocal(){
    try{ for(const k of ['floorPromo', 'floor-comment-name', 'floorSeen']) localStorage.removeItem(k); }catch(_){}
    try{ if(window.caches){ for(const k of await caches.keys()) if(!/floor-shell/.test(k)) await caches.delete(k); } }catch(_){}
    try{ indexedDB.deleteDatabase('blockingBoard'); }catch(_){}
  }

  function accountOverlay(profile, firstRun){
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:210;background:rgba(40,38,32,.35);' +
      'display:flex;align-items:center;justify-content:center;font-family:-apple-system,Segoe UI,sans-serif;';
    const f = (id, label, val, ph)=>`
      <div style="margin-top:9px">
        <div style="font-size:10.5px;font-weight:600;color:var(--ink2);letter-spacing:.4px">${label}
          <span style="font-weight:400">· optional</span></div>
        <input id="${id}" value="${(val||'').replace(/"/g,'&quot;')}" placeholder="${ph}"
          style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;
                 font-size:13px;margin-top:3px;box-sizing:border-box">
      </div>`;
    el.innerHTML = `
      <div style="background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:26px 30px;
                  width:360px;max-height:86vh;overflow:auto;box-shadow:0 18px 60px rgba(40,38,32,.2)">
        <div style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:15px">
          <div style="width:10px;height:10px;border-radius:3px;background:var(--accent)"></div>
          ${firstRun ? 'Welcome — tell us about yourself?' : 'Account & privacy'}
        </div>
        <div style="color:var(--ink2);font-size:12px;margin-top:6px;line-height:1.5">
          ${firstRun
            ? 'Everything below is optional — it only prefills your call sheets and crew cards. Skip it freely.'
            : 'Signed in as <b>' + escA((window.FLOOR_USER && window.FLOOR_USER.email) || '') + '</b>'}
        </div>
        ${f('apName','NAME', profile.name, 'Your name')}
        ${f('apAddress','ADDRESS', profile.address, 'Street, city')}
        ${f('apPhone','PHONE', profile.phone, '+31 6 …')}
        ${f('apProf','PROFESSION', profile.profession, 'DoP / gaffer / producer …')}
        <div id="apMsg" style="color:var(--ink2);font-size:12px;margin-top:10px;min-height:16px"></div>
        <button id="apSave" style="width:100%;margin-top:4px;background:var(--accent);color:var(--panel);border:none;
          border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer">
          ${firstRun ? 'Save & continue' : 'Save changes'}</button>
        ${firstRun ? `<button id="apSkip" style="width:100%;margin-top:8px;background:var(--panel);color:var(--ink);
          border:1px solid var(--line);border-radius:8px;padding:10px;font-size:13px;cursor:pointer">
          Skip for now</button>` : `
        <div style="border-top:1px solid var(--line);margin-top:16px;padding-top:12px;
                    display:flex;flex-direction:column;gap:8px">
          <div id="apPlan" style="display:none;border:1px solid var(--line);border-radius:10px;
            padding:10px 12px;font-size:12.5px;line-height:1.5"></div>
          <button id="apPassBtn" style="background:var(--panel);border:1px solid var(--line);border-radius:8px;
            padding:9px;font-size:12.5px;cursor:pointer">Change password…</button>
          <div id="apPassRow" style="display:none;flex-direction:column;gap:6px">
            <input id="apPass" type="password" placeholder="New password (6+ characters)"
              autocomplete="new-password"
              style="border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:12.5px">
            <input id="apPass2" type="password" placeholder="Repeat new password"
              autocomplete="new-password"
              style="border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:12.5px">
            <button id="apPassGo" style="background:var(--accent);color:var(--panel);border:none;border-radius:8px;
              padding:8px 12px;font-size:12.5px;font-weight:600;cursor:pointer">Set new password</button>
          </div>
          <button id="apExport" style="background:var(--panel);border:1px solid var(--line);border-radius:8px;
            padding:9px;font-size:12.5px;cursor:pointer">Download my data (JSON)</button>
          <button id="apSignout" style="background:var(--panel);border:1px solid var(--line);border-radius:8px;
            padding:9px;font-size:12.5px;cursor:pointer">Sign out</button>
          <button id="apDelete" style="background:var(--panel);border:1px solid var(--danger-line);color:var(--danger);
            border-radius:8px;padding:9px;font-size:12.5px;cursor:pointer">Delete my account & all data…</button>
          <a href="privacy.html" target="_blank" rel="noopener" style="color:var(--accent);font-size:12px">Privacy policy</a>
        </div>`}
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('pointerdown', e=>{ if(e.target === el) el.remove(); });
    const msg = el.querySelector('#apMsg');
    // plan box (hosted edition with billing configured only)
    const planBox = el.querySelector('#apPlan');
    const renderPlan = ()=>{
      const B = window.FLOOR_BILLING;
      if(!planBox || !B || !B.enabled) return;
      planBox.style.display = 'block';
      const plan = B.plan(), row = B.row();
      const until = row && row.current_period_end
        ? new Date(row.current_period_end).toLocaleDateString() : '';
      const st = B.status();
      const line = st.kind === 'pro' ? '<b>Pro</b> ✓ — unlimited productions, ' + B.seats + ' collaborator seats.' + (until ? ' Renews ' + until + '.' : '')
        : st.kind === 'canceled' ? '<b>Pro</b> — cancelled, works until ' + until + '.'
        : st.kind === 'trial' ? '<b>Free trial</b> — ' + st.days + ' day' + (st.days === 1 ? '' : 's') + ' left, everything unlocked.'
        : st.kind === 'promo' ? '<b>Pro via code</b> — until ' + until + '.'
        : st.kind === 'trial-ended' ? '<b>Free month over</b> — your productions stay stored for a year, and you can still work in productions you were invited to.'
        : '<b>Guest</b> — you work in productions others invited you to.';
      planBox.innerHTML = line +
        (st.kind === 'pro' || st.kind === 'canceled'
          ? `<br><button id="apManage" style="margin-top:8px;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:7px 11px;font-size:12px;cursor:pointer">Manage subscription</button>`
          : `<br><button id="apUpgrade" style="margin-top:8px;background:var(--accent);color:var(--panel);border:none;border-radius:8px;padding:8px 12px;font-size:12.5px;font-weight:600;cursor:pointer">Go Pro${B.label ? ' · ' + B.label : ''}</button>
             <button id="apCodeBtn" style="margin-top:8px;margin-left:6px;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:7px 11px;font-size:12px;cursor:pointer">I have a code</button>`) +
        `<div id="apSeats" style="color:var(--ink2);font-size:11.5px;margin-top:6px"></div>`;
      planBox.querySelector('#apUpgrade')?.addEventListener('click', ()=>B.upgrade());
      planBox.querySelector('#apCodeBtn')?.addEventListener('click', ()=>B.panel());
      planBox.querySelector('#apManage')?.addEventListener('click', ()=>B.manage());
      if(st.kind === 'pro' || st.kind === 'trial' || st.kind === 'promo' || st.kind === 'canceled')
        B.collaborators().then(n=>{ const s = planBox.querySelector('#apSeats'); if(s) s.textContent = n + ' of ' + B.seats + ' collaborator seats in use'; });
    };
    renderPlan();
    document.addEventListener('floor-plan-changed', renderPlan);

    async function save(){
      const bad = typeof reservedNameProblem === 'function' ? reservedNameProblem(el.querySelector('#apName').value) : null;
      if(bad){ msg.textContent = bad; return false; }
      msg.textContent = 'Saving…';
      const row = {
        user_id: window.FLOOR_USER.id,
        name: el.querySelector('#apName').value.trim(),
        address: el.querySelector('#apAddress').value.trim(),
        phone: el.querySelector('#apPhone').value.trim(),
        profession: el.querySelector('#apProf').value.trim(),
        privacy_version: profile.privacy_version || PRIVACY_VERSION,
        privacy_accepted_at: profile.privacy_accepted_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const {error} = await sb.from('profiles').upsert(row);
      if(error){ msg.textContent = 'Could not save: ' + error.message; return false; }
      return true;
    }
    el.querySelector('#apSave').addEventListener('click', async ()=>{
      if(await save()) el.remove();
    });
    el.querySelector('#apSkip')?.addEventListener('click', async ()=>{
      // record consent even when skipping, so the prompt never nags again
      await sb.from('profiles').upsert({user_id: window.FLOOR_USER.id,
        privacy_version: PRIVACY_VERSION, privacy_accepted_at: new Date().toISOString()});
      el.remove();
    });
    el.querySelector('#apPassBtn')?.addEventListener('click', ()=>{
      const row = el.querySelector('#apPassRow');
      row.style.display = row.style.display === 'none' ? 'flex' : 'none';
      if(row.style.display === 'flex') el.querySelector('#apPass').focus();
    });
    el.querySelector('#apPassGo')?.addEventListener('click', async ()=>{
      const p = el.querySelector('#apPass').value;
      const p2 = el.querySelector('#apPass2').value;
      if(!p || p.length < 6){ msg.textContent = 'Password needs at least 6 characters.'; return; }
      if(p !== p2){ msg.textContent = 'The two passwords don’t match.'; return; }
      msg.textContent = 'Setting password…';
      const {error} = await sb.auth.updateUser({password: p});
      if(error){ msg.textContent = 'Could not set the password: ' + error.message; return; }
      el.querySelector('#apPass').value = '';
      el.querySelector('#apPass2').value = '';
      el.querySelector('#apPassRow').style.display = 'none';
      msg.textContent = 'Password changed ✓ — use it next time you sign in.';
    });
    for(const id of ['#apPass', '#apPass2'])
      el.querySelector(id)?.addEventListener('keydown', e=>{
        if(e.key === 'Enter') el.querySelector('#apPassGo').click();
        e.stopPropagation();
      });
    el.querySelector('#apExport')?.addEventListener('click', async ()=>{
      msg.textContent = 'Collecting your data…';
      try{
        const dump = {exported: new Date().toISOString(),
          account: {id: FLOOR_USER.id, email: FLOOR_USER.email}, profile: null, kv: {}};
        const {data: p} = await sb.from('profiles').select('*')
          .eq('user_id', FLOOR_USER.id).maybeSingle();
        dump.profile = p;
        const {data: rows} = await sb.from('kv').select('key, value, updated_at');
        for(const r of rows || []) dump.kv[r.key] = {value: r.value, updated_at: r.updated_at};
        // everything else that is about you: shared productions you own or joined, share links, plan
        try{
          const own = await sb.from('productions').select('*').eq('owner', FLOOR_USER.id);
          dump.productions_owned = own.data || [];
          dump.production_docs = {};
          for(const p of dump.productions_owned){ const d = await sb.from('production_docs').select('key, value, updated_at').eq('production_id', p.id); dump.production_docs[p.id] = d.data || []; }
          dump.memberships = (await sb.from('production_members').select('*').eq('user_id', FLOOR_USER.id)).data || [];
          dump.share_links = (await sb.from('shares').select('*').eq('owner', FLOOR_USER.id)).data || [];
          dump.subscription = (await sb.from('subscriptions').select('*').eq('user_id', FLOOR_USER.id).maybeSingle()).data || null;
        }catch(_){}
        const a = document.createElement('a');
        a.download = 'floor-studio-my-data.json';
        a.href = URL.createObjectURL(new Blob([JSON.stringify(dump)], {type:'application/json'}));
        a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
        msg.textContent = 'Downloaded. Shared productions can be exported per project (.floorproj).';
      }catch(e){ msg.textContent = 'Export failed: ' + (e.message || e); }
    });
    el.querySelector('#apSignout')?.addEventListener('click', async ()=>{
      await sb.auth.signOut();
      await wipeLocal();
      location.replace('landing.html'); // signed out → the front door, not an empty app
    });
    el.querySelector('#apDelete')?.addEventListener('click', async ()=>{
      const sure = prompt('This permanently deletes your account, ALL your projects, shares and ' +
        'profile from our servers. This cannot be undone.\n\nType DELETE to confirm:');
      if(sure !== 'DELETE'){ msg.textContent = 'Not deleted.'; return; }
      msg.textContent = 'Deleting everything…';
      // files first, through the Storage API (SQL cannot reliably remove them): share snapshots + Floor Scanner photos
      try{
        const {data: sh} = await sb.from('shares').select('token').eq('owner', FLOOR_USER.id);
        if(sh && sh.length) await sb.storage.from('shares').remove(sh.map(s=>s.token + '.json'));
        const {data: ph} = await sb.storage.from('scout').list(FLOOR_USER.id, {limit:1000});
        if(ph && ph.length) await sb.storage.from('scout').remove(ph.map(f=>FLOOR_USER.id + '/' + f.name));
      }catch(_){}
      const {error} = await sb.rpc('delete_my_account');
      if(error){ msg.textContent = 'Could not delete: ' + error.message; return; }
      await sb.auth.signOut().catch(()=>{});
      await wipeLocal();
      alert('Your account and all data have been deleted.');
      location.replace('landing.html');
    });
  }

  // ---- billing (optional) ---------------------------------------------
  // config.billing empty → billing OFF → everything unlocked (self-host edition,
  // local dev). With a provider configured, the plan comes from the
  // subscriptions row the billing-webhook edge function maintains.
  const BILL = (window.FLOOR_CONFIG && window.FLOOR_CONFIG.billing) || {};
  const billingOn = !!(BILL.provider &&
    (BILL.provider === 'paddle' ? (BILL.token && BILL.priceId) : BILL.checkoutUrl));
  let subRow = null;
  const TRIAL_DAYS = +(BILL.trialDays || 14), SEATS = +(BILL.seats || 5);
  function effectivePlan(row){
    if(!row) return 'free';
    const until = row.current_period_end ? Date.parse(row.current_period_end) : null;
    // paid, past-due grace, cancelled-but-paid, trial and promo periods all count while they run
    const live = row.status === 'active' || row.status === 'past_due' ||
      (['canceled','trial','promo'].includes(row.status) && until && until > Date.now());
    return live ? (row.plan || 'pro') : 'free';
  }
  // human status for the account panel and the upsell: {kind, until, days}
  function planStatus(row){
    const until = row && row.current_period_end ? Date.parse(row.current_period_end) : null;
    const days = until ? Math.max(0, Math.ceil((until - Date.now()) / 864e5)) : null;
    if(!row) return {kind:'guest', until, days};
    if(effectivePlan(row) === 'free') return {kind:row.status === 'trial' ? 'trial-ended' : 'guest', until, days:0};
    if(row.status === 'trial') return {kind:'trial', until, days};
    if(row.status === 'promo') return {kind:'promo', until, days};
    if(row.status === 'canceled') return {kind:'canceled', until, days};
    return {kind:'pro', until, days};
  }
  async function loadPlan(){
    if(!billingOn || !window.FLOOR_USER) return;
    const {data} = await sb.from('subscriptions').select('*')
      .eq('user_id', FLOOR_USER.id).maybeSingle();
    subRow = data || null;
    if(!subRow){ // first sign-in: the trial starts now (the RPC is idempotent)
      try{ const r = await sb.rpc('start_trial', {days:TRIAL_DAYS}); if(r.data && r.data[0]) subRow = Object.assign({user_id:FLOOR_USER.id}, r.data[0]); }catch(_){}
    }
    // a promo code typed at sign-up is redeemed on the first signed-in load
    let pend = null; try{ pend = localStorage.floorPromo; }catch(_){}
    if(pend){ try{ localStorage.removeItem('floorPromo'); }catch(_){} await window.FLOOR_BILLING.redeem(pend, true); }
  }
  ready.then(loadPlan);
  let pollTimer = null;
  function pollPlan(){
    // after a checkout the webhook lands within seconds — watch for it
    clearInterval(pollTimer);
    const was = effectivePlan(subRow);
    let n = 0;
    pollTimer = setInterval(async ()=>{
      await loadPlan();
      if(effectivePlan(subRow) !== was || ++n > 36){
        clearInterval(pollTimer);
        if(effectivePlan(subRow) !== 'free' && typeof toast === 'function')
          toast('Welcome to FLOOR ' + effectivePlan(subRow).toUpperCase() + ' — everything is unlocked');
        document.dispatchEvent(new CustomEvent('floor-plan-changed'));
      }
    }, 5000);
  }
  window.FLOOR_BILLING = {
    enabled: billingOn,
    label: BILL.priceLabel || '',
    plan(){ return billingOn ? effectivePlan(subRow) : 'pro'; },
    isPro(){ return this.plan() !== 'free'; },
    status(){ return billingOn ? planStatus(subRow) : {kind:'pro', days:null}; },
    canCreate(){ return !billingOn || this.isPro(); }, // guests work in what they were invited to
    seats: SEATS, trialDays: TRIAL_DAYS,
    row(){ return subRow; },
    refresh: loadPlan,
    async collaborators(){ try{ const r = await sb.rpc('collaborator_count', {owner_id:FLOOR_USER.id}); return r.data ?? 0; }catch(_){ return 0; } },
    async redeem(code, quiet){
      await ready;
      const {data, error} = await sb.rpc('redeem_promo', {promo:String(code || '').trim()});
      if(error){ if(!quiet && typeof toast === 'function') toast(error.message); return false; }
      if(data && data[0]) subRow = Object.assign({user_id:FLOOR_USER.id}, subRow || {}, data[0]);
      document.dispatchEvent(new CustomEvent('floor-plan-changed'));
      if(typeof toast === 'function') toast('Code accepted — Floorboard Pro until ' + new Date(subRow.current_period_end).toLocaleDateString());
      return true;
    },
    // true = go ahead; false = the plan panel was shown instead
    gate(feature){
      if(!billingOn || this.isPro()) return true;
      this.panel(feature);
      return false;
    },
    panel(feature){
      const st = planStatus(subRow);
      const el = document.createElement('div');
      el.className = 'fb-ov';
      const reason = feature === 'productions' ? 'Starting a production of your own needs a plan.' : feature === 'coedit' ? 'Inviting people into your production needs a plan.' : '';
      const head = st.kind === 'trial-ended' ? 'Your free month is over' : 'Your plan';
      el.innerHTML = '<div class="fb-ov-box" style="width:560px"><div class="fb-ov-title">' + head + '</div>' +
        '<div class="fb-ov-sub">' + reason + ' Nothing was charged and nothing renews by itself. Your own productions stay stored for a year, and you can keep working in every production you were invited to — that is always free. To start and own productions, go Pro or enter a code.</div>' +
        '<div class="plan-cards">' +
          '<div class="plan-card pro"><span class="tag">Pro</span><b>' + (BILL.priceLabel || '€7 / month') + '</b><ul><li>Unlimited productions, every floor</li><li>Invite up to ' + SEATS + ' collaborators — free for them</li><li>Co-editing, share links, documents in your house style</li><li>iPad app and Floor Scanner sync</li></ul><button class="btn primary" id="plUp">Pro — ' + (BILL.priceLabel || '€7 / month') + '</button>' + ((BILL.priceIdYear || BILL.checkoutUrlYear) ? '<button class="btn" id="plUpYear" style="margin-top:6px">Pro — ' + (BILL.priceLabelYear || '€77 / year') + ' · one month free</button>' : '') + '<small>Cancel any time · billed by ' + (BILL.provider === 'paddle' ? 'Paddle' : 'Lemon Squeezy') + ', VAT handled</small></div>' +
          '<div class="plan-card"><span class="tag" style="background:var(--soft);color:var(--ink2)">Code</span><b>Have a code?</b><p>Festival, school, crew or launch codes give a free period of Pro.</p><div class="fb-row"><input id="plCode" class="fb-inp" placeholder="e.g. LAUNCH-2026" style="text-transform:uppercase"><button class="btn" id="plRedeem">Apply</button></div><p id="plMsg" class="fb-dim"></p></div>' +
        '</div>' +
        '<div class="fb-ov-actions"><span class="fb-dim">' + (st.kind === 'trial' ? st.days + ' trial days left' : st.kind === 'promo' ? 'Code active until ' + new Date(st.until).toLocaleDateString() : '') + '</span><span style="flex:1"></span><button class="btn" id="plClose">Not now</button></div></div>';
      document.body.appendChild(el);
      el.addEventListener('keydown', e=>e.stopPropagation());
      el.querySelector('#plClose').addEventListener('click', ()=>el.remove());
      el.addEventListener('click', e=>{ if(e.target === el) el.remove(); });
      el.querySelector('#plUp').addEventListener('click', ()=>{ el.remove(); this.upgrade('month'); });
      const yb = el.querySelector('#plUpYear'); if(yb) yb.addEventListener('click', ()=>{ el.remove(); this.upgrade('year'); });
      el.querySelector('#plRedeem').addEventListener('click', async ()=>{
        const c = el.querySelector('#plCode').value.trim(); if(!c) return;
        el.querySelector('#plMsg').textContent = 'Checking…';
        const ok = await this.redeem(c);
        el.querySelector('#plMsg').textContent = ok ? 'Done — enjoy.' : 'That code did not work.';
        if(ok) setTimeout(()=>el.remove(), 900);
      });
    },
    async upgrade(period){
      await ready;
      if(!billingOn) return;
      const year = period === 'year';
      if(BILL.provider === 'lemonsqueezy'){
        const u = new URL((year && BILL.checkoutUrlYear) || BILL.checkoutUrl);
        u.searchParams.set('checkout[custom][user_id]', FLOOR_USER.id);
        u.searchParams.set('checkout[custom][plan]', BILL.plan || 'pro');
        if(FLOOR_USER.email) u.searchParams.set('checkout[email]', FLOOR_USER.email);
        window.open(u.toString(), '_blank', 'noopener,noreferrer');
        pollPlan();
        return;
      }
      if(!window.Paddle){
        await new Promise((ok, bad)=>{
          const s = document.createElement('script');
          s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
          s.onload = ok; s.onerror = bad;
          document.head.appendChild(s);
        });
        if(BILL.environment === 'sandbox') window.Paddle.Environment.set('sandbox');
        window.Paddle.Initialize({token: BILL.token});
      }
      window.Paddle.Checkout.open({
        items: [{priceId: (year && BILL.priceIdYear) || BILL.priceId, quantity: 1}],
        customer: FLOOR_USER.email ? {email: FLOOR_USER.email} : undefined,
        customData: {user_id: FLOOR_USER.id, plan: BILL.plan || 'pro'},
      });
      pollPlan();
    },
    manage(){
      const url = (subRow && (subRow.cancel_url || subRow.update_url)) || BILL.portalUrl;
      if(url) window.open(url, '_blank', 'noopener,noreferrer');
      else alert('Manage your subscription via the e-mail receipt from ' +
        (BILL.provider === 'paddle' ? 'Paddle' : 'Lemon Squeezy') + '.');
    },
  };

  window.FLOOR_ACCOUNT = {
    overlay: accountOverlay, // exposed for the profile prompt + tests
    async open(){
      await ready;
      const {data: p} = await sb.from('profiles').select('*')
        .eq('user_id', FLOOR_USER.id).maybeSingle();
      accountOverlay(p || {}, false);
    },
    // one-time optional profile prompt after the first sign-in
    async maybeProfilePrompt(){
      await ready;
      const {data: p} = await sb.from('profiles').select('*')
        .eq('user_id', FLOOR_USER.id).maybeSingle();
      if(!p){ accountOverlay({}, true); return; }
      // the policy changed since they accepted it → show it again, once
      if(p.privacy_version && p.privacy_version !== PRIVACY_VERSION){
        if(typeof toast === 'function') toast('Our privacy policy was updated (' + PRIVACY_VERSION + ') — please have a look');
        const q = Object.assign({}, p, {privacy_version: null, privacy_accepted_at: null});
        accountOverlay(q, false);
      }
    },
  };
})();
