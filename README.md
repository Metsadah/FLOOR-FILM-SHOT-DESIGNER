# FLOOR — Film Shot Designer

A single-file, top-down shot design tool for pre-production blocking: sketch the set,
place cameras / cast / grip, block movement, plan the sun, and export shot lists.

Everything lives in **`index.html`** — no build step, no dependencies. Projects and
recce images are saved automatically (locally per browser, or in the cloud with Stage 2).

---

## Hosting on GitHub Pages (Stage 1 — free, ~10 minutes)

You already have the repo: `Metsadah/FLOOR-FILM-SHOT-DESIGNER`. Do this once:

**1. Put the files in the repo.**
Open **GitHub Desktop** → make sure this repository is selected (top-left).
Click *Repository → Show in Explorer/Finder* and copy these three files into that folder:

- `index.html`   ← the app (the name matters: GitHub Pages serves `index.html` automatically)
- `supabase-adapter.js`
- `README.md`

**2. Commit and push.**
Back in GitHub Desktop you'll see the files listed as changes. Type a short summary
bottom-left (e.g. `first version of FLOOR`), click **Commit to main**, then click
**Push origin** (top bar).

**3. Turn on GitHub Pages.**
On github.com, open your repo → **Settings** → **Pages** (left menu).
Under *Build and deployment*: Source = **Deploy from a branch**,
Branch = **main**, folder = **/ (root)** → **Save**.

**4. Wait ~1 minute, then open:**

```
https://metsadah.github.io/FLOOR-FILM-SHOT-DESIGNER/
```

That's it. Every future improvement = copy the new `index.html` over the old one,
commit, push — the site updates itself within a minute.

> **Where is my data in Stage 1?** In your browser (IndexedDB), per device.
> It survives restarts, but clearing site data deletes it, and your laptop and
> iPad each have their own copy. That's what Stage 2 solves.

> **Optional — your own domain:** in Settings → Pages you can add a custom domain
> like `floor.zoutwater.com` (then add a CNAME record at your DNS pointing that
> subdomain to `metsadah.github.io`).

---

## Stage 2 — cloud saves + login (Supabase, ~15 minutes)

Gives you: sign-in via emailed magic link, projects that follow you across devices,
and the foundation for sharing with collaborators later.

**1. Create the backend.**
Go to [supabase.com](https://supabase.com) → New project (free tier is plenty).

**2. Create the storage table.**
In the Supabase dashboard: **SQL Editor** → paste and run:

```sql
create table kv (
  user_id    uuid not null default auth.uid(),
  key        text not null,
  value      text not null,
  updated_at timestamptz default now(),
  primary key (user_id, key)
);

alter table kv enable row level security;

create policy "users manage their own rows"
  on kv for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**3. Connect the app.**
In Supabase: **Settings → API** — copy the *Project URL* and the *anon public* key.
Open `supabase-adapter.js` and paste both at the top.

**4. Switch it on.**
Open `index.html`, find the Stage 2 comment near the top of `<head>`, and uncomment
the two `<script>` lines. Commit + push.

Reload the site: you'll get a sign-in card, receive a login link by email, and from
then on your projects and recce images live in your Supabase project — same app,
any device.

> **Auth settings tip:** in Supabase → Authentication → URL Configuration, set the
> *Site URL* to your GitHub Pages address so the magic links redirect correctly.

---

## Roadmap ideas (Stage 3)

- **Share links** — a read-only URL per project for directors / clients
  (one extra table + a public policy).
- **Live collaboration** — real multi-cursor editing needs a sync engine
  (Yjs + Liveblocks / PartyKit); only worth it if two people genuinely need to
  move actors at the same time. The PDF export + share links cover most workflows.

## Notes

- 1 canvas unit = 1 cm; grid dots are 50 cm apart.
- Recce images are downscaled client-side before storage; with Supabase (or
  IndexedDB) you can raise the limits in `storeImageFile()` in `index.html`.
- Tested in current Chrome / Edge / Firefox / Safari.
