# Self-hosting Floorboard

Floorboard is a folder of static files: HTML, CSS and JavaScript, no build
step and no server code of its own. Hosting it yourself means putting that
folder behind a web server. Ten minutes for the local version, half an hour
with accounts and sync.

> **License.** Floorboard is source-available under the
> [Elastic License 2.0](LICENSE). Running it for yourself, your crew or your
> company — paid productions included — is allowed and encouraged. Offering
> Floorboard itself as a hosted or managed service to others is not.

## Which version do you want?

| | **Local** | **Cloud** |
|---|---|---|
| Accounts / sign-in | none | e-mail + password, magic link |
| Where work is saved | in the browser that made it (IndexedDB) | your own Supabase database, synced across devices |
| Co-editing, share links, Floor Scanner sync | no | yes |
| Backups | Production ▾ → Export .floorproj | automatic (Supabase), plus .floorproj |
| Setup | copy the folder, done | copy the folder + a free Supabase project |

Both versions have every floor, every export and the iPad layout. Start
local; switching to cloud later is a two-line change in `config.js`.

## 1 · Local version (ten minutes)

1. Download the release zip and unpack it, or clone the repository.
2. Open `config.js`. Both keys empty means local:
   ```js
   supabaseUrl: '',
   supabaseKey: '',
   ```
3. Serve the folder over http(s). Any static server works:
   ```bash
   # on a Mac or Linux machine with Python
   python3 -m http.server 8080
   # or with Docker (nginx)
   docker run -d -p 8080:80 -v "$PWD":/usr/share/nginx/html:ro nginx:alpine
   # or the included Dockerfile
   docker build -t floorboard . && docker run -d -p 8080:80 floorboard
   ```
4. Open http://localhost:8080. Install it as an app from the browser menu if
   you like — it then works offline.

Opening `index.html` straight from disk mostly works too, but offline mode
and "install as app" need http(s).

**Where is my work?** In the browser profile that made it. Clearing site data
deletes it, so export a `.floorproj` (Production ▾) before you clean up or
move to another machine. That file holds everything, images included.

## 2 · Cloud version (half an hour)

You bring the database; Floorboard talks to it directly from the browser.
[Supabase](https://supabase.com) is what the app is built for and its free
tier is enough for a small company.

1. **Create a Supabase project.** Pick a region near you. Wait for it to
   finish provisioning.
2. **Create the tables.** Supabase dashboard → SQL Editor → New query →
   paste the whole of `setup/schema.sql` → Run. This creates the tables,
   the row-level-security rules (every user only ever sees their own rows
   and the productions they were invited to), the sharing functions and
   the photo bucket for Floor Scanner.
3. **Copy the two keys** from Project Settings → API into `config.js`:
   ```js
   supabaseUrl: 'https://YOURPROJECT.supabase.co',
   supabaseKey: 'sb_publishable_…',      // the publishable / anon key
   ```
   The publishable key is meant to be in the page; the security rules from
   step 2 are what protect the data. Never put the service-role key here.
4. **Tell Supabase where the app lives.** Authentication → URL
   Configuration → *Site URL* = the address you host the app on
   (for example `https://floorboard.yourcompany.com`). Add the same address
   to *Redirect URLs*. If you use the Floor Scanner iPhone app, also add
   `floorboardscout://login`.
5. **Deploy the folder** to any static host: Netlify, Cloudflare Pages,
   GitHub Pages, Vercel, or your own nginx / Apache. No server settings are
   needed beyond serving the files; https is required for sign-in.
6. **Sign in** with your e-mail. The first account is created on the spot.

### Optional but recommended

- **Your own mail sender.** Authentication → Emails → SMTP settings. Without
  it, sign-in mails come from Supabase's shared sender with a low daily
  limit. Any SMTP provider works (Resend, Postmark, Mailgun, your own).
- **Backups.** Supabase keeps daily backups on paid plans; on the free plan
  export the database now and then (Database → Backups) or rely on
  `.floorproj` exports of the productions that matter.
- **Billing / plans.** The hosted edition's plan gates are off by default
  in a self-hosted copy: everything is unlocked. See `BILLING.md` only if
  you want to sell access yourself.

## 3 · Updating

Replace every file **except `config.js`** with the new release. Reload the
page; the version chip top right shows the new number. Nothing in the
database needs to change for ordinary updates. When a release adds tables
or columns, the notes at the end of `setup/schema.sql` say what to run —
each statement is written so running it twice is harmless.

## 4 · People and access

**Inviting.** Share → *People on this production*: name, email, co-edit or
read-only, and a tick per floor. With an email the person is joined the
moment they sign in with that address; the link is a shortcut. Read-only
people browse and export, the database refuses their writes. Requires
`setup/invites-v2.sql` (included in `schema.sql` §7 for fresh installs).

- **One account per person.** Everyone signs in with their own e-mail;
  productions belong to the account that created them.
- **Co-editing.** The owner enables it per production (Share → Co-editors)
  and hands out invite links. Two kinds: *all floors*, or *crew* — mood,
  script, plans and shot list, but not Budget and Production. Per member
  the owner can switch any floor on or off afterwards with the chips next
  to their name.
- **Read-only share links** show a frozen copy of the production to anyone
  with the link; viewers can drop comment pins, nothing else.
- **Floor Scanner** (iPhone) signs in with the same account; scanned rooms
  and location photos appear in the room library.

## 5 · Troubleshooting

- *Sign-in mail never arrives* → check Supabase Authentication → Logs, and
  the daily limit of the built-in sender; set up SMTP.
- *"Invalid redirect" after clicking the mail link* → the address you host
  on is missing from Redirect URLs (step 4).
- *Everything works locally but not on the server* → the app is served over
  plain http, or the folder is served from a sub-path while `config.js`
  points elsewhere; the app itself is path-independent, sign-in is not.
- *A colleague sees no productions* → they are signed in with a different
  e-mail than the invite was sent to, or the invite was revoked.
- *Version chip does not change after an update* → hard-reload once; the
  offline cache hands over on the second load.
