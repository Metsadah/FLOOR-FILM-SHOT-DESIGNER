# FLOOR Studio on the iPad — Lite mode, Capacitor, one codebase

## 1 · Lite mode (shipped in v0.68)

The Shot designer alone, from the same files:

- open the app with **`?mode=shot`** (or set `mode: 'shot'` in `config.js`)
- the Mood / Script / Production tabs and the Share button disappear; the
  Scene info panel starts collapsed (the ☷ button brings it back)
- a **Load script…** button in the topbar takes pasted text or a
  `.txt` / `.fountain` / `.pdf` and turns every scene heading into a scene
- everything else — scenes, library, lights, cameras, groups, exports — is
  the normal app

Try it today on the iPad in Safari: `https://your-domain/index.html?mode=shot`,
then *Share → Add to Home Screen*. That already behaves like a full-screen app.

## 2 · Separate product, one codebase — the rules

The iPad app must never become a fork. It is a **build flavour**:

| | Web (full) | Web Lite / PWA | iPad app (Capacitor) |
|---|---|---|---|
| Files | index.html + js/ + styles.css | same | same, copied into the iOS shell |
| Switch | — | `?mode=shot` | `config.js` → `mode:'shot'` |
| Storage | IndexedDB / Supabase | same | IndexedDB **+ file backup** (see 3) |
| Accounts | yes | yes | optional sign-in (same Supabase) |
| Paid via | Paddle / Lemon Squeezy | same | App Store, one-time price |

Three rules keep the flavours in sync:

1. **Feature flags, never copies.** iPad-specific behaviour checks
   `window.FLOOR_MODE === 'shot'` or `window.Capacitor` at runtime, or hangs
   off `body.lite` in CSS. No second copy of a JS file, ever.
2. **One git tag per release, every flavour built from it.** The zip, the
   Netlify deploy and the Xcode archive come from the same commit. The
   version lives in `verChip` once; the iOS build number follows it.
3. **One project format.** `.floorproj` export/import is the bridge: a
   production made on the iPad opens in the full web app and back. Never add
   an iPad-only field without a migration in `migrateShot`/`loadProject`.

Shared features (lights, cameras, breakdown, exports) are identical by
construction. Big-screen-only features (co-editing, moodboards, call-sheet
PDFs) are merely hidden in Lite — still in the bundle, so nothing diverges.

## 3 · Next steps with the Apple developer account

Node.js is needed once for the Capacitor tooling (not on this Mac yet):
install the LTS from https://nodejs.org or `brew install node`.

```bash
# 1 · the native shell lives NEXT to the web repo, not inside it
mkdir ~/Documents/GitHub/floor-ipad && cd ~/Documents/GitHub/floor-ipad
npm init @capacitor/app@latest .   # name: FLOOR Shot Designer · id: com.zoutwater.floor
npm install @capacitor/ios @capacitor/filesystem @capacitor/share

# 2 · point it at the web files (a copy, refreshed per release)
#    capacitor.config.json → "webDir": "www"
rm -rf www && mkdir www
rsync -a --exclude '.git' --exclude '*.zip' --exclude 'supabase' \
  ~/Documents/GitHub/FLOOR-FILM-SHOT-DESIGNER/ www/
#    www/config.js → mode:'shot' (Supabase keys optional, no billing block)

# 3 · create + open the Xcode project
npx cap add ios
npx cap sync
npx cap open ios
```

In Xcode: *Signing & Capabilities* → your Team · *General* → display name
"FLOOR Shot Designer", deployment target iPadOS 16, **iPad only** (untick
iPhone), landscape + portrait. Run on your own iPad over the cable — that is
the real test of pencil, palm rejection and the panel toggles.

Then, in this order:

1. **Icon & launch screen** — one 1024×1024 icon (the FLOOR mark on white);
   Xcode generates the sizes. Launch screen: plain `#F2F1EE`.
2. **File backup shim** (~40 lines JS, only when `window.Capacitor` exists):
   on every save also write the `.floorproj` JSON to
   `Filesystem.Directory.Documents`; on boot, if IndexedDB is empty but a
   backup exists, offer to restore. iOS may evict web storage after weeks of
   non-use — this makes that harmless, and the Files app can see the projects.
3. **Share sheet** for exports: route `dlBlob()` through `@capacitor/share`
   on iOS (PDF/docx/PNG go to Files, Mail, AirDrop). Web behaviour unchanged.
4. **App Store Connect**: new app with the bundle id, **one-time price
   (~€29)**, no in-app purchases — that sidesteps Apple's subscription rules
   entirely. Privacy label: "Data not collected" if sign-in stays off by
   default; with optional sign-in declare e-mail + user content and link
   `privacy.html`.
5. **Review notes**: professional planning tool, fully usable offline;
   attach a demo `.floorproj`. First review takes 1–3 days.
6. **TestFlight first**: 5–10 DoP's for two weeks before public release.

## 4 · Release routine (per version)

```bash
cd ~/Documents/GitHub/floor-ipad
rsync -a --exclude '.git' --exclude '*.zip' --exclude 'supabase' \
  ~/Documents/GitHub/FLOOR-FILM-SHOT-DESIGNER/ www/ && cp config.ios.js www/config.js
npx cap sync && npx cap open ios     # bump build number → Archive → Distribute
```

Keep `config.ios.js` in the floor-ipad repo (mode flag, no billing) so the
copy step can never ship the web config by accident.
