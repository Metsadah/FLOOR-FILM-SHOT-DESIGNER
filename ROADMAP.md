# FLOOR — Product Roadmap
### From shot designer to pre-production suite

*Working document — revise as reality intervenes.*

---

## The strategic idea

Every serious pre-production tool (StudioBinder, Celtx, Yamdu) starts from
**documents** — scripts, breakdowns, call sheets — and treats the visual side as
an afterthought. FLOOR starts from the **space**: the floor plan, the blocking,
the camera. That's the wedge. Nobody else does top-down blocking well, and it's
the thing crews actually gather around.

So the strategy is not "clone StudioBinder." It's: **keep the board as the
heart, and let every other module be a different view of the same data.**

The insight that makes the whole roadmap tractable: a script breakdown, a shot
list, a schedule, and a call sheet are not four features. They are **four
projections of one data model**:

```
Project
 ├─ People        (cast, crew, contacts, roles)
 ├─ Locations     (address, parking, power, hospital, sun orientation)
 ├─ Elements      (props, wardrobe, vehicles, gear — much already exists as board props)
 ├─ Scenes        (from script: INT/EXT, location, day/night, cast, elements)
 │    └─ Shots    (the boards FLOOR already has: blocking, cameras, framing, script)
 └─ Shoot days    (scenes scheduled onto days → call sheet = shoot day + people + location)
```

Get this model right in Phase 0 and every later feature becomes a view + an
export. Get it wrong and every feature is a rewrite.

---

## Phase 0 — Foundation (before adding any features)

**Goal: make the codebase and data model able to carry a suite.**

1. **Split the single file.** The one-file architecture was right for v1; it
   won't carry ten modules. Move to a small Vite project (still vanilla JS or
   light framework), deployed automatically to GitHub Pages / Cloudflare Pages
   via GitHub Actions. Same hosting cost: €0.
2. **Introduce the entity model above** with a schema version number and
   explicit migrations (the `migrateShot` pattern, formalized). Current
   projects must import losslessly: today's shots become Scenes+Shots with
   defaults.
3. **Ship Supabase Stage 2 properly**: magic-link auth, projects table,
   images in Supabase Storage buckets (drop the aggressive downscaling),
   row-level security. The adapter already exists — this is wiring + testing.
4. **Add a server-side layer for secrets**: Supabase Edge Functions. Needed the
   moment FLOOR calls any external API (Claude for breakdowns, weather,
   Frame.io) — API keys can never live in a public HTML file.

*Rough effort: 2–4 focused weekends. Nothing user-visible except login.*

---

## Phase 1 — Single-user depth ("indispensable for your own shoots")

Build what feeds Zout Water productions directly. Dogfood everything.

### 1.1 Script import & automatic breakdown  ⭐ the headline feature
- **Import formats:** Fountain (plain-text screenplay standard — trivial to
  parse), Final Draft `.fdx` (XML — well documented), PDF (hardest; OCR-ish
  heuristics, do last). **AV scripts** (two-column audio/video, common in
  commercial work — usually .docx/tables): parse rows into scenes/shots. This
  matters because your commercial work is AV-script-shaped, not
  screenplay-shaped; most competitors ignore AV entirely. **Second wedge.**
- **Rule-based pass:** scene headings → INT/EXT, location, day/night;
  character names from dialogue cues; capitalized recurring nouns → candidate
  props.
- **AI pass (Claude via Edge Function):** tag elements per scene (cast, props,
  wardrobe, vehicles, SFX, animals…), suggest shot ideas per scene, flag
  continuity items. Human-reviewable — breakdowns are suggestions, the user
  confirms. Usage-metered (this becomes a paid-tier feature; it has real
  per-use cost).
- Each scene auto-creates in the Scenes list; one click spawns a linked FLOOR
  board per scene/shot.

### 1.2 Shot list view
A sortable table of every shot across scenes (number, scene, framing, lens,
support, movement, description, status). The data already exists on the
boards — this is a view + CSV/PDF export. Cheap to build, high daily value.

### 1.3 Scheduling (stripboard)
Drag scenes onto shoot days. Show per-day totals (pages/shots), cast
day-out-of-days grid. Keep v1 simple: manual dragging, no auto-optimizer.

### 1.4 Automatic call sheets  ⭐ the other headline
Generated from: shoot day (scenes → shots → cast/elements needed) + Location
(address, parking, hospital) + People (roles, phones, call times) + computed
**sunrise/sunset** (pure client-side math from date + coordinates) + **weather**
(Open-Meteo, free, no key). Output: a clean PDF matching NL industry
conventions, bilingual NL/EN template. Later: send + track (Phase 2).

### 1.5 Moodboards & gear lists
- Moodboard canvas per scene/shot — the stills system, freed from the shot
  plan (Milanote-style freeform boards).
- Gear checklist generated from what's placed on boards (every jib, HMI and
  truss you drag in is already structured data) + manual additions.

*Sequencing within Phase 1: shot list → call sheets → script import →
scheduling → moodboards. Ship each alone; each is independently useful.*

---

## Phase 2 — Collaboration

In honesty order — from cheap to genuinely hard:

1. **Share links** (read-only / comment-only): signed URL to a project. RLS
   policy + a viewer mode. Days of work, huge client value.
2. **Comments**: pinned to shots/boards Figma-style, with mentions. A comments
   table + realtime subscription (Supabase Realtime handles this fine).
3. **Members & roles**: owner / editor / viewer per project.
4. **Call sheet distribution**: email via an Edge Function (Resend or similar),
   with per-recipient "confirmed" tracking — the SetHero feature crews love.
5. **Live co-editing** ⚠️ the hard one. Today FLOOR saves whole-project JSON;
   simultaneous editing needs per-object sync and conflict resolution (CRDTs —
   Yjs + a provider like Liveblocks/PartyKit, or y-supabase). This is a
   re-architecture of the save layer, not a feature. Do it only when real
   teams ask for it; until then, presence indicators + "last write wins with
   warning" covers 90% of two-person use.

---

## Phase 3 — Integrations & ecosystem

- **Frame.io** (Adobe): OAuth via Edge Function; link review clips to shots,
  pull review comments into FLOOR's comments. Natural fit — pre-production in
  FLOOR, review in Frame.io. *(Note: if by "frameset" you meant frameset.app —
  the licensed film-still reference library — that's a moodboard integration
  instead: search reference frames from real films inside the moodboard. Worth
  checking whether they expose an API before promising it. Both are worth
  pursuing; they serve different moments in the workflow.)*
- **Calendar**: ICS feed per project (shoot days + call times) → subscribable
  in Google/Apple Calendar. Cheap, loved.
- **Maps on call sheets**: static map + parking pin. OpenStreetMap tiles are
  free and license-clean; Google Static Maps needs a billed key.
- **Deeper exports**: nicer PDF theming (crew-facing vs client-facing),
  CSV everywhere, and — niche but pro — Movie Magic / Final Draft round-trips
  if users ask.

---

## Phase 4 — The business layer

- **Tiers** (aligned with what things cost you):
  - **Free** — local-only, full shot designer, watermark-free exports. The
    funnel and the goodwill.
  - **Pro** (€/month or €/year) — cloud sync, script breakdown (AI-metered),
    call sheets, share links.
  - **Team** — members/roles, distribution tracking, live collab when it lands.
- **Payments:** Paddle or Lemon Squeezy as merchant of record (they handle EU
  VAT — you invoice one counterparty). License state lives in Supabase.
- **Legal:** ToS + privacy policy (GDPR — you're storing crew contact data,
  that's personal data with real obligations). Get the VAT/entity setup
  checked by your accountant.
- **Marketing:** landing page (the Zout Water repositioning muscles apply
  directly), template gallery, NL film community first — you have the network.

---

## Hosting & infra evolution

| Stage | Hosting | Backend | Cost |
|---|---|---|---|
| Now | GitHub Pages | IndexedDB (local) | €0 |
| Phase 0–1 | Cloudflare Pages or Netlify (build step, previews) | Supabase free tier + Edge Functions | €0 |
| Phase 2+ | same | Supabase Pro (storage, realtime, backups) | ~€25/mo |
| AI features | — | Claude API, metered per breakdown | usage-based → price into Pro tier |

---

## Honest risks

1. **Scope.** This roadmap is, collectively, what StudioBinder employs a
   company to build. The defense is ruthless sequencing: every item ships
   alone and is useful alone. Never two half-features.
2. **Solo founder + freelance filmmaking.** FLOOR competes with billable
   days. Decide per-phase whether it's still fun/strategic. The exit ramp at
   every phase: FLOOR as a free portfolio tool that markets Zout Water is a
   *success state*, not a failure.
3. **Validate before Phase 2.** Collab and payments are where effort explodes.
   Before building them, put Phase 1 in the hands of 5–10 working filmmakers
   (you know them) and watch what they actually use. Their behavior — not
   their compliments — decides Phase 2.
4. **The AI breakdown needs a cost story from day one.** Metered, Pro-only,
   with visible limits. Free unlimited AI is how side projects die.

---

## Suggested next three moves

1. Ship Stage 2 (Supabase login + cloud saves) — everything else stacks on it.
2. Build the **shot list table view** — smallest step toward "suite," instant
   daily value, forces the Scene/Shot data model into existence.
3. Prototype the **AV script parser** with one real Zout Water script — if the
   breakdown magic works on your own commercial work, that demo sells the
   whole vision.
