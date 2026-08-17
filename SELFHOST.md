# Self-hosting FLOOR Studio

> **License note:** FLOOR Studio is source-available under the
> [Elastic License 2.0](LICENSE). Self-hosting for yourself, your team, or
> your company — commercial productions included — is allowed and encouraged.
> Offering FLOOR Studio itself as a hosted or managed service to third
> parties is not.

FLOOR Studio is plain static files — no build step, no server code. Hosting it
yourself is: put this folder behind any web server. It has two modes, chosen in
`config.js`:

## Local mode (zero setup)

Leave `config.js` empty (both values `''`). The app runs entirely in the
browser: no accounts, projects saved on-device (IndexedDB), installable as a
PWA, PDF exports and everything else included. Sharing/co-editing UI hides
itself. Back up or move projects with **Production ▾ → Export .floorproj**.

Serve the folder any way you like:

```bash
# quickest: python
python3 -m http.server 8080

# or docker (nginx)
docker run -d -p 8080:80 -v "$PWD":/usr/share/nginx/html:ro nginx:alpine
```

Then open http://localhost:8080. (Opening index.html straight from disk mostly
works too, but the service worker and PWA install need http(s).)

## Cloud mode (login, sync, share links, co-editing)

Bring your own free [Supabase](https://supabase.com) project:

1. Create a Supabase project (free tier is plenty for a small team).
2. **SQL Editor** → paste and run `setup/schema.sql` (once).
3. **Settings → API** → copy the Project URL and the publishable (anon) key
   into `config.js`. The key is safe to expose — row-level security guards
   the data.
4. **Authentication → URL Configuration** → set *Site URL* to wherever you
   host the app (magic links redirect there).
5. Optional: custom SMTP under **Authentication → Emails** for branded
   login mails.

Deploy the folder to any static host (GitHub Pages, Cloudflare Pages,
Netlify, your own nginx). Every visitor signs in via emailed magic link;
projects sync across their devices; share links and co-editing work.

## Updating

Replace the files, keep your `config.js`. The service worker picks up new
versions on next load (version chip top-right).
