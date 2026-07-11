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
- `supabase-adapter.js` — magic-link login + cloud kv storage. Runs in
  <head>; storage chain: window.storage → FLOOR_STORAGE → IndexedDB.

## Data model essentials
- `project.scenes[]` — each scene IS a board (walls, objects, stills) and
  holds `scene.shots[]`; **every camera object has `shotId`** mapping it to
  one shot. `activeShot` is a legacy alias of `activeScene`.
- Project-level boards: `project.moodboard`, `project.scriptboard`,
  `project.prodboard` — scene-shaped, routed by `activeScene()` via
  `activeTab` + `BOARD_TABS = {'mood','org','write'}`.
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
- **Lights throw beams (v0.13):** `LIGHT_BEAMS` in 00 maps light kinds to
  {spread, range, axis, tint} or {omni} — spots emit along local +x like
  camera FOV, panels along +y (their long face). Drawn as soft gradients
  under the icon in the prop branch of `drawObjectShape`; `o.beam === false`
  disables (Beam toggle in selBar).

## Object types on canvas (drawn in drawObjectShape, 01)
camera, actor, note, text, line (bendable via `o.mid`), link (auto-title from
URL unless custom label; auto-fetches video thumbs, debounced), ink,
infocard, colorcard, todo (cell rows; tap checkbox zone <34px toggles;
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
   Current: verChip v0.13 ↔ floor-shell-v12.
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
   **Also: cache-bust or you verify stale code.** The SW + Chrome's HTTP
   cache happily serve old js after a mid-session edit (this ate an hour —
   a "failing" fix was simply never loaded). In the local copy: append
   `?v=<timestamp>` to every `./js/0*.js` src AND neuter
   `navigator.serviceWorker.register`. Confirm the loaded code with
   `someFn.toString().includes('<new snippet>')` before debugging it.

## Supabase (project id jcasjylzosgtitaxbrjo, eu-west-1)
Table `public.kv` (user_id uuid default auth.uid(), key, value, updated_at;
PK user_id+key; RLS "users manage their own rows"). Publishable key in the
adapter is `floor_shot_designer` — safe to be public by design. Auth → URL
Configuration must list the Netlify URL (+ `/**` redirect wildcard). Agreed:
future server code = **Supabase Edge Functions** (not Netlify Functions),
first use = AI script breakdown.

## What's next (see ROADMAP.md)
P1 (People registry + Crew/Cast/Client list cards, org panel removed)
**shipped in v0.12**. Next: P2 — field cards (label:value rows; Production
info + Location, prefilled from `production.company/…/locations`),
paste-to-import on list cards, Checklist 2.0 templates. Then P3 (day header
card with sunrise/sunset), then the call-sheet PDF generator, then share
links + comments (bundle the Storage-bucket migration into that).
