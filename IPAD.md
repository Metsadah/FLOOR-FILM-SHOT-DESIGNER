# Floorboard on the iPad — Lite mode, Capacitor, one codebase

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

## 3 · The native shell (built — repo: ~/Documents/GitHub/floor-ipad)

Already in place there:

| | |
|---|---|
| `package.json` + Capacitor 8 | core, cli, ios, filesystem, share installed |
| `capacitor.config.json` | app id `com.zoutwater.floorshot`, name "FLOOR Shot Designer", webDir `www`, iOS background `#F2F1EE`, no bounce-scroll |
| `config.ios.js` | copied over `www/config.js` on every sync: `mode:'shot'`, no billing, sign-in off |
| `sync.sh` | web repo → `www/`, apply iOS config, strip the service worker, `cap sync` |
| `finish-setup.sh` | checks the toolchain, runs `cap add ios`, opens Xcode |
| `www/` | filled from the current web build |

Plus, in the web repo: **`js/08-native.js`** — the bridge (§4).

### What is still missing on this Mac

`xcode-select -p` points at `/Library/Developer/CommandLineTools`: only the
Command Line Tools are installed, **not Xcode itself**. Three steps, in order
(they need your password, so run them in Terminal yourself):

1. **Xcode** — Mac App Store → search "Xcode" → Get (7–10 GB, takes a while).
   Open it once so it installs its components, and in *Settings → Platforms*
   add the **iOS** platform.
2. **Point the tools at Xcode and accept the licence:**
   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license accept
   ```
   (Until this is done even `python3` refuses to run — same licence prompt.)
3. **CocoaPods** — Capacitor needs it to assemble the iOS project:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"   # Homebrew, if missing
   brew install cocoapods
   ```
   (Without Homebrew: `sudo gem install cocoapods`.)

Then:

```bash
cd ~/Documents/GitHub/floor-ipad
./finish-setup.sh          # verifies the toolchain, creates ios/, opens Xcode
```

In Xcode: *Signing & Capabilities* → your Team · *General* → display name
"FLOOR Shot Designer", deployment target iPadOS 16, **iPad only** (untick
iPhone), landscape + portrait. Connect the iPad by cable, choose it as the
run destination, press ▶.

### After it runs on your iPad

1. **Icon & launch screen** — one 1024×1024 icon (the FLOOR mark on white);
   Xcode generates the rest. Launch screen: plain `#F2F1EE`.
2. **App Store Connect** — new app, bundle id `com.zoutwater.floorshot`,
   **one-time price (~€29)**, no in-app purchases (that sidesteps Apple's
   subscription rules entirely). Privacy label: "Data not collected" while
   sign-in stays off; if you enable cloud sign-in later, declare e-mail +
   user content and link `privacy.html`.
3. **Review notes**: professional planning tool, fully usable offline; attach
   a demo `.floorproj`. First review takes 1–3 days.
4. **TestFlight first**: 5–10 DoP's for two weeks before the public release.

## 4 · The bridge (js/08-native.js, in the web repo)

One file, inert in every browser (`window.Capacitor` decides). Inside the
app it adds:

- **Exports → the iOS share sheet.** It patches `HTMLAnchorElement.click()`,
  so every existing export (PDF, .docx, PNG, .txt, .floorproj) reaches Files,
  Mail or AirDrop without one iPad-specific line elsewhere.
- **Automatic `.floorproj` backups** in Files → *FLOOR Shot Designer*,
  written when the project changed and when the app goes to the background.
  iOS can evict web storage after weeks of non-use; this makes that harmless.
- **A restore offer** on launch when storage is empty but backups exist — it
  runs *before* the first backup, so an evicted app can never overwrite the
  file it is about to restore from.

## 4 · Release routine (per version)

```bash
cd ~/Documents/GitHub/floor-ipad
rsync -a --exclude '.git' --exclude '*.zip' --exclude 'supabase' \
  ~/Documents/GitHub/FLOOR-FILM-SHOT-DESIGNER/ www/ && cp config.ios.js www/config.js
npx cap sync && npx cap open ios     # bump build number → Archive → Distribute
```

Keep `config.ios.js` in the floor-ipad repo (mode flag, no billing) so the
copy step can never ship the web config by accident.
