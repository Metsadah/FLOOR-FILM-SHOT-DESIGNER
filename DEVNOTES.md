# FLOOR Studio — Developer notes (handover)

*Written by the Claude sessions that built v0.1 → v0.12, for whichever session
comes next. Read this before touching code.*

## What this app is
Browser-based pre-production studio for filmmakers. Vanilla JS, **no build
step** (deliberate — plain files, copy/deploy). Hosted on **Netlify**
(drag-and-drop deploy; GitHub Pages abandoned during a July 2026 Actions
outage). One shared canvas engine drives four tabs: Moodboard · Script &
Storyboard (`write`) · Shot designer (`design`) · Production (`org`).

## Module map (classic scripts, global scope, load order matters)
- `js/00-catalog.js` — prop/camera/lens catalogs, drawing helpers
  (`drawNoteShape`, `drawActorIcon`, `trimText`, `shortUrl`, `wrapCanvasText`),
  `LIST_CARDS` (list-card column specs) + `LIST_GEO` (shared card geometry).
- `js/01-state-render.js` — state, storage, migrations, `render()`,
  `drawObjectShape()` (every object type draws here), `activeScene()`,
  multi-project storage, ResizeObserver. Also the People registry:
  `normalizeProduction()`, `peopleReg()`, `cardPeople(o)`, `moveListRow()`.
- `js/02-selection.js` — `handleList()` (which resize/rotate handles an
  object gets), selection drawing.
- `js/03-input.js` — ALL pointer/keyboard input, history (undo/redo,
  `snapshotState`/`applyState`), dblclick routing, tap actions, drop handler,
  `zoomFit`. List-card chips/grips are hit-tested in pointerdown (chips live
  outside the frame, so `hitObject` can't catch them).
- `js/04-ui.js` — selection bar (`refreshSelBar`), library (`buildLibrary`,
  `boardTile`), the field-aware editor (`openNoteEditor` + `openTodoItem` +
  `openTableCell` + `openListCell`/`listCellAt`/`addListPerson`/
  `removeListPerson`), `dropLib` object creation.
- `js/05-app.js` — scene list, info panel, stills, exports (`showExportPop`,
  `doPNGExport`, `runPDFExport` = hand-rolled multi-page PDF,
  `renderShotPlan`), the day planner (`openPlanPop` — chains scene times with
  per-scene `travelMin`/`setupMin` gaps; PLAN button in the Scenes side-head),
  boot.
- `js/06-tabs.js` — tab switching, moodboard/scriptboard/prodboard bootstrap,
  script parsing + breakdown, production cards, weather (Open-Meteo), pdf.js
  lazy loader, audio, file/audio creators, trash can, production switcher.
- `js/vendor/` — self-hosted supabase.js, pdf.min.js + pdf.worker.min.js
  (NEVER use CDNs — user's ad-blocker eats them; this cost us an afternoon).
- `js/07-share.js` — sharing rungs 2 + 3. Rung 3 (v0.16, co-editing):
  `initSharedProductions` (fetch memberships after login, then
  `wrapStorageForShared` — window.storage routes a shared production's
  `sd:project:/sd:img:/sd:file:` keys to `production_docs`, falling back to
  personal kv for pre-share assets; `window.__sharedCurrent` set in
  loadProject). `convertToShared` copies doc + assets up and adds the owner
  as member; `createEditorInvite` → `?join=CODE` links redeemed via the
  `redeem_production_invite` RPC in boot (05 polls for the fn — classic
  script timing). `sharedPresenceGuard` = the async-editing warning ("X
  opened this N min ago — last save wins"). Members/invites UI lives in the
  Share popover; the switcher marks shared productions ⇄, editors "leave"
  instead of delete, owner delete cascades FOR EVERYONE (confirmed loudly).
  Rung 2 (v0.15): owner share popover
  (`createShareLink`/`buildSharePop`), the `?view=TOKEN` read-only viewer
  (`__floorViewerBoot` — 05's boot polls for it because timers can fire
  BETWEEN classic scripts), comment pins (`drawCommentPins`, `__viewerTap`,
  Supabase Realtime). Snapshot = project + assets JSON in the public
  `shares` Storage bucket; tables `shares` + `share_comments` (RLS: owner
  manages shares, anyone reads/inserts comments — token is the secret).
  Adapter exposes `window.FLOOR_SB`/`FLOOR_USER` and self-skips on ?view=.
- `supabase-adapter.js` — magic-link login + cloud kv storage. Runs in
  <head>; storage chain: window.storage → FLOOR_STORAGE → IndexedDB.

## Data model essentials
- `project.scenes[]` — each scene IS a board (walls, objects, stills) and
  holds `scene.shots[]`; **every camera object has `shotId`** mapping it to
  one shot. `activeShot` is a legacy alias of `activeScene`.
- Project-level boards: `project.moodboard`, `project.scriptboard`,
  `project.prodboard` — scene-shaped, routed by `activeScene()` via
  `activeTab` + `BOARD_TABS = {'mood','org','write'}`.
- **Multi-select (v0.15):** `sel = {type:'multi', ids:[…]}` from the marquee
  tool (`M`, toolbar button; bbox-overlap test, locked objects excluded).
  Dragging any member = `moveMulti` (translates x/y + p1/p2/mid/pts/path per
  object); duplicate/delete handle multi; handleList returns no handles for
  it. `switchTab`/Escape clear it like any selection.
- **Tables grow by corner drag (v0.15):** the `tgrow` handle (bottom-right)
  adds/removes rows & cols spreadsheet-style — `drag.left/top` anchor the
  top-left while the card self-sizes around its center. + chips are ALSO
  hit-tested in pointerdown now (lesson 9 applied to tables).
- **Storyboard rows chain (v0.15):** `addSbRowBelow(o)` (04) — new sbrow
  under the selected one, same `sceneId`, everything with y > o.y shifts
  down by o.h+14 so scenes never overlap. + chip under a selected sbrow.
- **Day header (P3, v0.15):** `cat:'dayheader'` — object-owned fields
  {date, call, shootCall, wrap, place, lat, lon}; geometry in `DAYH` (00);
  editor fields `dh:<key>`; sunrise/sunset = `sunTimes()` (00, NOAA math,
  ±2 min, local tz) from lat/lon geocoded ONCE from the first filled
  location (`dayheaderSunFetch`, Open-Meteo geocoder). This card + Crew +
  Location + Weather are the call-sheet generator's direct inputs.
- **.floorproj (v0.15):** `exportFloorproj`/`importFloorproj` (06, buttons
  in the production switcher) — one JSON with project + all images/files
  (`collectAssets`). Import = new production id, assets written back to kv.
- **Field cards (P2, v0.14):** `cat:'fieldcard'`, `kind:'prodinfo'|'location'`
  — label:value rows from `FIELD_CARDS` (00), values live in PRODUCTION DATA,
  not on the object: prodinfo ↔ `project.production.company/address/email/
  phone` + `project.shootName`; location ↔ one `production.locations[]` entry
  bound by `o.locId` (drop binds the first unbound location, else creates
  one; deleting the card keeps the entry). Routing via `fieldGet/fieldSet`
  (01), editor field id `fval:<rowIdx>`. Deleting a location card orphans its
  entry harmlessly — a future locations manager can garbage-collect.
- **Paste-to-import (P2):** listcard selBar → `showPasteImport` (04);
  `parseContactLine` pulls email/phone/call-time by regex, splits the rest on
  commas/dashes into name + role; "role, name" checkbox flips them. Preview
  before insert; people land in the registry with the card's tag.
- **Checklist 2.0 (P2):** the Checklist library tile drops a normal `todo`
  object and opens `showChecklistPicker` (04) with `CHECKLIST_TEMPLATES`
  (00): camera / grip & light / location / wrap / blank.
- **People registry (P1, v0.12):** `project.production.people =
  [{id, name, role, phone, email, tag:'crew'|'cast'|'client', call}]` — ONE
  list per production; the Crew/Cast/Client cards on the prodboard are
  filtered live views of it (windows, not silos). `normalizeProduction()`
  (called from `loadProject`) creates it and folds the org-panel era
  `production.contacts` in once, tagged crew. `production.company/lead/notes/
  locations` are still stored (untouched) — they feed the P2 field cards.
  The old right-side org panel is GONE (markup, builder, CSS).
- Multi-production: index in kv key `sd:projects`, each at
  `sd:project:<id>`, current id at `sd:current`. Images `sd:img:<id>`,
  files/audio `sd:file:<id>`. Switching productions = save + set current +
  `location.reload()` (deliberate: clean state beats clever rebuild).
- Migrations live in `loadProject`/`migrateShot` — never rename user data,
  always tolerate old snapshots (`applyState` reads both old & new keys).
  `snapshotState` includes `production`, so registry edits are undoable.
- Units: 1 world unit = 1 cm; grid dots 50 cm; default zoom .65; `zoomFit`
  clamped to max .9.
- **Walls can curve (v0.13):** `wall.mid` is the ON-CURVE midpoint of a
  quadratic bend (null = straight; same convention as line objects). ALL wall
  geometry goes through `wallSamples`/`wallGeom`/`wallPointAt` (01) —
  openings' `t` is an arc-length fraction, hit-testing walks the samples,
  the `wm` handle bends (drop near the chord center to straighten). Walls are
  born UNLOCKED since v0.13 (locking is opt-in via the selection bar).
- **Scenes carry `travelMin`/`setupMin` (v0.13)** — the day planner's gap
  minutes before that scene; the future call-sheet/stripboard work should
  reuse them.
- **Lights throw beams (v0.13, reworked v0.14):** `LIGHT_BEAMS` in 00 maps
  light kinds to {spread, range, axis, tint} or {omni} — spots emit along
  local +x like camera FOV, panels along +y (their long face). Yellowish
  (`BEAM_TINT`), alpha .26 at the source. Directional lights get amber
  beam-edge handles (`beam A/B` in handleList, drag = `beamfov` case) that
  store per-object `o.beamSpread`/`o.beamRange`; "Reset beam" clears them;
  `o.beam === false` hides the beam (Beam toggle in selBar).
- **Colorless objects hide the swatch row** (v0.14): image, infocard,
  colorcard, script, fieldcard + the negfill prop — recoloring them changes
  nothing on canvas, so refreshSelBar skips the swatches (`colorless` guard).

## Object types on canvas (drawn in drawObjectShape, 01)
camera, actor, note, text, line (bendable via `o.mid`), link (v0.19:
bookmark card — SQUARE preview on top [video thumb via dataURL, or tinted
placeholder with the domain initial], title + domain strip below; width
resizable, height = w + 38 enforced by the renderer; legacy pill links
reflow automatically; auto-title from URL unless custom label), ink,
**avscript** (v0.18 — row-based AV script: TIME | AUDIO | VIDEO with
scene-#/still/notes column toggles in selBar; rows self-size to wrapped
text via `AVS`/`avCols` in 00; editor fields `avr:<rowId>:<key>` — Enter is
a NEWLINE in text cells, Tab navigates, Enter navigates only in time/sc;
still cells reuse `pickSbImage(row)`; grips/chips like listcard; the old
free-text `script mode:'av'` still renders for legacy boards but the
library now drops avscript), **colcard** (v0.18 — title strip + free-text
body, fields `cc:title`/`cc:text`, width resizable, height auto),
infocard (v0.18: restyled to shared chrome, titled SHOT INFO, library tile
"Shot info card" on the design tab ONLY), colorcard, todo (cell rows; tap checkbox zone <34px toggles;
dblclick row edits; Enter chains new items), table (SELF-SIZING columns from
content — **no resize handles by design**; `o._colWs` cached; + chips when
selected; Tab/Enter hop cells), **listcard** (`kind:'crew'|'cast'|'client'`;
renders title strip + typed columns from `LIST_CARDS[o.kind]`; rows =
`cardPeople(o)`, NOT stored on the object — the registry is the truth;
self-sizing like table; single click edits a cell; + chip below adds a
person, × chips remove one from the registry, left dotted grip drags a row
to reorder (live, via `moveListRow`); hit zones cached on the object:
`_plusRow`, `_rowDels`, `_rowRects`, `_colWs`), file (PDF gets first-page
preview via pdf.js), audio (`o._playZone`, tap ▸ toggles; one global
player), script (film = one column, av = two columns VIDEO|AUDIO, dblclick
half to edit; Break down + Import in selBar), sbrow (storyboard row: title |
image | desc zones, linked to a scene via `sceneId`), weather (place+date+
Fetch in selBar), image (captions under, underlay mode).

## The field editor system (04) — used by everything editable
`openNoteEditor(o, field, rect, fs)` — field can be `'text'`, `'textR'`,
`'title'`, `'desc'`, `'todo'`, `'item:i'`, `'cell:r:c'`, or
`'person:<personId>:<key>'` (writes straight into the registry — that's what
makes edits sync across every card viewing that person);
`editorGetValue`/`editorSetValue` route them. Editor is `position:fixed`,
anchored via `cv.getBoundingClientRect()` + `toScreen()` — do NOT go back to
container-relative positioning, it caused misalignment bugs. While a field
is being edited, the draw code SKIPS rendering that field (check
`noteEditor.id/field`) or you get text-over-text ghosting.
Tab / Shift-Tab / Enter flow for list cards lives in the keydown handler
inside `openNoteEditor`; Enter past the last row chains a NEW person unless
the current row is entirely blank (keeps the registry junk-free).

## Hard-won lessons (the scar tissue — respect these)
1. **Canvas transform discipline.** `drawObjectShape` wraps the main path in
   one `ctx.save()`/translate/rotate … `ctx.restore()`. An early `return`
   inside a branch WITHOUT restoring leaks the transform and breaks the
   ENTIRE board (objects fine, selection/hit-test displaced → "clicking
   handles pans the board"). If a branch must return early, `ctx.restore()`
   first (see the note + file branches).
2. **Canvas recalibration.** Tab switches change layout WITHOUT a window
   resize → stale bitmap → stretched visuals vs true hit coords. A
   ResizeObserver on `wrap` (01) fixes it. Don't remove it.
3. **Pointerup has no wx/wy.** Compute via `evtPos(e)` + `toWorld()` inside
   any tap-action block there. Referencing undefined coords crashes the
   handler mid-gesture and the drag never releases ("won't let go" bug).
4. **Drop routing:** images → `addBoardImage`, audio → `addBoardAudioAt`,
   everything else → `addBoardFileAt` (PDFs get previews). Never feed
   non-images to the image path — invisible broken objects.
5. **Rotation handles:** design tab = everything rotates; board tabs = only
   images (`handleList` in 02 gates on `BOARD_TABS` + cat). `table`,
   `listcard`, `ink` get NO handles anywhere (self-sizing by design).
6. **Patching methodology** (how this codebase is safely edited blind):
   python `rep(old,new)` with `assert count==1` exact anchors; a failed
   assert rolls back the WHOLE run's edits to that file — re-check every
   anchor after a failure. Files contain literal `…` and `—` chars (not
   escapes). `showExportPop` lives in 05, `handleList` in 02 — check before
   assuming. Syntax-check every file with `new Function(src)` after edits.
7. **Version discipline:** bump the `#verChip` in index.html, the SW cache
   name (`floor-shell-vN`), and the zip name (`floor-repo-vN.zip`) together
   every release. Identical zip names caused a lost afternoon once.
   Current: verChip v0.20 ↔ floor-shell-v19.
   v0.20: **callsheet card** = READ-ONLY live composite (day header +
   registry + first filled location + weather card + sunTimes); sections
   toggle via `o.inc` in selBar; nothing on it is editable by design — the
   roadmap's "call sheet is a view" made literal. The old Call sheet /
   Day schedule NOTE templates are gone (PROD_CARDS deleted); Day schedule
   is now a colcard preset (dropLib colcard accepts libDrag.title/text/cw).
   Mood tab renamed "Mood & inspiration" (`buildMoodLibSection` = brainstorm
   colcard presets). Floating label chip suppressed for todo/avscript
   (title lives in the strip).
   v0.21 — roadmap 1.4 COMPLETE: the call sheet exports itself as a
   one-page A4 portrait PDF (`exportCallSheetPDF` in 06 — renders the card
   alone to an offscreen canvas via the ctx-swap trick, hand-rolled PDF
   like exportBoardPDF; "Export PDF ↓" in its selBar). And it fetches its
   OWN weather: `callsheetWeather` caches an Open-Meteo forecast on the
   card (`o.wx`, keyed on date+lat/lon so render() may call it freely) from
   the DAY HEADER's date + geocoded place — no Weather card needed; the
   manual card is only a fallback. Out-of-range dates render "forecast
   opens ~16 days before the shoot"; "Weather ↻" in selBar clears the cache.
   Color card (v0.19): selBar has a native `<input type=color>` (macOS gives
   the wheel) synced two-way with the hex field → `o.hex`. NEVER draw
   external favicons/OG images onto the canvas without routing them through
   a stored dataURL first — a tainted canvas kills every PNG/PDF export.
   Card chrome rule (v0.18): every smart card = white shell, 3px radius,
   26px title strip tinted `o.color` at .14 alpha, 700 11px UPPERCASE
   title, #E5E3DE grid, #D8D5CF frame — copy an existing branch, don't
   invent new chrome.
8. **closeNoteEditor re-entrancy (fixed v0.12, keep it fixed).** Removing
   the focused textarea re-fires its own `blur` → `closeNoteEditor` again
   mid-removal → NotFoundError that aborts whatever handler called it (this
   silently killed the table's Tab-hop too). `closeNoteEditor` must null the
   global `noteEditor` BEFORE touching the DOM, and `ta.remove()` stays in a
   try/catch. Any future editor-closing code: same rule. Related (fixed
   v0.13): the editor's Escape branch must `stopPropagation()` and `return`
   after closing — reading `noteEditor.field` after close threw, and the
   leaked Escape hit the global handler which nuked the selection/tool.
9. **Chips outside the frame need pointerdown hit-tests.** `hitObject` pads
   by only `6/scale`, so chips drawn beyond the object edge (table +, list
   ×/+) are unreachable through the normal tap path at most zooms. List-card
   chips are caught in pointerdown's selected-object block (03) before
   `hitObject` runs; the old table chips still rely on the pad and only work
   near the frame — copy the listcard approach if you touch them.
10. **Local testing without Supabase login:** make a throwaway copy of
   index.html with the `js/vendor/supabase.js` + `supabase-adapter.js`
   script tags AND the CDN self-heal snippet stripped → app falls back to
   IndexedDB, no login. Serve with `python3 -m http.server` started from a
   shell in the repo dir — sandboxed preview servers 404 on ~/Documents
   paths (macOS TCC). Delete the copy before shipping.
   Two more testing gotchas: the FIRST synthetic clicks/keys after a
   navigation get swallowed until the page has real focus — do a throwaway
   click and CONFIRM state changed before trusting pointer tests. And a
   cached-but-undecodable image used to busy-loop render() (fixed v0.15 in
   the image branch — only schedule loadStill when nothing is cached).
   **Also: cache-bust or you verify stale code.** The SW + Chrome's HTTP
   cache happily serve old js after a mid-session edit (this ate an hour —
   a "failing" fix was simply never loaded). In the local copy: append
   `?v=<timestamp>` to every `./js/0*.js` src AND neuter
   `navigator.serviceWorker.register`. Confirm the loaded code with
   `someFn.toString().includes('<new snippet>')` before debugging it.

## v0.32 — call sheet props, scene reorder, script on the info card
1. Call sheet PROPS section (inc.props, toggle in the selBar, default on):
   mirrors the Prop list card on the prodboard (falls back to pure
   detection via `propListGroups({props:{},hide:{},done:{}})` when no card
   is placed). Card renderer + callSheetText both emit it; the PDF renders
   the card so it rides along free. Sections follow project.scenes order.
2. Scene reorder in the Shot designer drawer: the row NUMBER is the grip
   (pointer events + setPointerCapture, touch-action:none for iPad).
   Midpoint rule gives the insertion index, blue border-top marks the
   slot, splice on release (`fin = to > i ? to-1 : to`). Scene numbers
   (s.scene) intentionally do NOT renumber — shooting order ≠ script
   order. The reorder flows into schedule/props/callsheet automatically.
3. Shot info card shows the scene's SCRIPT (the panel's iScript box),
   wrapped, clipped to card height with an "… (pull the card taller)"
   tail — the card still has free resize handles.
LOCAL-TEST SCAR TISSUE: index.html scripts are `src="./js/…"` — a
cache-bust regex matching only `src="js/` silently no-ops, AND the real
service worker may already control localhost from an earlier run, serving
STALE js from CacheStorage. Symptoms: fn.toString() shows old code while
curl shows new. Fix: regex `src="(\.?/?)js/`, replace /serviceWorker/g,
and when in doubt unregister SWs + caches.delete(...) in the page console
before trusting any test result.

## v0.31 — TV + TV cabinet props
`tv` (Tech group, slim top-down slab + center foot, 110×18) and `tvunit`
(Furniture, split doors + handles + open media shelf, 160×45). Note: 'TV'
is 2 chars so the prop-list SCRIPT scan skips it (min length 3 — avoids
false hits); board placement still lists it.

## v0.63 — iPad mode (browser-detected)
Detection at 05-app top-level: `window.IS_TOUCH = maxTouchPoints > 1`
(iPadOS Safari masquerades as macOS — touch points are the tell),
`IS_PAD = IS_TOUCH && min(screen dims) >= 600`; body gets .touch/.pad.
Panels: the existing #libToggle/#panelToggle drawer buttons now do
double duty — ≤900px unchanged (slide-in drawers), >900px they toggle
body.hideL/.hideR which display:none the panel and re-template #main
(CSS at END of styles.css, min-width:901 block; tab-mood+hideL needs
its own 1fr rule). Collapsed state persists in
localStorage.floorHideL/R (pad only). Canvas re-sizes itself via the
existing ResizeObserver. Buttons visible on body.touch only — desktop
mouse users see nothing new.
selBar: on IS_TOUCH it prefers ABOVE the selection (hand covers the
area below), falling back below when there's no room.
Touch targets: H_R 6→9 on touch (handle draw + hit share it), 40px
toolbar buttons, fatter sbtn/sw/select/lbl paddings, and — hover does
not exist on glass — .shot-item .mini and .lib-item .del-custom render
at ~.55 opacity instead of opacity:0. #cv gets -webkit-touch-callout /
user-select none (long-press magnifier suppressed).
NB: the browser-pane tablet preset does NOT emulate touch (only
width<768 does) — test by forcing body classes + window.IS_TOUCH.

## v0.62 — cast/cameras on top, direct waypoints, set→next, real exports
(1) Actors + cameras ALWAYS win: render() draws them in a second pass
(onTop), and hitObject() got a prio loop (actors/cameras tested before
everything else) — an actor under a rug/image/card stays clickable.
(2) Movement points are grabbable WITHOUT selecting the owner: a
pointerdown scan (before hitObject) checks every camera/actor's
o.path points within (H_R+4)/scale and starts drag kind 'point'
directly, selecting the owner. Selected-object handles still win
(hitHandle runs earlier).
(3) Scene list: 4th mini button ⇣ merges the SET (walls + props, no
cast/cameras, sun if target has none) into the NEXT scene — fresh ids,
grp remapped per copy so repeat-copies don't cross-group.
(4) Exports REWRITTEN after Pages refused HTML-as-.doc: real .docx =
STORED zip (hand-rolled: CRC32 table + local/central headers in
zipBlob) of OOXML parts (docxBlob: [Content_Types], _rels/.rels,
document.xml + rels, media/*). AV .docx = landscape w:tbl with the
BOARD's columns (avCols order incl. custom) + stills as wp:inline
images (EMU = px*9525, rels rImgN). Validated with unzip -t, xmllint
AND `textutil -convert txt` (Apple's own importer = the Pages code
path). AV PDF also rewritten: A4-landscape TABLE mirroring the board
(column widths = avCols scaled to page, wrapped cells, JPEG stills as
DCTDecode XObjects, header repeats per page); proven by rendering with
`qlmanage -t`. pdfEsc now maps — – ’ ‘ “ ” … to Latin-1 lookalikes
instead of '?'. Script exports: textPDF (portrait) + exportScriptDocx.

## v0.61 — group/ungroup + script/AV exports (PDF & Word)
Grouping: `o.grp` / `w.grp` (shared gid, 'g'+uid()) on objects AND
walls. A pointerdown on any member (object, track, wall — three hooks
in the select-tool branch) calls groupSelect() → whole-group multi
selection + multiMoveDrag() (the moveMulti construction, factored out
of the sel.type==='multi' branch). Degenerate 1-member groups return
false and fall through to single selection. Group/Ungroup buttons live
in the MULTI selBar (Group hidden when the selection already is exactly
one whole group); a marquee'd single member also gets Ungroup next to
Lock. Duplicates: multi-duplicate remaps gids (old→fresh per gid) so a
copy never tows the originals; single duplicate drops grp entirely.
Scene-duplicate keeps gids verbatim — fine, lookups are per-scene.
Dblclick still edits INSIDE grouped cards (dblclick does its own
hitObject → single sel).
Exports: textPDF(title, blocks) in 06-tabs — A4 portrait, blocks of
{t,bold,dim,size,gap}, auto-paginating, same hand-rolled PDF assembly
as makePDF (Latin-1 bytes; pdfEsc strips non-Latin1 to '?'). docBlob =
BOM + HTML with application/msword mime — Word/Pages open it; AV .doc
is a real <table> (SC/TIME/SEC + text cols incl. custom) and embeds
row stills as data-URI <img> when imgCache has them. Script block:
'PDF' / '.doc' next to Export .txt (AV-mode blocks = VIDEO + AUDIO
sections). AV card: 'PDF' / '.doc' after Break down. All go through
dlBlob(name, blob) — tests stub window.dlBlob to intercept.

## v0.60 — SEC/TIME columns, "old" scenes, camera frames, LED light
Four asks in one release.
(1) AV timing: the old TIME column was really a duration → split. SEC
(key 'dur') is the editable shot length ("30", "30s" or "0:30" —
avDurSec in 00-catalog parses all three); TIME (key 'time') is COMPUTED
each render as the running start time (avFmtTime). Renderer migration:
`r.dur === undefined → r.dur = r.time` once, then r.time is overwritten
every render. Time cells are not editable — openAvCell redirects
'time'→'dur', Tab-keys filter drops 'time'. SCARS: any "is this row
blank" check must use dur, NOT time (time is always "0:00"+ now — the
paste-overlay's pristine check bit this); breakdown durations read
`r.dur !== undefined ? r.dur : r.time` for unmigrated JSON.
(2) Breakdown safety: updates never touched sc.shots/objects (still
true), and scenes whose number VANISHED from the script are kept and
renamed `<name> old` (guard: skip names already ending in "old" —
re-runs must not stack " old old"). Their numbers stay in `taken`, so
a later new beat can't silently steal an old scene's number.
(3) Cameras: the label chip now composes shot name (looked up in
activeShot().shots by o.shotId) · label · framing · lens "35mm" ·
support; chips were already draggable (drag kind 'label'). Dragging a
board image onto a camera (<55 world units) sets cam.imgId — the
existing director's-viewfinder frame — and consumes the image card;
the branch sits BEFORE the AV-row image-drop in pointerup, as an
if/else chain (an early return there would skip the shared drag
cleanup at the bottom of pointerup).
(4) kind 'cstand' is now the LED light: renamed, given a LIGHT_BEAMS
entry, and the renderer swaps in cstandBeam(o) — wattage (o.watt,
60→1200, default 300) scales throw by sqrt(watt/300); o.lmod
'lantern' → omni, 'dome100'/'dome150' → wider+softer beam (beam.soft
multiplies alpha) + dashed dome circle on the icon (50/75 r).
selBar: watt + modifier selects, cstand-gated inside the light block.
TEST scar: a hand-made test camera without `range` NaN-poisons
contentBounds → zoomFit → "NaN%" zoom. Not a product bug — library
cameras always carry range. Give test cameras range+fov.

## v0.59 — multiple films per production + script→AV bridge
A production can hold several scripts, each with its own breakdown, and
scene numbers repeat across films ("twee keer scene 1"). The FILM NAME
is the identity: breakDownAvCard takes it from o.label (prompting once
and writing it back when empty), stamps sc.film + sc.filmSrc, and
scopes EVERYTHING per film — number matching (`mine` matches
s.film===film OR s.filmSrc===o.id; name first, so an AV table and a
script block with the same label sync the SAME scenes), the freshNo
`taken` set (other films' numbers are free to reuse), and insertion
(new scenes splice in after the film's last scene, not at the end).
Untagged pre-v0.59 scenes stay adoptable by bare number.
buildShotList groups under uppercase film headers when any scene has
film/filmSrc; in select mode a header click ticks/unticks its whole
film. Traditional script breakdown (breakDownScriptBlock) unchanged —
classic pass, sbrow column, global sequential numbers — but now tags
sc.film/filmSrc from the block's label. NEW avTableFromScript ('→ AV
table' on script blocks): one AV row per parsed scene, heading+body in
VIDEO, SC numbers REUSED from an earlier old-way breakdown of the same
block (parse order = creation order) so the AV sync updates those
scenes instead of duplicating — that number-reuse plus name-matching
is what makes mixing both paths safe.
TEST scar: in javascript_tool payloads '\\n' arrives as literal
backslash-n, not a newline — join with String.fromCharCode(10) when a
test needs real multi-line text.

## v0.58 — AV breakdown syncs by scene number + scene multi-delete
breakDownAvCard REWRITTEN (06-tabs): rows group by the SC column (same
number = one scene, empty SC = continuation of the row above) and the
breakdown SYNCS with the Shot designer — a scene whose `scene` field
matches the group number is UPDATED (script always refreshed, sceneDesc
only if empty, duration = summed row times in SECONDS then ceil'd once,
row stills appended dedup'd into sc.stills), never duplicated. Rows with
no number get one minted (skipping every number already used by rows OR
existing scenes), WRITTEN BACK into r.no, and o.cols.no is switched on —
that write-back is what makes the next re-run idempotent. User renames
of matched scenes survive (name untouched on update). The old behaviour
of dropping sbrow storyboard cards next to the AV card is GONE on
purpose ("niet meer nodig om er kaarten naast te zetten"). Notes column
now reads REGIE NOTES (avCols label + selBar toggle); its content joins
the scene script as REGIE: lines next to VIDEO:/AUDIO:.
Scene multi-delete: SELECT button in the Scenes side-head (index.html)
toggles sceneSelMode (05-app) — checkbox rows, sticky footer with
All/None, Delete (n) (confirm once), Done. Delete repairs
activeSceneId, never leaves zero scenes, and exits the mode.
TEST scars: (1) top-level `let project` is NOT window.project — probe
`project` unqualified, `!!window.project` lies. (2) A browser-pane tab
can wedge an origin's IndexedDB backend (indexedDB.open never calls
back, boot hangs on loadProject): switch the test server to a fresh
port instead of debugging the app.

## v0.57 — AV script: typography, column widths, insert row/column
User asks, all AV-script card. Typography hierarchy fixed: title now
`700 16*S`, column headers `700 14*S`, body `AVS.fontPx` (13.5)*S with
lineH 17 — headers finally read LARGER than the text (they were 9.5px
vs 12px body). titleH 26→30, headH 22→24. Stills default one step down:
AVS.stillH 200→140 (select checks `o.stillH||AVS.stillH`, never a bare
number). New: per-column widths — drag any separator (or the card's
right inner edge, wy kept 24px above the corner-scale handle) →
`o.colW[key]` in UNSCALED px (÷ drag.S on write, × S in avCols); the
card re-centres on width change, so the drag pins the LEFT edge by
recomputing o.x from avCols. Stills column stays automatic. New: insert
row — small + chips ON each row's top boundary (o._rowIns, radius 8;
the × delete chips r=11 sit at row middle — 1px zone overlap at
minRowH, _rowIns is hit-tested first). New: custom columns —
`o.customCols=[{id:'c'+uid(), label}]`, rendered after video before
notes at AVS.custW 150; the avr: editor routing is fully generic
(`r[key]`) so editing/Tab/paste-nav just work — custom ids must NEVER
contain ':'. × chip in the header deletes (o._colDels), dblclick on the
header renames (prompt). `avSingle(key)` (00-catalog) decides
single-line vs wrap — replaces the hardcoded audio/video/notes checks
in BOTH the rowHs measure and the cell renderer; keep them in sync.
TEST scar: the browser-pane canvas is only the middle grid column —
world→pane clicks must land inside cv's rect (238..675 CSS here), or
they silently hit the sidebar / right panel; pan the card into view
before real-input tests.

## v0.56 — iPad pencil flow + iPhone view mode
Two mobile asks. (1) Pencil: finishing an ink stroke no longer auto-selects
it (writing a word boxed every letter) — stroke is just pushed, select
later with V. Plus light palm rejection: a `touch` pointerdown on the draw
tool is ignored for 800ms after the last `pen` event (`lastPenAt` in
03-input) so the resting hand doesn't scribble. (2) Phone view mode:
`@media (max-width:600px)` in styles.css — compact topbar (logo/undo/
share/export/help/verChip hidden, projBtn ellipsised, shotTitle flexes),
icon-only tabbar (`font-size:0` + 21px svg), toolbar/inkBar hidden
(phones are for viewing), selBar = one horizontal scroll strip, drawers
88vw, safe-area insets. TWO scars: (a) the block MUST live at the END of
styles.css — the `#tabbar button` base rules come later in the file and
win the same-specificity cascade, so a mid-file media query silently does
nothing to them; (b) `#app{grid-template-columns:minmax(0,1fr)}` is
load-bearing — without it the topbar's min-content (~460px) widens the
single grid column and EVERY row scrolls sideways on a 375px phone.
Desktop/iPad ≥601px completely untouched.

## v0.55 — AV stills 4× bigger
AVS.stillH default 52 → 200 (user: column too small); size select now
72/140/200/280 (S/M/L/XL, L = default — keep the `o.stillH||200`
selected-check in sync with the AVS default).

## v0.54 — Safari stale-version fix
User report: Safari kept loading old versions. ROOT CAUSE: the SW's
"network-first" `fetch(e.request)` is answered by Safari's own HTTP
cache before it ever reaches the network — network-first silently
became stale-first. Fixes:
1. SW code-like fetches now use `{cache:'no-cache'}` → forced server
   revalidation (ETag/304 keeps it cheap).
2. Registration calls `reg.update()` on every launch (Safari is lazy
   about re-checking the SW script).
3. `controllerchange` listener: when a NEW SW takes control mid-session
   (skipWaiting+claim were already in place), toast + one reload —
   guarded against loops, skipped on first-ever install, and NEVER
   while `dirty` (no reloading over unsaved work).
The user-side incantations, for support: Safari Mac = Cmd+Option+R (or
Shift+click reload); truly stuck = Settings → Privacy → Manage Website
Data → remove the domain — WARNS: that wipes IndexedDB, so LOCAL-mode
users must export .floorproj first. iPad PWA: fully close + reopen.

## v0.53 — two-field password confirm
Change-password (panel) and the reset-link screen both use the standard
new + repeat pattern; mismatch and <6 chars are caught client-side
before any auth call.

## v0.52 — account icon top-right + in-panel password change
1. `#accountBtn` (person SVG) in the topbar-right, hidden by default;
   the 05 init shows it in cloud mode (tooltip = the signed-in email)
   and wires it to FLOOR_ACCOUNT.open(). Local mode: stays hidden.
   The "Account & privacy…" row in the Production ▾ popover is GONE —
   one place, top-right.
2. Account panel gained "Change password…" → inline field + Set →
   sb.auth.updateUser({password}) — works directly while signed in, no
   email round-trip (the forgot-password mail flow stays for locked-out
   users on the login screen). 6-char minimum, Enter submits.
3. FLOOR_ACCOUNT.overlay exposed (profile prompt + TESTS use it — the
   panel DOM can be exercised without a live login by mocking
   FLOOR_USER; that's how this release was verified, since the
   free-tier mailer rate limit blocks real signups from the harness).

## v0.51 — drag stills into the AV table, corner-scale for tables/AV
1. Board image dropped ON an AV script row (pointerup move-case, hit by
   image CENTRE + avRowAt) MOVES it into that row's stills (imgs.push,
   image object removed, Stills column auto-on). Dropped on a storyboard
   row → becomes that row's frame. Both toast + select the target.
2. 'cardS' corner handle = photo-style scaling for self-sizing cards:
   factor = |cursor.x − card centre| / (startW/2), o.fs = clamp(fs0×f,
   .7, 2). AV script: bottom-RIGHT corner (it left the no-resize list).
   Table: bottom-LEFT corner (tgrow keeps the right corner for
   rows/cols — selBar hint names both).
3. Table renderer fully scales via o.fs (headH/rowH/fonts/col min-max/
   padding); tap geometry (03) and openTableCell (04) use the same S —
   keep all three in sync or clicks land in the wrong cell.
Verified: real corner drag through the input pipeline scaled a table
fs 1 → 2 (clamped); image-drop into AV row + sbrow frame both green.

## v0.50 — AV stills filmstrip, script scaling, PDF → board
1. AV rows: `r.imgs = [imgId, …]` (renderer migrates legacy r.imgId on
   sight). Still cell = filmstrip: every still side by side at o.stillH
   (S/M/L/XL select = 44/72/110/160), 16:9 slots, cover-fit, × chip per
   thumb when selected (o._stillDels), '+' slot appends (pickAvStill —
   multi-select file picker; clicking an EXISTING thumb replaces it).
   avCols sizes the stills column from the fullest row. DROPPING image
   files on an AV row (canvas drop handler checks avscript hit + avRowAt)
   stores them into that row and switches the Stills column on.
2. Whole-script scaling: avscript o.fs (A−/A+, ×0.8–1.8) scales widths,
   fonts, line heights, row minimums. The film-script block got A−/A+ on
   its existing fontSize too.
3. PDF → board: `pdfPagesToSubboard(buf, name, x, y)` renders every page
   via the vendored pdf.js at ≤1600px wide (JPEG .85) into image objects
   stacked on a fresh SUB-BOARD named after the file. Routes: file-card
   selBar "Pages → board" (stored PDFs), and the canvas drop handler now
   OFFERS this for PDFs over the 4.5MB file-card limit instead of
   refusing them. (That limit exists because file cards store the whole
   file as a base64 dataURL in ONE kv row — fine for call sheets, unkind
   for 40MB print PDFs; the pages route never stores the PDF itself.)
4. collectAssetIds + imgReferenced now scan AV-row stills (r.imgs/imgId)
   — they previously only saw ob.imgId, so AV stills would have been
   dropped from .floorproj exports the moment the still column shipped.
Verified self-test: fed the app's own call-sheet PDF into
pdfPagesToSubboard → 1-page sub-board at >1000px. Migration, 3-thumb
row, XL growth, fs scaling, × dels, row-hit for drops all green.

## v0.49 — sub-boards (boards within boards, every tab)
`cat:'subboard'` = a card holding a full shot-shaped board (`o.board`).
THE architecture trick: `activeScene()` resolves through `boardStack`
(an array of subboard IDS re-resolved on every call against the current
tab's root — stale links self-prune, so undo/remote pulls can't dangle).
Because every tool reads activeShot(), drawing/library/selection/marquee/
NESTED sub-boards all work inside with zero extra wiring.
- Enter: double-click or selBar "Open". Exit: the #boardCrumb pill
  (top-left, "⬑ Scene 1 › Bathroom ideas › Tile refs", click = up one).
  zoomFit on both enter and exit.
- Create: "Sub-board" Board tile (all tabs), OR multi-select →
  "→ Sub-board" (`groupIntoSubboard`: moves selection in at preserved
  coords, card at the selection centroid, cross-boundary mounts/rails
  cut). Name = o.label via the ordinary Label field.
- Card renders a LIVE THUMBNAIL: renderShotPlan(o.board, 640) cached on
  `o._pv`, generated in a setTimeout (never nested inside a draw),
  invalidated on exit. NOTE: `_pv` is a canvas — after JSON round-trip
  it deserializes as {}, so every check is `pv && pv.width`, never
  truthiness.
- `exitAllSubboards()` hooks: switchTab, switchShot, applyState (undo),
  pullRemoteProject, switchSetup — anywhere the objects arrays get
  replaced under the stack.
- Deleting a filled sub-board confirms (contents die with it).
  collectAssetIds + imgReferenced recurse into sub-boards (and now also
  scan the mood/prod/script boards for GC — they previously only
  checked scenes).

## v0.48 — merge now brings the BOARDS along
User report: merged a project and the AV script card + sticky notes
didn't appear — v0.47 deliberately skipped boards. mergeFloorproj now
merges mood/script/prod board content too (`mergeBoard`): objects get
fresh ids and are OFFSET to the right of the destination board's
existing content (dx from bbox; p1/p2/mid, pts (ink/track absolute),
and path points shifted too). Remaps: mounts/rails (same-board idMap),
sbrow.sceneId + schedule item sceneIds via sceneMap, fieldcard.locId +
dayheader.locIds via locMap (which now ALSO maps dupe locations onto
the existing id instead of dropping the reference), schedule/callsheet
dayId via idMap (day headers live on the same board), prop/gear list
props/hide/done keys re-prefixed per scene. Board walls merged too.
Production info FIELDS still not merged (deliberate). Verified: AV
card + note + linked sbrow land offset on scriptboard; the merged
day header → schedule → call sheet chain stays intact end to end.

## v0.47 — merge productions + AV script import & breakdown
1. `mergeFloorproj(f)` (06) + "Merge .floorproj into current…" in the
   Production ▾ popover: appends the pack's SCENES (fresh scene/wall/
   opening/object ids, mounts+rails remapped, ACTIVE setup only) and
   imports its assets; people merged with dedupe on (name.lower, tag),
   locations on name/street.lower, customProps on name. Boards, script
   and production info are NOT merged (deliberate — cards reference
   board-local state). Import… stays the "new production" path.
2. `avPasteOverlay(o)` (06) + "Paste rows…" on the AV card selBar:
   parses tab-separated rows (Excel/Sheets copy) or 2+-space/pipe
   splits. Header row containing audio+video (or 'beeld') sets the
   column order and is skipped; otherwise VIDEO-first by convention
   with a "first column is AUDIO" swap checkbox. A leading cell
   matching m:ss or bare digits becomes the row time. Pristine starter
   rows are REPLACED, otherwise rows append.
3. `breakDownAvCard(o)` (06) + "Break down → scenes": each filled row →
   a scene via createScenesFromBreakdown (body 'VIDEO: …\nAUDIO: …\n
   NOTES: …', heading from the video cell) + a linked sbrow next to the
   card, mirroring the film-script breakdown. Row time → sc.duration in
   minutes (m:ss ceil'd; bare number treated as SECONDS, min 1).
Verified in-browser: merge kept an actor mounted in its wheelchair
across the id remap; paste honored a TIME/VIDEO/AUDIO header; breakdown
produced scenes with durations + linked storyboard rows.

## v0.46 — registration profile + GDPR kit
1. `profiles` table (name/address/phone/profession — ALL optional by
   design, data minimization) + consent columns (privacy_version,
   privacy_accepted_at). RLS: own row only. Applied to the live project
   AND mirrored in setup/schema.sql (§4).
2. `delete_my_account()` RPC (SECURITY DEFINER): wipes kv, owned
   productions (cascades docs/members/invites), memberships, shares
   (cascades comments), shares-bucket storage objects, profile, and the
   auth.users row itself. EXECUTE revoked from anon/public, granted to
   authenticated — verified via has_function_privilege.
3. Signup gained a REQUIRED, un-prechecked consent checkbox linking
   privacy.html; Create account is blocked client-side without it.
4. `window.FLOOR_ACCOUNT` (adapter): .open() = Account & privacy panel
   (edit profile / Download my data as JSON = kv dump + profile / Sign
   out / Delete my account with type-DELETE confirm);
   .maybeProfilePrompt() = one-time OPTIONAL profile card after first
   sign-in (Skip records consent so it never nags). Entry point: a row
   in the Production ▾ popover (cloud mode only — FLOOR_ACCOUNT absent
   in local mode, verified).
5. privacy.html: plain-language GDPR policy — controller identity has
   [YELLOW FILL-IN] placeholders Gerbert MUST complete before launch.
   PRIVACY_VERSION constant ('2026-08-17') in the adapter; bump it +
   the page's version line together on material changes.
Verified live: consent gate blocks signup, wrong-password sign-in hits
the real auth API, local mode has zero account UI.

## v0.45 — password login + first push of everything since v0.44
1. Login overlay (supabase-adapter.js) rewritten as a small state machine:
   signin (email+password, default) / signup / forgot / reset / magiclink.
   Password sign-in means a returning device never touches email — only
   first-time signup (one optional confirmation email, dashboard-
   controlled) and password reset send anything. `PASSWORD_RECOVERY` auth
   event is caught explicitly (routes to the 'reset' screen) BEFORE the
   generic SIGNED_IN resolve, or a reset link would just log the user in
   with their old password still active. Magic link kept as a fallback
   for accounts that never set a password.
   Verified live against the real Supabase project: signup correctly
   rejects `example.com` (domain validation) and hit the project's
   built-in-mailer RATE LIMIT on a second attempt — Supabase's free-tier
   SMTP allows only a handful of auth emails per hour, which is almost
   certainly why magic-link sign-in felt so painful. Password sign-in
   sidesteps that limiter entirely after the first signup. WORTH DOING
   NEXT: custom SMTP (Resend, already on the TODO list) removes the
   limiter for the signup/reset emails that remain.
2. **The ELv2 relicense + the whole v0.44 standalone batch sat unpushed.**
   Most releases up through v0.43 ("Dolly and difusion") WERE committed
   and pushed to origin/main as normal — but the LICENSE swap and every
   v0.44 file (config.js, setup/schema.sql, SELFHOST.md, Dockerfile,
   dolly-cart mount, production logo, linked contact) were only ever
   written to the local working tree, never committed. GitHub kept
   showing the original GPL-3.0 because that commit specifically never
   went out. Pushed the backlog together with this release.

## License (2026-07-25)
LICENSE switched from a stock GPLv3 (repo-creation leftover — GPL would
NOT have blocked commercial hosting anyway, that's the SaaS loophole) to
**Elastic License 2.0**: free use + self-hosting incl. commercial
productions; offering FLOOR itself as a hosted service is reserved to
Gerbert. Caveats flagged to the user: sole-copyright-holder relicensing
is clean ONLY if there are no outside contributors, and any GPLv3 copies
already distributed stay GPLv3 for their holders. README + SELFHOST
carry the notice; both zips include LICENSE.

## v0.44 — cart-mounted cameras, logo, contact links, STANDALONE edition
1. Camera dropped on a 'dollycart' → cam.mount = {type:'cart'} (jib UX:
   pickup releases). Cart drag carries the camera; cart's movement path
   drives it in poseOf (pan stays free — rot not inherited).
2. production.logo (imgId via storeImageFile) — "Logo…"/"Remove logo" on
   the callsheet selBar; drawn top-right of the head (max 110×36, contain
   fit, `o._logoTried` guards the lazy loadStill). Counted in
   collectAssetIds + imgReferenced. FIXED IN PASSING: collectAssetIds and
   imgReferenced now scan INACTIVE setups' objects — v0.42 setups silently
   dropped their images from .floorproj/shared copies.
3. Head line 2: company · email (mailto) · phone (tel) as linked segments
   → clickable on card + PDF. Also in callSheetText. Data entry: the
   existing Production field card rows.
4. STANDALONE: `config.js` (window.FLOOR_CONFIG {supabaseUrl, supabaseKey})
   now feeds supabase-adapter.js — EMPTY config = clean local mode
   (console info, no login, IndexedDB fallback from 01, shareBtn hidden
   via `if(!window.FLOOR_SB)` in the 05 init). `setup/schema.sql` is the
   COMPLETE backend (dumped from the live project 2026-07-24: kv, shares +
   bucket + policies, share_comments, productions/members/docs/invites,
   is_production_member + redeem_production_invite with the load-bearing
   #variable_conflict). SELFHOST.md + Dockerfile added. TWO zips ship now:
   'floor film studio.zip' (your keys) and 'floor-studio-standalone.zip'
   (empty config — local mode out of the box). Keep both rebuilt on
   release.

## v0.43 — RGB-first light color, named gels, diffusion, dolly cart, hazer
1. Color model SIMPLIFIED per user: o.gel (RGB) wins OUTRIGHT — no more
   gel×kelvin multiply. White in the RGB well = gel null (temperature
   rules). Kelvin slider disables + fades while a color is chosen.
2. Swatch row replaced by a NAMED gel <select> (Full/½/¼ CTO + CTB,
   Plus/Minus Green, Bastard Amber, Steel Blue, Congo Blue, Primary Red,
   Magenta; non-preset o.gel shows as 'Custom RGB') + the RGB well
   (default #FFFFFF).
3. Diffusion per light: o.diff ∈ opal/half/full → DIFF_F (00) widens
   spread ×1.08/1.16/1.25 and drops alpha ×.85/.7/.55 in the beam draw.
4. New props: 'dollycart' (Grip & light, in MOVE_KINDS — takes movement
   paths) and 'hazer' (LIGHT_BEAMS entry {omni:190, haze:true} → faint
   ambient cloud at alpha .13; haze flag SUPPRESSES fixture/gel/kelvin/
   diffusion UI and relabels the toggle 'Haze: on/off').

## v0.42 — the Blush-response batch (tier 1 + extras)
Competitive review vs blushtools.com (2026-07-23) → seven features:
1. Gel swatches renamed to REAL gels (Full/half CTO+CTB, Plus Green,
   Bastard Amber, Primary Red, Congo Blue, Magenta) + a free RGB
   <input type=color> at the end of the row (sets o.gel too).
2. Wall OUTLETS: opening type 'outlet' — excluded from the wall-carve
   loop (no hole), schuko glyph, added via wall selBar "+ Outlet",
   dragged/deleted through the normal opening machinery, no width chips.
3. Fixture preset <select> on any LIGHT_BEAMS light → fills o.label
   (Aputure/ARRI/Astera/Nanlux/Nanlite/Kino/Litepanels/Dedo/Godox).
4. Dimension lines: line kind 'dim' (Board tile "Measure") — tick ends,
   auto cm/m readout kept upright, endpoints drag like any line.
5. GEAR LIST card (cat 'gearlist'): shares the ENTIRE proplist pipeline
   (renderer branch, _pl* zones, pl: editor fields, o.props/hide/done) —
   only the detector differs: cameras + GEAR_KINDS, o.label beats the
   catalog name. Call sheet gained inc.gear (default OFF).
6. Call sheet day flow: drop with 2+ day headers → showCallsheetDayPicker
   (day N / all days). o.allDays stacks per-day blocks (banner with
   number/date/calls/sun + that day's locations + ITS schedule — no
   cross-day schedule fallback) with shared crew/cast/etc; weather
   section only in single-day mode. SelBar day chip cycles …→All days.
   PDF name '_all-days'.
7. SETUPS A/B: s.setups[{id,name,objects}] + s.setupId, lazily
   materialized on the 2nd setup. Active setup SHARES the s.objects
   array; migrateShot re-links after every JSON round-trip (save/load,
   undo) — without that, edits silently stop reaching the stored setup.
   addSetup deep-copies with id remap (mounts/rails re-pointed).
   Topbar chips A/B/×/+ (syncTitle renders; switchTab syncs). Scene
   duplicate takes the ACTIVE setup only (setups stripped).
Skipped by decision: power routing/breakers, light meter, photometric
data, themes.

## v0.41 — color temperature per light
Second light control: `o.kelvin` (slider 2000–10000K, step 100, shown
default 5500K = daylight standard; null = untouched). `kelvinRgb(k)`
(Tanner Helland approx) + `beamTintFor(o, beam)` own the chain:
gel × kelvin MULTIPLY when both set (a gel over a warm/cool source),
kelvin alone recolors the beam, neither → the kind's default tint, so
pre-v0.41 boards render unchanged. Slider lives under the gel row in the
selBar (pointerdown/keydown stopPropagation or the canvas eats the drag).

## v0.40 — light gels + TL + Astera
1. Per-light color: `o.gel` ('#rrggbb' or null = the type's default tint).
   The beam gradient uses `hexRgb(o.gel)` (00) at alpha .32 (defaults stay
   .26). SelBar for any LIGHT_BEAMS kind shows a 9-swatch gel row (first
   swatch = reset to default): warm/tungsten/CTO/CTB/red/green/blue/
   magenta/cyan. Applies to directional AND omni (practical) beams.
2. New `tl` (Practicals — fluorescent tube, end caps, omni 130 with cool
   '223,235,255' default tint) and `astera` (Grip & light — RGB pixel
   tube, wide 120° wash, purple default; gel it per unit).

## v0.39 — numbered shoot days own their locations
1. Day headers are numbered: title reads 'SHOOT DAY N' where N =
   `dayNumber(day)` = position in `boardDays()` (date-sorted — change a
   date and the numbering re-sorts itself).
2. `day.locIds` = ORDERED location ids for that day (`dayLocs(day)`
   resolves them). SelBar of a selected day header lists every filled
   location as a toggle: click in VISITING order (chips show ✓1/✓2…),
   click again to remove; re-add to re-order. Same location on several
   days is just the same id in several lists. The card grows a bottom
   row: '⚑ 1 Villa → 2 Bakkerij'.
3. Call sheet + callSheetText: the bound day's assigned locations (in
   order, numbered, header 'LOCATIONS · IN ORDER') REPLACE the all-
   locations fallback; no assignment → previous behavior.
4. dayheaderSunFetch geocodes the day's FIRST assigned location.
   Day-cycle chip now reads 'Day 1 · 20 jul ▸'.

## v0.38 — call sheet: clickable links, all locations, multi-day
1. Lines in the call sheet are now [kind, text, segs] where segs mark
   LINKED substrings ({s,e,u}). drawLine paints them #3B5BDB + underline
   and pushes card-local rects into `o._csLinks`. buildCallSheetPDF maps
   those rects through the same scale/offset transform into real PDF
   /Annot /Link objects (page dict gets /Annots) — tel:, mailto: and
   maps.google.com links are clickable in the exported PDF even though
   the page itself is a JPEG. URI parens/backslashes escaped.
2. Emails now appear on crew/cast/client lines (card, PDF, mail text).
   Addresses link to Google Maps; phones to tel: (digits + '+' only).
3. LOCATION → LOCATIONS: every production.location with content renders
   (name, linked address, parking/power/hospital/notes), blank line
   between.
4. Multi-day: `boardDays()` (dayheaders sorted by date) + `dayFor(o)`
   (o.dayId binding, fallback first). Schedule AND call sheet cards bind
   via a "Day: 20 jul ▸" selBar chip (only shows with 2+ Day headers).
   The call sheet picks the schedule card bound to ITS day. One call
   sheet card per day = multi-day production; PDF filename carries the
   date. callSheetText / mail subject use the bound day.

## v0.37 — sink & hob live inside the kitchen block
v0.34's separate ksink/island props reverted per user: ONE kitchen block
with `o.sink` / `o.hob` = 0..1 fractions along the counter run (undefined
= defaults .22/.72, null = hidden via selBar ✓Sink/✓Hob toggles). Blue
selection handles ('ksink'/'khob' → drag kind 'kfix') slide the fixtures;
`kitchenPointAt` / `kitchenParamFromLocal` (00) own the run geometry —
the corner variant's path runs top edge then left edge, glyphs rotate 90°
on the vertical run. Because PROPS draw() doesn't receive the object,
drawObjectShape special-cases the three kitchen kinds; PROPS entries keep
default-fixture draws for library tiles. ksink/island stay in PROPS
(v0.34 boards) but are OUT of the library list.
TESTING NOTE: the Browser pane screenshots at 800×1255 while the CSS
viewport is 774×1215 — scale computer{} coordinates by innerW/screenshotW
or canvas clicks land ~3% off (enough to miss a selection handle). And
synthetic PointerEvents die at cv.setPointerCapture (inactive pointer id)
— real pane drags are the only honest input test.

## v0.36 — Scene info rename + Recce & mood retired
"Shot info" → "Scene info" everywhere (right panel tab, card title
'SCENE INFO', library tile, panelToggle title, placeholder, help text).
The Recce & mood panel tab is GONE from the UI — reference images go
straight on the board. IMPORTANT: the stills DOM (`#stillDrop`,
`#stillsGrid`, `#stillInput`, `#boardImgInput`) stays in index.html,
hidden — 05-app attaches listeners to them unconditionally at load, and
`boardImgInput` is the "Image…" tile's file picker. Remove those nodes
and the app dies at boot. `s.stills` data + buildStills() also stay
(storyboard rows/exports may reference stills).

## v0.35 — false conflicts fixed, quiet conflict chip, live presence
1. THE BUG behind "constant conflict warnings with nobody else online":
   we stored our own `new Date().toISOString()` ('…123Z') as the freshness
   stamp, but PostgREST returns timestamptz as '…123456+00:00'. The STRING
   comparison flagged our own previous save as a conflict — every second
   save cried wolf. Fix: `stampsDiffer(a,b)` compares `Date.parse` with a
   1.5s tolerance (defined in BOTH the adapter and 07-share), and the
   upsert now does `.select('updated_at')` so we store the SERVER's
   representation. cloudRefreshTick also skips when we have no local
   stamp. NEVER string-compare timestamps from different serializers.
2. Conflict UI moved into the topbar: amber `#conflictChip` pill next to
   saveState ("Newer version · Load / Keep mine"). The RED savefail
   banner stays a floating banner on purpose — that one is an alarm.
3. `initPresence` (07): Supabase Realtime presence channel
   'online-<pid>' on shared productions; green `#presenceChip` in the
   topbar lists who else is in ("jasper, marie online"). Subscribed once
   at boot — production switches reload the page anyway.

## v0.34 — furniture pack + riders
1. Sofa variants: `sofa`/`sofa_3`/`sofa_4` (shared `sofaDraw(ctx,w,h,c,
   seats)`) + `sofa_corner` (L-shape). Kitchen variants: `kitchen`/
   `kitchen_l` (shared `kitchenDraw` — now a PLAIN counter, sink & hob
   REMOVED from the block) + `kitchen_corner`. New separate props:
   `ksink` (kitchen sink), `island` (cooking island, 4-burner hob),
   `cabinet`, `bookcase`. Variant switching lives in the selBar via
   `swapPropKind(o, kind)` (04) — keeps the user's scale; the stairs
   curved toggle now uses it too. Library only shows the base
   sofa/kitchen tiles; variants are selection-bar options.
2. Riders: wheelchair + hospital bed are in MOVE_KINDS (they can get
   movement paths now). Actor↔vehicle coupling is TWO-WAY: dragging
   either moves both (mount types 'seat'/'bed'; pickup no longer
   auto-dismounts — the selBar "Out of the chair/bed" button releases,
   nudging the actor +55x). Drop zone: wheelchair <46px, bed <60px.
   Play-time: poseOf couples the pair — whichever of the two owns a
   path drives, the other inherits its pose (guards: only defer when
   you have no path of your own, so no recursion).

## v0.33 — save reliability + co-editing sync (fixes the data-loss risk below)
Confirmed cause of the user's lost scene: a co-editor had the production
open for hours and their save clobbered everything (last-writer-wins).
Four-part fix:
1. saveProject (01): `dirty=false` only AFTER the write lands. `saveGen`
   counter catches edits made during an in-flight save. Failure → dirty
   stays true, exponential retry 4s→30s, `saveStateMark` turns the chip
   into '✓ Saved HH:MM' / red '⚠ Not saved'. beforeunload now blocks with
   the leave-site dialog while dirty.
2. `saveBanner(mode)` (05): 'savefail' red banner with Retry; 'conflict'
   amber banner with [Load newest] / [Keep mine → forceOverwriteSave].
3. Freshness stamps: `window.FLOOR_STAMPS[key]` = updated_at last
   read/written, recorded by BOTH storage layers (kv adapter + the
   production_docs wrapper in 07). Every project save first compares the
   cloud stamp — mismatch throws `err.floorConflict` → conflict banner
   instead of a silent clobber. forceOverwriteSave nulls the stamp for
   exactly one save. Covers co-editors AND the same account on two
   devices.
4. `cloudRefreshTick` (07): every 2 min + on visibilitychange-to-front,
   compares the cloud stamp; newer + no local edits → `pullRemoteProject`
   adopts it in place (shared migration path `normalizeLoadedProject`,
   extracted from loadProject; clears undo stacks so Cmd+Z can't
   resurrect a co-editor's past). Newer + local edits → conflict banner.
Note: the zip now includes supabase-adapter.js + styles.css (earlier
rebuilds this month shipped without them — repair if a deploy from those
zips looks unstyled/local-only).

## KNOWN DATA-LOSS RISK (diagnosed 2026-07-14 — FIXED in v0.33, kept for history)
A user lost a session of work (duplicated scene, renamed, new walls/shots/
stills) — app came back with the state from right after the duplicate.
Root causes found in review, both still open:
1. `saveProject()` (01) sets `dirty = false` BEFORE the awaited write. On
   the hosted build every save is a NETWORK write (kv upsert, or
   production_docs when shared). If it throws, the only signal is the tiny
   "Save failed" chip; dirty stays false, so the beforeunload/visibility
   flushes think everything is saved and there is NO retry timer. Offline
   stretch (or iPad PWA suspending mid-request, or expired session) →
   every save quietly fails → close → revert to last good save.
   Fix sketch: set dirty=false only AFTER success; on catch set dirty=true
   + schedule a retry with backoff + make the failure loud (toast/banner).
2. Shared productions are last-writer-wins on the WHOLE doc. The 07-share
   header comment claims "the presence guard warns" but no presence guard
   exists in the code. Any second session (other device, PWA + browser
   tab, or a co-editor) that loaded earlier and saves later silently
   clobbers everything since ITS load. Fix sketch: compare updated_at
   before upsert (409 → reload/merge prompt), or a presence row per open
   session.
Scene duplication itself is clean (fresh ids for scene/walls/objects) and
undo needs explicit Cmd+Z per step — both ruled out.

## v0.30 — prop list card
New Production card `cat:'proplist'` (green, between Day schedule and Call
sheet in the library). LIVE per scene: `propListGroups(o)` (01) collects
(1) props PLACED on each scene board (cat 'prop', counted, custom props
resolved via `propDisplayName`; road/crossing/bikelane/rails skipped) and
(2) prop names the scene's `script` text MENTIONS (`scenePropMentions` —
word-boundary + optional plural, memoized on `s._pmSrc/_pmCache` because
it runs per render), plus (3) manual rows in `o.props[sceneId]`. Auto rows
key their state as 'sceneId|name': `o.done` ticks, `o.hide` dismisses
(× chip). Manual rows: `+ prop` line per scene, `pl:sceneId:rowId` editor
field, Enter chains a next row, a row left NAMELESS is pruned centrally in
`closeNoteEditor` — NOT in propListGroups, because addPropRow's render()
would eat the fresh empty row before its editor opens (learned the hard
way). Script mentions render italic, ticked rows strike through, title
shows got/total. Width machinery = schedule's (auto + `cardW` handle,
280–900).

## v0.29 — scene lengths editable in the schedule
Scene rows now honour a per-schedule duration override: `computeSchedule`
uses `it.dur != null ? it.dur : scene.duration` (the shot designer stays
the default, the schedule can diverge). The dur cell is an edit zone for
EVERY row type now (the `it.type !== 'scene'` guard on `_durRects` and
the openSchedCell early-return are gone); Tab hops time→label→dur on
scenes too. Editor prefills the EFFECTIVE value (scene duration when no
override) and an EMPTY commit sets `it.dur = null` — back to the shot
designer. Overridden scene durations render in the card color (same
signal as pinned times); scene boards are never touched. Note: the sch:
editor commits on the textarea's `input` event, not on close — headless
tests must dispatch `new Event('input')` after setting `.value`.

## v0.28 — schedule & call sheet width
Both cards auto-widen to their longest line (lines are built UNTRIMMED,
measured with the per-kind font, then `o.w = clamp(max(needed, o.userW ||
default), default, 900)`; drawLine still trims at the 900 cap). A
right-edge `cardW` handle sets `o.userW` (drag anchors the LEFT edge via
the same converging o.x correction as tgrow). Content always wins over a
too-small userW — cells never clip below what they need.

## v0.27 — mail routes + wall lengths
Call sheet selBar: ✉ Crew / ✉ Cast / ✉ Client / ✉ All (`mailCallSheet(o,
tag)`, `sheetEmails(o, tag)`). Every mail action downloads the PDF first
(mailto: cannot attach — browser limit), then opens the draft with that
group in BCC + the plain-text sheet. "Share PDF…" (shown when
`navigator.share` exists) attaches the real PDF via the OS share sheet →
Mail on macOS/iPadOS. `buildCallSheetPDF(o)` returns {bytes, name};
exportCallSheetPDF is now a thin download wrapper. Selected walls show
their ARC length (curves measured along the curve) floated 16px off the
midpoint — same formatting as the draw preview.

## v0.26 — the schedule becomes a strip(board)
Schedule card data model changed: `o.items` = ORDERED rows
`{id, type:'scene'|'break'|'move'|'prep', sceneId, on, label, time, dur}`.
`schedItems(o)` migrates the v0.24 `o.on` map, auto-appends new scenes and
drops deleted ones; `computeSchedule(o, day)` (01) owns the time chain —
a row's manual `time` PINS the chain from there; label overrides are
display-only (scene names untouched). Interactions: grip drag reorders
(`schrow`), checkbox toggles, click time/label/dur to edit (`sch:` editor
fields, Tab hops time→label→dur), × chips remove BLOCK rows, selBar adds
+Break/+Location change/+Prep. Call sheet + callSheetText both render
through computeSchedule — one source of truth for the day.

## v0.25 — bathroom + door hinge
New Bathroom category (bath, shower, toilet, sink + mirror shortcut), bin
in Set dressing. Doors: `op.flip` = which SIDE of the wall the swing goes,
`op.hinge` = which JAMB it hangs on — both toggles in the opening selBar,
four combinations total.

## v0.24 — the production loop closes
- **schedule card** (cat 'schedule'): LIVE — calls from the day header,
  a checkbox per scene ("shooting today?"), times chain from the shooting
  call via scene.duration + travelMin/setupMin, Est. wrap computed.
  Selection stored as `o.on[sceneId] === false` (default = included).
- **call sheet** gained a SCHEDULE section mirroring the schedule card's
  selection (first schedule obj on the prodboard; all scenes if none) and
  is the LAST tile in the production library. selBar: "Mail crew ✉"
  (mailto: with all registry emails in BCC + plain-text sheet body via
  `callSheetText`, capped ~1600 chars for URL limits) and "Copy emails".
- Location card address is now street/town/country (old single `address`
  splits on first comma at normalize); geocoding queries the TOWN.
- Wind renders in Beaufort (`toBft` in 00). Crew card drop seeds
  Director/DoP/AC/Gaffer/Sound when the crew registry is empty.
- Internal clipboard: Cmd/Ctrl+C copies the selection (objects AND walls),
  Cmd/Ctrl+V pastes into the ACTIVE scene (+40,+40, new ids, mounts
  stripped) — only consumed when FLOOR_CLIP is non-empty so OS image paste
  still works. Marquee now includes walls (both endpoints in the box);
  moveMulti/delete/duplicate handle wallIds. Scene rows have a ⌂ button:
  copy the SET (walls+props, no cast/cameras) into a new scene.
- Share popover no longer requires a read-only link to exist before the
  co-editor section shows (early-return bug).
- `toMinutes`/`minToHHMM` are global (00) — reuse them, don't re-declare.

## v0.23 odds & ends
Openings (door/window/gap) hit-test like walls now: thin band along the
wall line, only within the opening span — the old `max(op.w/2, thr)`
CIRCLE made windows swallow clicks. New props: bed_single, bed_hospital,
wheelchair (actors dropped on it get `mount:{type:'seat', id}` and ride
along when the chair moves; picking the actor up releases), train,
tractor, mirror, books, newspaper, toys. The curved-stairs LIBRARY TILE is
gone — stairs get a "Curved: on/off" selBar toggle that swaps `kind`
between stairs/stairs_curved (PROPS entry kept for old boards).

## Breakdown numbering (v0.22)
`createScenesFromBreakdown` REUSES the pristine starter scene (empty
"Scene N", no objects/walls/script) as the first detected scene, so
numbering starts at 1 on fresh projects; with real scenes present it keeps
appending. `addSbRowBelow` copies title + sceneId from the row above —
one scene, many storyboard boards.

## Supabase (project id jcasjylzosgtitaxbrjo, eu-west-1)
Table `public.kv` (user_id uuid default auth.uid(), key, value, updated_at;
PK user_id+key; RLS "users manage their own rows"). Publishable key in the
adapter is `floor_shot_designer` — safe to be public by design. Auth → URL
Configuration must list the Netlify URL (+ `/**` redirect wildcard). Agreed:
future server code = **Supabase Edge Functions** (not Netlify Functions),
first use = AI script breakdown.

## Supabase magic-link email branding (dashboard TODO — not in code)
Now matters double: co-editor invitees get this same mail. Supabase only
honors custom templates + sane rate limits with CUSTOM SMTP. Agreed plan
(July 2026): Resend free tier + sending subdomain `floor.zoutwater.com`
(user already owns zoutwater.com; no new mailbox or website needed —
DKIM/SPF DNS records only). Steps: Resend → add domain (subdomain) → DNS
records at the zoutwater.com DNS host → API key → Supabase Project
Settings → Auth → SMTP (host smtp.resend.com, port 465, user `resend`,
pass = API key, sender "FLOOR Studio <login@floor.zoutwater.com>") → then
edit Email Templates (Magic Link + Confirm signup, keep
{{ .ConfirmationURL }}) and raise Auth → Rate Limits. A dedicated FLOOR
domain (floorstudio.nl etc.) can replace the subdomain later — ten-minute
DNS/settings swap, wanted anyway for Phase 4.
The login mail's subject/body are Supabase Auth settings, not client code.
In supabase.com dashboard → project → Authentication → Email Templates →
Magic Link: subject "Your FLOOR Studio login link", body should say FLOOR
Studio and keep `{{ .ConfirmationURL }}`. Sender stays
noreply@mail.app.supabase.io until custom SMTP is configured (Auth → SMTP)
— revisit when a floorstudio domain exists. The in-app overlay copy already
sets expectations (v0.14).

11. **`.upsert()` + RLS: ON CONFLICT enforces the SELECT policy on the NEW
   row** (found v0.17, cost the first co-editing attempt). supabase-js
   upsert = `INSERT … ON CONFLICT`, and Postgres then requires the inserted
   row to be visible under the table's SELECT policy — a plain INSERT does
   not. production_members' select policy required an existing membership,
   so the owner's own FIRST membership row could never be upserted
   (chicken-and-egg, error 42501 "new row violates row-level security").
   Fix: owners see their productions' members regardless (+ an UPDATE
   policy for the DO UPDATE arm). Rule of thumb: any table you `.upsert()`
   into needs SELECT + UPDATE policies that pass for the writer.
   Debugging recipe that found it: Supabase MCP `get_logs(postgres)` for
   the real error, then reproduce in `execute_sql` with
   `set_config('role','authenticated')` + `set_config('request.jwt.claims',
   '{"sub":"<uid>"}')` inside a rolled-back transaction.

12. **PL/pgSQL `RETURNS TABLE` names shadow columns** (found v0.17 #2, cost
   the first invite redeem). `returns table(production_id …)` made
   `production_id` ambiguous inside the function's `ON CONFLICT
   (production_id, …)` → 42702 on every call, which the client's generic
   catch mislabeled "invalid or revoked invite". Fix: `#variable_conflict
   use_column` pragma (out-param names must stay — the client reads them).
   Rule: test every RPC with an impersonated role BEFORE shipping —
   `set_config('role','authenticated')` + jwt claims in a rolled-back
   transaction (same recipe as lesson 11); RLS never runs your function's
   body until a real user does.

## Co-editing data model (v0.16)
Tables: `productions` (id = the kv-era project id, owner, name, opened_by/
opened_at for the presence guard), `production_members` (role owner|editor,
email cached for display), `production_docs` (production_id+key → value —
same key shapes as kv), `production_invites` (code pk, role). RLS via the
SECURITY DEFINER `is_production_member()` (avoids policy self-recursion);
invites redeem through `redeem_production_invite(code)` (definer, anon
revoked). Members policies (fixed v0.17): select = member OR production
owner; update = self or owner — both required because the client upserts
(see scar-tissue lesson 11). No live co-editing: last write wins after the
presence warning.
Known limits, revisit before teams lean on it: whole-project saves (no
per-board granularity yet), REST body limits cap huge asset rows, and a
member's local index name can drift from the shared name.

## Sharing status & the validation TODO
P1 v0.12 · P2 v0.14 · P3 + multi-select + table grow + sbrow chaining +
.floorproj + share links **v0.15**. Sharing rung 1 (.floorproj) is fully
verified. Rung 2 (share links + comments): migrations applied
(shares/share_comments tables + RLS + realtime + public 'shares' bucket),
viewer error-path verified against production; the happy path was VALIDATED
by the user on July 11 2026 (a real share + comment exist in the DB). The
viewer got a scene picker in v0.16 (viewers browse every scene read-only).
Note: share snapshots carry assets inside the JSON blob, so the kv→Storage
asset migration is NOT yet done (that still makes sense before heavy use —
big productions make big snapshots). Comments are readable by anyone who
guesses a token-less select; tighten with share-scoped tokens/JWT before
GDPR-sensitive crew data circulates (see ROADMAP risk 4). Rung 3 (co-editors) shipped v0.16 after the user validated rung 2 —
**co-edit validation TODO:** two signed-in accounts, owner enables
co-editing + copies an invite link, second account opens it, both edit and
confirm the presence warning + last-save-wins behaviour.

## What's next (see ROADMAP.md)
The **call-sheet PDF generator** — Day header + Crew + Location + Weather
cards are its direct inputs, all live now. Then validate sharing, then
memberships (rung 3).
