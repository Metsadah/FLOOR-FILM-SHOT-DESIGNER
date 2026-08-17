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
  window.FLOOR_SB = sb; // sharing (07-share.js) reuses the logged-in client

  // ---- login overlay: password (default) + magic link + reset ------
  // Password sign-in means returning on a new device/browser never has to
  // round-trip through email — only first-time signup (and password reset)
  // send one. Magic link stays available as a fallback for accounts that
  // never set a password.
  function loginOverlay(){
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;z-index:200;background:#F2F1EE;' +
        'display:flex;align-items:center;justify-content:center;font-family:-apple-system,Segoe UI,sans-serif;';
      document.body.appendChild(el);

      let mode = 'signin'; // signin | signup | magiclink | forgot | reset

      function field(id, type, ph){
        return `<input id="${id}" type="${type}" placeholder="${ph}" autocomplete="${
          type==='password' ? 'current-password' : type==='email' ? 'email' : 'off'}"
          style="width:100%;border:1px solid #E5E3DE;border-radius:8px;padding:9px 11px;
                 font-size:13px;margin-top:8px;box-sizing:border-box">`;
      }
      function btn(id, label, primary){
        return `<button id="${id}" style="width:100%;margin-top:10px;border-radius:8px;padding:10px;
          font-size:13px;font-weight:600;cursor:pointer;border:${primary ? 'none' : '1px solid #E5E3DE'};
          background:${primary ? '#4B6BFB' : '#fff'};color:${primary ? '#fff' : '#33322E'}">${label}</button>`;
      }
      function link(id, label){
        return `<button id="${id}" style="background:none;border:none;color:#4B6BFB;font-size:12px;
          cursor:pointer;padding:2px 0;text-align:left">${label}</button>`;
      }

      function render(){
        const body =
          mode === 'signin' ? `
            ${field('flEmail','email','you@example.com')}
            ${field('flPass','password','Password')}
            ${btn('flGo','Sign in',true)}
            <div style="display:flex;justify-content:space-between;margin-top:10px">
              ${link('flForgot','Forgot password?')}
              ${link('flToSignup','Create account')}
            </div>
            <div style="border-top:1px solid #E5E3DE;margin-top:12px;padding-top:10px">
              ${link('flToMagic','Email me a login link instead')}
            </div>` :
          mode === 'signup' ? `
            ${field('flEmail','email','you@example.com')}
            ${field('flPass','password','Choose a password (6+ characters)')}
            ${btn('flGo','Create account',true)}
            <div style="margin-top:10px">${link('flToSignin','Already have an account? Sign in')}</div>` :
          mode === 'forgot' ? `
            <div style="color:#8A877F;font-size:12.5px;margin-bottom:4px">
              We'll email you a one-time link to set a new password.</div>
            ${field('flEmail','email','you@example.com')}
            ${btn('flGo','Send reset link',true)}
            <div style="margin-top:10px">${link('flToSignin','Back to sign in')}</div>` :
          mode === 'reset' ? `
            <div style="color:#8A877F;font-size:12.5px;margin-bottom:4px">
              Set a new password for your account.</div>
            ${field('flPass','password','New password (6+ characters)')}
            ${btn('flGo','Set password & continue',true)}` :
          /* magiclink */ `
            <div style="color:#8A877F;font-size:12.5px;margin-bottom:4px">
              We'll email you a one-time login link — no password needed.</div>
            ${field('flEmail','email','you@example.com')}
            ${btn('flGo','Email me a login link',true)}
            <div style="margin-top:10px">${link('flToSignin','Use a password instead')}</div>`;

        el.innerHTML = `
          <div style="background:#fff;border:1px solid #E5E3DE;border-radius:16px;padding:30px 34px;
                      width:340px;box-shadow:0 18px 60px rgba(40,38,32,.14)">
            <div style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:16px">
              <div style="width:10px;height:10px;border-radius:3px;background:#4B6BFB"></div>FLOOR Studio
            </div>
            <div id="flTitle" style="color:#33322E;font-size:12.5px;font-weight:600;margin-top:10px">
              ${mode==='signin' ? 'Sign in' : mode==='signup' ? 'Create your account'
                : mode==='forgot' ? 'Reset password' : mode==='reset' ? 'New password' : 'Email login link'}
            </div>
            <div id="flMsg" style="color:#8A877F;font-size:12px;margin-top:6px;line-height:1.5"></div>
          </div>`;
        el.querySelector('div > div').insertAdjacentHTML('beforeend', body);
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
          if(pass.length < 6){ msg().textContent = 'Password needs at least 6 characters.'; return; }
          msg().textContent = 'Creating account…';
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
          if(!pass || pass.length < 6){ msg().textContent = 'Password needs at least 6 characters.'; return; }
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
            : 'Check your inbox for your FLOOR Studio login link (sent via Supabase — check spam the first time) and open it on THIS device. This page will unlock automatically.';
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
    if(data.session) return data.session.user;
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
})();
