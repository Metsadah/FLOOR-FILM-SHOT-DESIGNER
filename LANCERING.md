# FLOOR Studio betaald maken — stappenplan

Volgorde is bewust: elke stap heeft de vorige nodig. Reken op ~4 tot 6 losse
avonden. De technische kant in de app is klaar (v0.66/0.67): tabel
`subscriptions`, webhook, upgrade-knop, plan-gates en landingspagina.
Technische details per stap staan in `BILLING.md`; dit is het overzicht.

## Fase 0 · Zakelijk fundament (1 middag, eenmalig)

1. **KvK-inschrijving** (eenmanszaak volstaat). Nodig voor Paddle/Lemon
   Squeezy, btw en de algemene voorwaarden.
2. **Btw-nummer** krijg je automatisch na inschrijving. Kies je een Merchant
   of Record (MoR), dan factureer jij alleen aan hén (B2B, btw verlegd) — de
   klant-btw in 30+ landen regelen zij.
3. **Zakelijke rekening** (Bunq/Knab/ING) waar de MoR maandelijks uitbetaalt.
4. **Support-mailbox**: `hello@…` op je eigen domein (zie fase 1). Komt in
   privacy, voorwaarden en de landingspagina.

## Fase 1 · Eigen domein en hosting (1 avond)

Doel: `https://floorstudio.app` (of wat je kiest) in plaats van `*.netlify.app`.

1. **Domein kopen** — TransIP, Cloudflare Registrar of Netlify zelf. Kort,
   uitspreekbaar, `.app` of `.nl`. Koop meteen ook de `.nl`/`.com`-variant
   als die vrij is en laat die doorverwijzen.
2. **Netlify → Site → Domain management → Add custom domain** → vul je domein
   in. Netlify geeft je twee opties:
   - *Netlify DNS* (makkelijkst): zet bij je registrar de nameservers op die
     van Netlify (`dns1.p0x.nsone.net` etc.). Alles verder automatisch.
   - *Externe DNS*: bij je registrar een `A`-record voor de apex naar
     `75.2.60.5` en een `CNAME` voor `www` naar `JOUWSITE.netlify.app`.
3. **HTTPS**: Netlify regelt Let's Encrypt automatisch (5–30 min na DNS).
   Zet "Force HTTPS" aan.
4. **Primair domein** kiezen (met of zonder `www`); de ander redirect.
5. **Supabase → Authentication → URL Configuration**: *Site URL* = je nieuwe
   domein; voeg `https://jouwdomein/*` toe aan *Redirect URLs*. Anders
   breken magic links en wachtwoord-resets.
6. **Resend** (fase 2) gebruikt hetzelfde domein voor afzender.
7. **In de repo**: vul het domein in bij `privacy.html`, `terms.html`,
   `landing.html` (footer) — zoek op `[app URL]` en de gele velden.
8. Test: openen zonder login → landingspagina; `?start=1` → inloggen; een
   share-link `?view=…` van een oude productie werkt nog.

Het oude `*.netlify.app`-adres blijft werken en verwijst door — bestaande
share-links breken niet.

## Fase 2 · Betrouwbare e-mail (1 uur)

Zonder eigen SMTP loop je tegen de rate-limit van Supabase aan en komt mail
van `noreply@mail.app.supabase.io`. Volg `BILLING.md` §1 (Resend): domein
verifiëren via DNS, API-key, Supabase → Authentication → Emails → Custom SMTP
(`smtp.resend.com`, poort 465, user `resend`, wachtwoord = API-key).
Pas ook de onderwerpregels van de templates aan. Test met een wegwerpadres.

## Fase 3 · Juridisch (1 avond)

1. `privacy.html`: alle gele `[…]`-velden invullen (bedrijfsnaam, adres,
   contact). Sub-verwerkers staan er al in (Supabase EU, Netlify, straks MoR).
2. `terms.html`: idem, plus prijs en welke MoR. De verwerkersovereenkomst
   (art. 28 AVG) zit als paragraaf 8 in de voorwaarden — voldoende voor kleine
   productiehuizen; grote studio's vragen soms een los document, dan knip je
   die paragraaf eruit.
3. **Verwerkingsregister** (AVG-verplichting, intern document, 1 A4): welke
   data (e-mail, profiel, producties), doel, bewaartermijn (tot verwijdering
   account), verwerkers (Supabase, Netlify, Resend, MoR). Geen publicatie
   nodig; wel bij de hand houden.
4. Publiceer beide pagina's (staan al naast `index.html`) — de MoR vraagt om
   de URL's bij aanmelding.

## Fase 4 · Merchant of Record en prijs (1 avond + wachttijd)

Kies **Paddle** (in-app overlay-checkout, robuust, meer verificatie) of
**Lemon Squeezy** (kwartier opgezet, checkout in nieuw tabblad). De app
ondersteunt beide; kosten zijn gelijk (5 % + €0,50).

1. Account aanmaken **in sandbox/test-mode**. Bedrijfsverificatie (KvK,
   ID, bankrekening, URL's van voorwaarden + privacy) duurt bij Paddle 1–3
   werkdagen.
2. Product **"FLOOR Studio Pro"** met twee prijzen: €9/maand en €90/jaar.
   Btw-categorie "standard digital goods". Prijzen inclusief btw tonen
   (MoR doet dat automatisch per land).
3. **Webhook** aanmaken, URL:
   `https://jcasjylzosgtitaxbrjo.supabase.co/functions/v1/billing-webhook`,
   events: alle `subscription.*` (Paddle) of `subscription_*` (LS).
   Secret kopiëren → Supabase → Edge Functions → Secrets:
   `PADDLE_WEBHOOK_SECRET` of `LS_WEBHOOK_SECRET`.
4. `config.js` → `billing`-blok invullen (provider, token/priceId óf
   checkoutUrl, `environment:'sandbox'`). Deploy.
5. **Testen** met testkaart `4242 4242 4242 4242`: Account-paneel → Upgrade →
   betalen → binnen ~5 s "PRO plan ✓". Daarna: opzeggen in het
   klantportaal → app toont "Cancelled — works until …". Controleer in
   Supabase → Edge Functions → Logs dat elke call `ok` geeft.
6. **Live**: herhaal 2–4 in de live-omgeving, `environment:'production'`.

## Fase 5 · Lancering (1 avond)

1. Netlify: laatste zip deployen met ingevuld `config.js`.
2. Zelf één echte betaling doen en meteen terugboeken (test van de hele
   keten inclusief factuur-mail van de MoR).
3. Free-plan check: nieuw account → tweede productie aanmaken → moet de
   upgrade-vraag geven; share-link en export moeten gewoon werken.
4. Aankondigen: eerst 10–20 bekende DoP's/regisseurs persoonlijk (met een
   jaar Pro cadeau voor feedback), dan pas breed (Newsshooter-achtige
   sites, filmschool-alumni, Facebook-groepen voor crew).

## Fase 6 · Draaiend houden (doorlopend, ~1 uur/week)

- **Back-ups**: Supabase Free heeft geen point-in-time recovery. Zet een
  wekelijkse export aan (Supabase → Database → Backups, of upgrade naar Pro
  €25/mnd zodra er betalende klanten zijn — dan heb je 7 dagen PITR).
- **Monitoring**: Netlify + Supabase sturen mail bij storing; zet
  UptimeRobot (gratis) op je domein.
- **Support**: reageer binnen een werkdag; hou een lijstje veelgestelde
  vragen bij voor een FAQ op de landingspagina.
- **Facturatie aan de MoR**: maandelijks één factuur aan Paddle/LS voor het
  uitbetaalde bedrag (btw verlegd) — je boekhouder weet hoe.
- **Kosten**: Netlify gratis, Supabase €0→€25, Resend €0, domein ~€15/jaar.
  Break-even bij ~3 betalende gebruikers.

## Later (pas als het loopt)

- Supported self-host voor studio's (€149–249/jaar): factuur + setup-call.
- Studio-plan (€29/mnd, meerdere leden) als eerste team erom vraagt.
- iPad-spinoff (zie eerder plan: lite-mode → touch-UI → App Store).
