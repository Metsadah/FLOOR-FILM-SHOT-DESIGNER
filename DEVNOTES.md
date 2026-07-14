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

## v0.31 — TV + TV cabinet props
`tv` (Tech group, slim top-down slab + center foot, 110×18) and `tvunit`
(Furniture, split doors + handles + open media shelf, 160×45). Note: 'TV'
is 2 chars so the prop-list SCRIPT scan skips it (min length 3 — avoids
false hits); board placement still lists it.

## KNOWN DATA-LOSS RISK (diagnosed 2026-07-14, not yet fixed)
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
