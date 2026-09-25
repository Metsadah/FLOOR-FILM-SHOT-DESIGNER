# Selling Floorboard — hosted plans & branded e-mail

This is the operator's checklist for the **hosted** edition. None of it is
needed for self-hosting: with `billing.provider` empty in `config.js` the app
has no plans at all and every feature is on.

What is already built (v0.66):

- `public.subscriptions` table (one row per user, only the webhook writes it)
- Edge Function `billing-webhook` — verifies Paddle **or** Lemon Squeezy
  signatures and mirrors the subscription into that table
- In-app: plan box in the account panel (Upgrade / Manage), Paddle overlay
  checkout or Lemon Squeezy hosted checkout, and two gates on the free plan:
  **one cloud production** and **no co-editing invites**. Share links,
  exports, call sheets etc. stay free on purpose — they are how people find you.

Everything below is dashboard work only you can do. Order matters a little.

---

## 1 · Branded login mail (Resend) — do this first

Supabase's built-in mailer is rate-limited (you already hit it) and sends
from `noreply@mail.app.supabase.io`. Paying customers must get mail from you.

1. Create an account at https://resend.com (free tier: 3 000 mails/month —
   plenty; auth mail volume is tiny).
2. **Domains → Add domain** → your domain (e.g. `floorstudio.app`). Add the
   DKIM/SPF DNS records Resend shows you at your registrar. Wait for
   "Verified".
3. **API keys → Create** → name it `supabase-auth`, permission *Sending
   access*. Copy the key (starts with `re_`).
4. Supabase dashboard → **Authentication → Emails → SMTP Settings → Enable
   custom SMTP**:
   - Sender e-mail: `login@yourdomain` · Sender name: `Floorboard`
   - Host `smtp.resend.com` · Port `465` · Username `resend` · Password = the
     API key
5. Same page, **Templates**: replace the subject lines (they still say
   "Confirm Your Signup" etc.). Keep the `{{ .ConfirmationURL }}` variables.
6. Test: sign up with a throw-away address, check the mail arrives from your
   domain within seconds.

---

## 2 · Pick a Merchant of Record

Both handle EU VAT, invoices and refunds for you — you invoice *them*, never
the customer. Pick one; the app supports either.

| | Paddle Billing | Lemon Squeezy |
|---|---|---|
| Checkout | overlay inside the app | hosted page (new tab) |
| Fees | 5 % + €0.50 | 5 % + €0.50 |
| Set-up | more forms (business verification) | 15 minutes |
| Needed | KvK number, bank account, website with terms + privacy | same |
| Status 2026 | independent, recommended | part of Stripe since 2024; future as a standalone product unclear |

Either way you need `privacy.html` filled in and `terms.html` published
first — they ask for the URLs.

### 2a · Paddle

1. https://sandbox-vendors.paddle.com → account (sandbox first, always).
2. **Catalog → Products → New**: "Floorboard Pro". Add a **price**:
   €7.00 / month (and a second price €77.00 / year), tax category "Standard digital goods". Note the price id
   `pri_…`.
3. **Developer tools → Authentication → Client-side tokens → Generate**.
   Note the token (`test_…` in sandbox, `live_…` later).
4. **Developer tools → Notifications → New destination**:
   - URL: `https://jcasjylzosgtitaxbrjo.supabase.co/functions/v1/billing-webhook`
   - Events: everything under **subscription.\*** (created, activated,
     updated, canceled, past_due, paused, resumed)
   - Copy the **secret key** (`pdl_ntfset_…`).
5. Supabase → **Edge Functions → billing-webhook → Secrets** (or *Project
   settings → Edge Functions*): add `PADDLE_WEBHOOK_SECRET` = that key and
   `PRO_PRICE_IDS` = the `pri_…` id(s) from step 2 (comma-separated for
   month + year). Events for any other price are ignored (v0.95).
6. `config.js`:
   ```js
   billing: { provider:'paddle', token:'test_…', priceId:'pri_…',
              environment:'sandbox', priceLabel:'€7 / month', priceIdYear:'pri_…', plan:'pro' }
   ```
7. Test with Paddle's sandbox card `4242 4242 4242 4242`. Within ~5 s the
   account panel flips to "PRO plan ✓".
8. Go live: repeat 2–5 in https://vendors.paddle.com, set
   `environment:'production'`.

### 2b · Lemon Squeezy

1. https://app.lemonsqueezy.com → store (turn **Test mode** on first).
2. **Products → New**: "Floorboard Pro", subscription, €7/month. Open the
   product → **Share** → copy the checkout link
   `https://YOURSTORE.lemonsqueezy.com/buy/…`.
3. **Settings → Webhooks → +**:
   - URL: `https://jcasjylzosgtitaxbrjo.supabase.co/functions/v1/billing-webhook`
   - Signing secret: invent a long random string, note it
   - Events: all **subscription_\*** events
4. Supabase → Edge Functions secrets: `LS_WEBHOOK_SECRET` = that string.
5. `config.js`:
   ```js
   billing: { provider:'lemonsqueezy',
              checkoutUrl:'https://YOURSTORE.lemonsqueezy.com/buy/…',
              portalUrl:'https://YOURSTORE.lemonsqueezy.com/billing',
              priceLabel:'€7 / month', priceIdYear:'pri_…', plan:'pro' }
   ```
6. Test in test mode (card `4242…`), then switch test mode off and repeat 2–3
   for the live product.

---

## 3 · How the pieces talk

```
app (Upgrade) ──checkout with customData{user_id, plan}──▶ Paddle / LS
                                                             │ webhook
                                                             ▼
                          billing-webhook (verifies HMAC) ──▶ subscriptions row
                                                             ▲
app polls its own row for ~3 min after checkout ─────────────┘
```

- The app never trusts itself: the plan is read from `subscriptions`, which
  only the service role can write. Users can't upgrade by editing the client.
- A cancelled subscription keeps working until `current_period_end`.
- Gates are client-side (like most indie SaaS v1). If abuse ever matters,
  add RLS on `kv`/`productions` that reads `subscriptions` — the data model
  already supports it.

## 4 · Debugging

- Supabase → **Edge Functions → billing-webhook → Logs**: every call shows
  `ok`, `ignored`, `bad signature` (secret mismatch) or `no user_id`
  (checkout not started from the app).
- Paddle/LS both have a "resend" button per webhook event — use it instead
  of paying again.
- `select * from subscriptions;` in the SQL editor shows what the app sees.

## 5 · Before you take the first euro

- `privacy.html`: fill the yellow `[…]` placeholders (controller identity).
- `terms.html`: same — fill in, publish, link it from the landing page.
- Supabase → Authentication → URL configuration → Site URL = your domain.
- Set up a support address (`hello@yourdomain`) and put it in both documents.

---

## Webhook secrets (v0.95)

The webhook no longer trusts `custom_data.plan`. Set `PRO_PRICE_IDS` (and
optionally `STUDIO_PRICE_IDS`) in Edge Functions → Secrets to the Paddle
price ids / Lemon Squeezy variant ids you sell; events for other products
are ignored. Paddle signatures older than 5 minutes are refused and an event
older than the stored state never overwrites it. Redeploy after changing:
`supabase functions deploy billing-webhook --no-verify-jwt`.

## Invites v2 (v0.92): email, read-only, and the "no active plan" trap

Run `setup/invites-v2.sql` once. Before it, `redeem_production_invite()`
demanded a live plan for the production owner — and with billing switched
off (`config.billing.provider = ''`) nobody has a subscriptions row, so
every co-edit link failed with "The owner of this production has no active
plan right now" (shown as "invalid or revoked" in the app). The plan check
now only applies when the owner HAS a subscriptions row, i.e. when billing
is on and `start_trial` ran at their first sign-in. Invites carry a name,
an email (auto-join at sign-in via `claim_email_invites()`) and a role:
`editor` (co-edit) or `viewer` (read-only, RLS refuses their writes).

## Plans v2 (v0.87): trial · codes · collaborator seats

How the hosted plan now works — all enforced in the database functions, the
app only shows it:

| Account | Can | Cannot |
|---|---|---|
| **Free month** — every new account, 30 days (`billing.trialDays`, fixed server-side in `start_trial`), no card, no auto-renewal | everything | — |
| **Pro** — €7 / month or €77 / year via Paddle | everything; invites up to 5 collaborators (`billing.seats`) | — |
| **Code** — a promo code gives N days of Pro | everything while it runs | — |
| **Guest** — no live plan (trial ended, never paid) | open and edit every production they were invited to, share links, exports | start productions of their own; invite people |

Collaborators cost the owner nothing: the owner's plan carries five distinct
people across all their productions. The sixth invite is refused with a
clear message until someone leaves or the collaborator goes Pro themselves.
Invites also fail while the owner has no live plan.

**Creating codes** — dashboard → SQL Editor:
```sql
insert into promo_codes(code, days, uses_left, expires_at, note)
values ('IDFA-2026', 90, 100, '2026-12-31', 'festival'),
       ('FILMSCHOOL', 180, 40, null, 'school class'),
       ('CREW-DEMO', 30, 1, null, 'one-off');
-- see who used what:
select note, count(*) from subscriptions where status = 'promo' group by note;
```
Codes are case-insensitive. A code on a running trial or another code adds
its days on top; a paying customer keeps the paid plan unchanged.

**Local mode** (self-host, `billing.provider` empty) has none of this: no
trial, no seats, everything on. That is the free product; the hosted €7 is
convenience; a one-time self-host cloud licence (if you want one) is a
licence-text matter, not something the code can enforce.
