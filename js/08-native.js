// FLOOR — 08-native.js
// The iPad (Capacitor) bridge. In every browser this file does NOTHING: it
// returns immediately unless window.Capacitor reports a native platform, so
// the web app and the App Store app stay one codebase (see IPAD.md).
//
// What it adds inside the native app:
//   1. Downloads → the iOS share sheet (Files, Mail, AirDrop). Done by
//      patching HTMLAnchorElement.click(), so every existing export (PDF,
//      .docx, PNG, .floorproj, .txt) is covered without touching its code.
//   2. A .floorproj backup of every production in Files → FLOOR Shot Designer.
//      iOS may evict web storage after weeks of non-use; this makes that
//      harmless, and the projects show up in the Files app.
//   3. On first launch after such an eviction: offer to restore from those
//      backups.
'use strict';
(function(){
  const CAP = window.Capacitor;
  const isNative = !!(CAP && (CAP.isNativePlatform ? CAP.isNativePlatform() : CAP.isNative));
  window.FLOOR_NATIVE = {isNative, platform: isNative ? (CAP.getPlatform ? CAP.getPlatform() : 'ios') : 'web'};
  if(!isNative) return;

  const P = CAP.Plugins || {};
  const FS = P.Filesystem, SH = P.Share;
  const DIR = 'DOCUMENTS', FOLDER = 'FLOOR';
  const markBody = ()=>document.body && document.body.classList.add('native', 'ios');
  markBody() || document.addEventListener('DOMContentLoaded', markBody, {once:true});

  const b64 = blob => new Promise((ok, bad)=>{
    const r = new FileReader();
    r.onload = ()=>ok(String(r.result).split(',')[1] || '');
    r.onerror = ()=>bad(r.error);
    r.readAsDataURL(blob);
  });
  const safeName = n => String(n || 'file').replace(/[\/\\:*?"<>|]+/g, '-').slice(0, 80);

  // ---- 1 · downloads become the share sheet -------------------------------
  async function shareBlob(name, blob){
    if(!FS || !SH){ toastIf('Sharing is not available in this build'); return; }
    try{
      const path = FOLDER + '/' + safeName(name);
      await FS.writeFile({path, data: await b64(blob), directory: 'CACHE', recursive: true});
      const {uri} = await FS.getUri({path, directory: 'CACHE'});
      await SH.share({title: name, url: uri, dialogTitle: name});
    }catch(e){
      if(!/cancel/i.test(e && e.message || '')) toastIf('Could not share that file');
      console.warn('[native] share failed', e);
    }
  }
  function toastIf(msg){ if(typeof toast === 'function') toast(msg); }

  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function(){
    const href = this.getAttribute('href') || '';
    if(this.download && (href.startsWith('blob:') || href.startsWith('data:'))){
      const name = this.download;
      fetch(href).then(r=>r.blob()).then(b=>shareBlob(name, b))
        .catch(e=>console.warn('[native] could not read the download', e));
      return;
    }
    return origClick.apply(this, arguments);
  };

  // ---- 2 · .floorproj backups in the Files app ----------------------------
  async function backupNow(){
    if(!FS || typeof project === 'undefined' || !project) return;
    try{
      const assets = (typeof collectAssets === 'function') ? await collectAssets() : {img:{}, file:{}};
      const pack = {floorproj:1, exported:new Date().toISOString(),
        name: project.shootName || 'production', project, assets};
      const nm = safeName((project.shootName || 'production').replace(/\s+/g, '_')) + '.floorproj';
      await FS.writeFile({path: FOLDER + '/' + nm, data: JSON.stringify(pack),
        directory: DIR, encoding: 'utf8', recursive: true});
      lastStamp = stampOf();
    }catch(e){ console.warn('[native] backup failed', e); }
  }
  // cheap change detector: scene count + names + object counts + dirty flag
  function stampOf(){
    try{
      return (project.shootName || '') + '|' + project.scenes.length + '|' +
        project.scenes.map(s=>(s.name || '') + ':' + (s.objects || []).length +
          ':' + (s.walls || []).length).join(',');
    }catch(_){ return String(Date.now()); }
  }
  let lastStamp = null;
  setInterval(()=>{
    if(typeof project === 'undefined' || !project) return;
    if(typeof dirty !== 'undefined' && dirty) return;     // mid-edit: wait
    const s = stampOf();
    if(s !== lastStamp) backupNow();
  }, 90000);
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden) backupNow(); });
  window.addEventListener('pagehide', ()=>{ backupNow(); });

  // ---- 3 · restore after an eviction --------------------------------------
  async function offerRestore(){
    if(!FS) return;
    try{
      const idx = (typeof loadProjectIndex === 'function') ? (await loadProjectIndex()) || [] : [];
      const hasWork = idx.length > 1 ||
        (typeof project !== 'undefined' && project && project.scenes &&
         project.scenes.some(s=>(s.objects || []).length || (s.walls || []).length));
      if(hasWork) return;                                  // nothing was lost
      const {files} = await FS.readdir({path: FOLDER, directory: DIR}).catch(()=>({files: []}));
      const backups = (files || []).filter(f=>/\.floorproj$/i.test(f.name || f));
      if(!backups.length) return;
      const names = backups.map(f=>f.name || f);
      if(!confirm('Found ' + names.length + ' backed-up production' + (names.length === 1 ? '' : 's') +
        ' on this iPad:\n\n' + names.join('\n') + '\n\nRestore them now?')) return;
      for(const nm of names){
        const {data} = await FS.readFile({path: FOLDER + '/' + nm, directory: DIR, encoding: 'utf8'});
        const f = new File([data], nm, {type: 'application/json'});
        if(typeof importFloorproj === 'function') await importFloorproj(f);
      }
    }catch(e){ console.warn('[native] restore check failed', e); }
  }
  // run once the app has booted (loadProject + the first render are done)
  const waitBoot = ()=> (typeof project !== 'undefined' && project && !document.getElementById('loading'))
    // restore FIRST, then back up — otherwise an empty app (right after an
    // eviction) would overwrite the very backup it is about to restore from
    ? setTimeout(()=>{ offerRestore().then(backupNow, backupNow); }, 1200)
    : setTimeout(waitBoot, 400);
  waitBoot();
})();
