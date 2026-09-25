// Floorboard — billing webhook (Paddle Billing OR Lemon Squeezy)
// Payment providers call this URL; it verifies the provider's HMAC signature
// (that is the authentication — no JWT, providers don't send one) and mirrors
// the subscription into public.subscriptions with the service role.
// The user is identified by custom_data.user_id, which the app passes at checkout.
// The PLAN is decided here from the price / variant that was actually bought —
// never from client-supplied custom data.
//
// Deploy:  supabase functions deploy billing-webhook --no-verify-jwt
// Secrets (Edge Functions → Secrets):
//   PADDLE_WEBHOOK_SECRET and/or LS_WEBHOOK_SECRET
//   PRO_PRICE_IDS     comma-separated Paddle price ids / Lemon Squeezy variant ids that mean "pro"
//   STUDIO_PRICE_IDS  (optional) ids that mean "studio"
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are provided by the runtime.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const enc = new TextEncoder();
async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = (name: string) => (Deno.env.get(name) || "").split(",").map(s => s.trim()).filter(Boolean);
function planFor(priceIds: string[]): string | null {
  const pro = ids("PRO_PRICE_IDS"), studio = ids("STUDIO_PRICE_IDS");
  if (priceIds.some(p => studio.includes(p))) return "studio";
  if (priceIds.some(p => pro.includes(p))) return "pro";
  // no allow-list configured at all → everything sold is "pro" (first setups); once
  // PRO_PRICE_IDS is set, unknown products are ignored
  return pro.length || studio.length ? null : "pro";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("billing-webhook alive", { status: 200 });
  const raw = await req.text();
  const paddleSig = req.headers.get("paddle-signature");
  const lsSig = req.headers.get("x-signature");
  // deno-lint-ignore no-explicit-any
  let rec: any = null;
  let eventAt = new Date();
  try {
    if (paddleSig) {
      const secret = Deno.env.get("PADDLE_WEBHOOK_SECRET") || "";
      if (!secret) return new Response("not configured", { status: 401 });
      const parts: Record<string, string> = Object.fromEntries(
        paddleSig.split(";").map(p => p.split("=") as [string, string]));
      const ts = Number(parts.ts || 0);
      if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) return new Response("stale signature", { status: 401 });
      const expect = await hmacHex(secret, `${parts.ts}:${raw}`);
      if (!safeEqual(expect, parts.h1 || "")) return new Response("bad signature", { status: 401 });
      const ev = JSON.parse(raw);
      const d = ev.data || {};
      if (!/^subscription\./.test(ev.event_type || "")) return new Response("ignored", { status: 200 });
      if (ev.occurred_at) eventAt = new Date(ev.occurred_at);
      const cd = d.custom_data || {};
      const bought = (d.items || []).map((it: any) => it?.price?.id).filter(Boolean);
      const plan = planFor(bought);
      if (!plan) return new Response("unknown product — ignored", { status: 200 });
      rec = {
        user_id: cd.user_id, plan, status: d.status || "active",
        provider: "paddle", customer_id: d.customer_id || "", subscription_id: d.id || "",
        current_period_end: d.current_billing_period?.ends_at || d.next_billed_at || null,
        update_url: d.management_urls?.update_payment_method || "",
        cancel_url: d.management_urls?.cancel || "",
      };
    } else if (lsSig) {
      const secret = Deno.env.get("LS_WEBHOOK_SECRET") || "";
      if (!secret) return new Response("not configured", { status: 401 });
      const expect = await hmacHex(secret, raw);
      if (!safeEqual(expect, lsSig)) return new Response("bad signature", { status: 401 });
      const ev = JSON.parse(raw);
      const name: string = ev.meta?.event_name || "";
      const a = ev.data?.attributes || {};
      if (!name.startsWith("subscription_")) return new Response("ignored", { status: 200 });
      if (a.updated_at) eventAt = new Date(a.updated_at);
      const cd = ev.meta?.custom_data || {};
      const plan = planFor([String(a.variant_id || ""), String(a.product_id || "")]);
      if (!plan) return new Response("unknown product — ignored", { status: 200 });
      rec = {
        user_id: cd.user_id, plan, status: a.status || "active",
        provider: "lemonsqueezy", customer_id: String(a.customer_id || ""),
        subscription_id: String(ev.data?.id || ""),
        current_period_end: a.renews_at || a.ends_at || null,
        update_url: a.urls?.update_payment_method || "",
        cancel_url: a.urls?.customer_portal || "",
      };
    } else {
      return new Response("no signature header", { status: 400 });
    }
  } catch (_e) {
    return new Response("bad payload", { status: 400 });
  }
  // no (valid) user id = a checkout that didn't come from the app; acknowledge so the
  // provider stops retrying, but store nothing
  if (!rec.user_id || !UUID.test(String(rec.user_id))) return new Response("no user_id in custom data — ignored", { status: 200 });
  const st = String(rec.status).toLowerCase();
  rec.status = ["active", "trialing", "on_trial"].includes(st) ? "active"
    : st === "past_due" ? "past_due"
    : ["canceled", "cancelled", "expired", "paused", "unpaid"].includes(st) ? "canceled" : st;
  if (isNaN(eventAt.getTime())) eventAt = new Date();
  rec.updated_at = eventAt.toISOString();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // out-of-order delivery: an older event must not overwrite a newer state
  const { data: cur } = await admin.from("subscriptions").select("updated_at, provider").eq("user_id", rec.user_id).maybeSingle();
  if (cur && cur.provider === rec.provider && cur.updated_at && new Date(cur.updated_at) > eventAt)
    return new Response("older than stored state — ignored", { status: 200 });
  const { error } = await admin.from("subscriptions").upsert(rec);
  if (error) { console.error("subscriptions upsert failed", error.message); return new Response("db error", { status: 500 }); }
  return new Response("ok", { status: 200 });
});
