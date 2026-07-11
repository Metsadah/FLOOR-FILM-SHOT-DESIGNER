# FLOOR Studio — Product Roadmap
### the floor is yours

*Working document — v0.11, July 2026. Revise as reality intervenes.*

---

## The strategic idea (unchanged, still true)

Every serious pre-production tool (StudioBinder, Celtx, Yamdu) starts from
**documents** and treats the visual side as an afterthought. FLOOR starts from
the **space**: the canvas, the blocking, the camera. Keep the board as the
heart; let every module be a different view of the same data.

A breakdown, a shot list, a schedule, and a call sheet are **four projections
of one data model**:

```
Production
 ├─ People        (crew, cast, client — one registry, many views)
 ├─ Locations     (address, parking, power, hospital)
 ├─ Scenes        (from script: heading, day/night, cast)
 │    └─ Shots    (cameras on boards — every camera maps to one shot)
 ├─ Boards        (moodboard, script & storyboard, production, scene boards)
 └─ Shoot days    (scenes onto days → call sheet = day + people + location + weather)
```

---

## Where we actually are (v0.11)

**Done, live on Netlify:**
- Multi-file architecture (no build step — deliberate; Vite waits until npm
  dependencies force it). Self-hosted vendor libs (supabase-js, pdf.js).
- Supabase Stage 2: magic-link login, cloud saves, RLS-protected kv storage.
- Multi-production support (switcher, create/rename/delete).
- Four-tab studio on one canvas engine: Moodboard · Script & Storyboard ·
  Shot designer · Production.
- Script blocks (film + 2-column AV), imports (.txt/.fountain/.fdx/.pdf),
  rule-based breakdown → scenes + cast + linked storyboard rows.
- Board objects: notes, text, images (captions), links (auto title+preview),
  to-dos, self-sizing tables, color cards, files (PDF previews), audio cards,
  live weather (Open-Meteo/GFS), production card templates.
- Contextual exports (PNG / board PDF / scene-pages PDF), contextual help,
  trash can, paste-from-clipboard, PWA.

**Deliberately deferred:** Edge Functions (lands with the first external-API
feature), images in Supabase Storage buckets (lands with sharing — see below).

---

## Next up A — Production tab 2.0  ✅ SHIPPED (P1 v0.12 · P2 v0.14 · P3 v0.15)

**The vision.** The Production tab becomes a full canvas — the right-side
forms panel goes away entirely. Everything the shoot day needs lives as
**smart cards** on the board. The reference target is the real Zout Water
call sheet (MAX Badkamers TVC): production header + general call, per-role
call times, sunrise/sunset/weather, location block with parking notes, crew
table with phone + email. What the cards hold today, the call-sheet
generator (Next up C) prints tomorrow.

**The core rework: from text templates to smart cards.** Today's production
cards are pre-filled sticky notes — flexible but dumb: no structure, nothing
downstream can read "who is the gaffer." Smart cards are **structured,
field-based objects** on canvas, built on machinery that already exists (the
table renderer, cell editor, Tab/Enter chains, + chips):

- **Field cards** — label:value rows (Production info, Location). Click a
  value to edit; Tab hops fields; empty fields render as light placeholders.
- **List cards** — repeating rows with typed columns (Crew, Cast, Client
  contacts, Schedule, Checklist 2.0). Enter adds a row; rows reorder by drag.

**The single source of truth: a People registry.** One list per production:
`{name, role, phone, email, tag: crew|cast|client, call}`. The **Crew card**,
**Cast card**, and **Client card** are *filtered views* of this registry —
add a person on any card and they exist everywhere; edit a phone number once.
This is the deep design decision: cards are windows, not silos. The registry
also feeds @-style pickers later (storyboard "who's in this scene", call
sheet recipients, comment mentions).

**Easy contact entry, three ways:**
1. Type in the card (Tab/Enter flow, like the tables today).
2. **Paste a block** — "Arthur Vis, gaffer, +31 6 439..., arthur@..." per
   line; FLOOR parses name/role/phone/email heuristically, shows a preview,
   you confirm. Handles the "I have this in WhatsApp/mail already" reality.
3. Later: import from the breakdown (cast names detected in the script
   auto-seed the registry, tagged cast).

**Checklist 2.0** = the to-do object (already cell-based) + named templates:
camera dept, grip/light, location scout, wrap — pick a template, get a
pre-filled editable checklist.

**Migration:** existing `production.contacts`/`locations` data folds into the
registry on first load; the org side panel is deleted; existing template
notes on boards stay as plain notes (nothing breaks).

### Implementation milestones + prompts (paste these when ready)

**Milestone P1 — the registry + Crew/Cast/Client cards**
> Rework the Production tab: remove the right-side org panel entirely (fold
> its data into a new per-production People registry:
> `project.production.people = [{id, name, role, phone, email, tag, call}]`,
> migrating existing contacts). Build a new "list card" canvas object type on
> the table machinery: typed columns, click-to-edit cells, Tab/Enter flow,
> + chip to add rows, drag rows to reorder, self-sizing. Ship three cards in
> the Production library — Crew, Cast, Client — each a filtered live view of
> the registry (tag=crew/cast/client): adding a row adds a person to the
> registry, edits sync across cards. Crew card columns: Role, Name, Call,
> Phone, Email — matching a Dutch call sheet crew table.

**Milestone P2 — field cards + paste-to-import**
> Add a "field card" object (label:value rows, placeholders when empty,
> Tab between values) and ship: Production info card (production name, company,
> address, email, phone — prefilled from the production) and Location card
> (name, address, parking, power, hospital, notes). Add paste-to-import on
> Crew/Cast/Client cards: paste multi-line text, parse name/role/phone/email
> per line heuristically, show a confirm preview, then insert into the
> registry. Rework the checklist into Checklist 2.0: template picker
> (camera / grip & light / location / wrap / blank) on drop.

**Milestone P3 — the call-time block + sunrise/sunset**
> Add a "Day header" card: date picker, general call time (big), shooting
> call, est. wrap, and computed sunrise/sunset (client-side solar math from
> the location card's place, geocoded once via Open-Meteo). Visually echo a
> Dutch call sheet header. This card + Crew card + Location card + Weather
> card become the direct inputs to the call-sheet PDF generator.

---

## Next up B — Sharing & comments (was "Phase 2", now scoped)

The agreed ladder, cheap → hard. Sequence: **1 → 2 → (validate) → 3**. Live
co-editing (4) stays parked until real teams demand it.

1. ✅ **Project export/import** (.floorproj JSON incl. images) — shipped
   v0.15 (production switcher → Export/Import).
2. ✅ **Read-only share links + comments** — code + DB shipped v0.15,
   **awaiting owner validation** (sign in, Share → create link, open in a
   private window, pin a comment). Snapshots carry their assets inside the
   JSON, so the kv→Storage asset migration is deferred, not done.
   Original plan: snapshot the production into a shared table under a random token;
   `?view=TOKEN` opens a locked viewer mode (no tools, no save). Comments are
   a separate table (position-pinned, Supabase Realtime), so commenters
   physically can't touch project data. RLS does the enforcement.
   *Prereq bundled here: move images/files from kv to Supabase Storage
   buckets — share links are broken without shared assets, and kv was never
   the right home for base64 blobs anyway.*
3. ✅ **Memberships & roles** — first slice shipped v0.16: productions /
   members / docs / invites tables with per-role RLS, owner + editor roles
   (commenter/viewer = share links), invite links (?join=CODE) redeemed
   after magic-link login, async editing guard ("X opened this N min ago"),
   last-write-wins. Still open from the original plan: per-board saves,
   email invites via Edge Functions, and a viewer/commenter membership role.
4. **Live co-editing** (CRDTs — Yjs + provider): a save-layer re-architecture,
   not a feature. Only when teams ask.

---

## Next up C — the rest of Phase 1 (unchanged priorities)

- **1.4 Automatic call sheets** ⭐ NOW UNBLOCKED — generated from Production
  2.0 cards + registry + live weather + sunrise/sunset (Day header, Crew,
  Location and Weather cards all live as of v0.15). Output: one-page PDF
  matching the Zout Water sheet, NL/EN.
- **AI breakdown pass** (Claude via Supabase Edge Functions — the agreed
  first Edge Function): element tagging per scene, AV-script intelligence,
  shot suggestions. Metered, Pro-tier.
- **Scheduling (stripboard)**: scenes onto shoot days; day-out-of-days later.
- **Shot list table view**: sortable cross-scene table + CSV (storyboard rows
  cover part of this; the flat table still has producer value).

---

## Phase 3 — Integrations & ecosystem

- **Frame.io** (OAuth via Edge Function): review clips linked to shots.
- **ShotDeck / Frameset**: no public APIs (checked) — paste-from-clipboard is
  the workflow, already shipped. Revisit if they open APIs.
- **Calendar**: ICS feed per production (shoot days + calls).
- **Maps on call sheets**: OSM static tiles (free, license-clean).

---

## Phase 4 — The business layer

- **Tiers:** Free (local, full designer) · Pro (cloud, AI breakdown, call
  sheets, share links) · Team (members/roles, distribution).
- **Payments:** Paddle / Lemon Squeezy as merchant of record (EU VAT solved).
- **Legal:** GDPR matters *more* after Production 2.0 — the People registry
  is precisely "personal data of third parties." Privacy policy before any
  sharing feature ships crew contacts to other users.
- **Marketing:** NL film community first; FLOOR as Zout Water's calling card
  is a success state, not a fallback.

---

## Hosting & infra

| Stage | Hosting | Backend | Cost |
|---|---|---|---|
| Now (v0.11) | Netlify drag-and-drop | Supabase free (kv + auth) | €0 |
| Sharing | Netlify | + Storage buckets, shared tables, Realtime | €0 → ~€25/mo at scale |
| AI features | Netlify | + Edge Functions + Claude API (metered) | usage-based |

---

## Honest risks (updated)

1. **Scope** — unchanged, still the big one. Defense: every item ships alone.
2. **The registry is a data-model commitment.** People-as-registry (P1) is
   the kind of decision that's cheap now and a rewrite later — which is why
   Production 2.0 precedes call sheets and sharing.
3. **Validate before memberships.** Share links + comments will reveal
   whether anyone actually collaborates. Watch behavior, not compliments.
4. **GDPR before sharing crew data.** Non-negotiable ordering.

---

## Suggested next three moves

1. **Production 2.0, milestone P1** (registry + Crew/Cast/Client cards).
2. **P2 + P3** (field cards, paste-import, day header) → then the
   **call-sheet PDF generator** while the cards are fresh.
3. **Share links + comments** (with the Storage-bucket move bundled in).
