// ============================================================================
// FLOOR Studio — deployment configuration
//
// CLOUD MODE (login, sync across devices, share links, co-editing):
//   1. Create a free project at https://supabase.com
//   2. Run setup/schema.sql once in its SQL Editor
//   3. Paste your Project URL + publishable (anon) key below
//      (safe to be public — data is protected by row-level security)
//
// LOCAL MODE (no accounts, no server):
//   Leave both values empty. Projects save in this browser (IndexedDB);
//   back up / move them with Export .floorproj. Sharing UI hides itself.
// ============================================================================
window.FLOOR_CONFIG = {
  supabaseUrl: 'https://jcasjylzosgtitaxbrjo.supabase.co',
  supabaseKey: 'sb_publishable_Hon-GqliiypoM52l6uuUaA_w4UFkfdB',

  // BILLING (hosted edition only — see BILLING.md). Leave provider '' to run
  // without plans: every feature unlocked (self-host, local, development).
  billing: {
    provider: '',              // 'paddle' | 'lemonsqueezy' | ''
    priceLabel: '€9 / month',  // shown on the Upgrade button
    plan: 'pro',               // plan name the webhook stores for this checkout
    // Paddle Billing
    token: '',                 // client-side token (Paddle → Developer tools → Authentication)
    priceId: '',               // pri_… of the Pro price
    environment: 'production', // 'sandbox' while testing
    // Lemon Squeezy
    checkoutUrl: '',           // https://YOURSTORE.lemonsqueezy.com/buy/…
    portalUrl: '',             // optional customer-portal link for "Manage subscription"
  },
};
