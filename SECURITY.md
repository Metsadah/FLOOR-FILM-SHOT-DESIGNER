# Floorboard — security & data protection

Audit of 25 September 2026 (v0.95). What the hosted version enforces, what
the operator must switch on in the Supabase / Netlify dashboards, and how
the app meets the GDPR / AVG storage-limitation and rights requirements.
Self-hosters: everything here applies to your instance too.

## 1 · Model

- **Sign-in** is Supabase Auth (email + password, magic link, password reset).
  Only the anon key ships to the browser; every table has row-level security.
  Sessions live in the browser's localStorage (Supabase default) and end on
  sign-out, which also sends you to the landing page.
- **Data** is per account: `kv` rows (`user_id = auth.uid()`), `profiles`,
  `subscriptions`. Shared productions live in `productions` /
  `production_docs` / `production_members` with owner · editor · viewer roles;
  the viewer role is read-only at the database, not just in the UI.
- **Read-only share links** are frozen JSON snapshots in the public `shares`
  bucket under an unguessable 16-character token (≈ 82 bits). Anyone with the
  link can read that snapshot and pin comments; nothing else. Links expire
  after 180 days unless revoked earlier.
- **Floor Scanner photos** live in the private `scout` bucket under
  `<uid>/…`; only that account can read or write them.
- **No analytics, no trackers, no third-party cookies.** Weather lookups send
  a place name or coordinates to Open-Meteo, nothing personal.

## 2 · What the SQL enforces (run in order, once)

| File | Enforces |
|---|---|
| `setup/schema.sql` | fresh install: everything below in one go |
| `setup/invites-v2.sql` | roles owner/editor/viewer, invite by email, owner-only member edits, viewer cannot write |
| `setup/security-v1.sql` (applied to the hosted project 25 Sep 2026, with invites-v2) | no anonymous listing of share tokens or comments, comment insert only for live shares (author ≤ 80, body ≤ 2000), public bucket accepts only your own `<token>.json` ≤ 20 MB, helpers signed-in only, TRUNCATE/REFERENCES/TRIGGER revoked from API roles, reserved display names refused, share expiry + `purge_expired()` |

Reserved names (case-insensitive, punctuation ignored): root, admin,
administrator, superuser, sysadmin, system, support, helpdesk, moderator, mod,
staff, owner, security, abuse, postmaster, webmaster, noreply, floorboard,
floorboardsupport, floorboardteam, floorboardadmin, zoutwater, zoutwaterfilms.
The same list sits in `js/00-catalog.js` (`reservedNameProblem`) for a
friendly message before the database refuses. Names are ≤ 80 characters,
no `<`, `>` or control characters. Sign-in identity is the email address;
there are no usernames to squat.

## 3 · Dashboard checklist (cannot be set from SQL)

Supabase → Authentication:
- [ ] **Leaked password protection: ON** (the advisor flags it off).
- [ ] Minimum password length **10**, require letters + digits.
- [ ] Email OTP / magic-link expiry ≤ 1 hour; rate limits at defaults or lower.
- [ ] Custom SMTP (Resend) so sign-in mail comes from your domain — BILLING.md §1.
- [ ] Redirect URLs: only your domains and `floorboardscout://login`.
- [ ] MFA (TOTP) enabled for accounts that want it (optional for users, on for you).

Supabase → Database:
- [x] pg_cron enabled, `floorboard-purge` runs nightly at 03:15 (done 25 Sep 2026). purge_expired() cannot delete storage rows itself; the owner's client removes orphaned snapshot files when the share panel opens.
- [ ] Pro plan: daily backups (7 days) and point-in-time recovery match the retention promise in privacy.html.
- [ ] Run the Security Advisor after every migration.

Netlify:
- [ ] `_headers` is in the deploy (it is in the zip): CSP, no framing, nosniff, HSTS, referrer policy.
- [ ] HTTPS only, custom domain with automatic certificate.
- [ ] No access-log add-ons (privacy.html says we keep none).

Apple / Floor Scanner: the app stores scans locally; sync uses the same
Supabase account and bucket policies. Nothing else leaves the phone.

## 4 · GDPR / AVG mapping

| Requirement | Where |
|---|---|
| Lawful basis, purposes, controller | privacy.html §1–2 (contract for the service; you are controller for cast/crew data you enter — we are processor) |
| Data minimisation | profile fields optional; stills downscaled on upload; presence chip shows only the part before the `@` |
| Storage limitation | privacy.html retention table; `expires_at` on shares; `purge_expired()`; unused invites 1 year; inactive accounts policy 24 months |
| Access / portability | *Account & privacy → Download my data* (JSON export) |
| Rectification | profile editable in the app |
| Erasure | *Delete my account* → `delete_my_account()` removes kv, productions (cascade docs/members/invites), shares + snapshot files, profile, auth user |
| Consent record | `profiles.privacy_version` + `privacy_accepted_at`; bump `PRIVACY_VERSION` in the adapter on policy changes and users are re-prompted |
| Sub-processors | Supabase (Ireland), Netlify, Resend, payment provider — listed in privacy.html; sign their DPAs |
| Breach process | Supabase notifies the project owner; you notify affected users and the Autoriteit Persoonsgegevens within 72 h — keep the user emails exportable (`auth.users`) |
| Age | terms.html: 16+ |

Register of processing (art. 30) — keep a one-page record: purposes
(planning productions), categories (account data, production content incl.
cast/crew contact data, billing), recipients (sub-processors above), transfers
(none outside the EU except the payment provider's own terms), retention
(the table above), security (this document).

## 5 · Known limits, honestly

- Floor access per co-editor is a UI boundary: the production is one JSON
  document, so a determined member with the anon key can read the budget
  through the API. A hard boundary needs the budget in its own row with its
  own policy — on the roadmap, noted in DEVNOTES.
- Read-only snapshots contain whatever the production contains, including
  call-sheet phone numbers. The app says so when you create one; keep those
  links short and revoke them after the job.
- Comments on share links are anonymous by design (a client without an account
  must be able to react). Author names are free text, capped and filtered;
  the owner can delete any comment.
- Inline scripts remain in index.html / landing.html, so the CSP allows
  `'unsafe-inline'` for scripts. Moving them to files would let us drop it.
