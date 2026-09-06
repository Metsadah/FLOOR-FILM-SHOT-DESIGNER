// FLOOR Studio — billing webhook (Paddle Billing OR Lemon Squeezy)
// Payment providers call this URL; it verifies the provider's HMAC signature
// (that is the authentication — no JWT, providers don't send one) and mirrors
// the subscription into public.subscriptions with the service role.
// The user is identified by custom_data.user_id, which the app passes at checkout.
//
// Deploy:  supabase functions deploy billing-webhook --no-verify-jwt
// Secrets (Edge Functions → Secrets): PADDLE_WEBHOOK_SECRET and/or LS_WEBHOOK_SECRET.
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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("billing-webhook alive", { status: 200 });
  const raw = await req.text();
  const paddleSig = req.headers.get("paddle-signature");
  const lsSig = req.headers.get("x-signature");
  // deno-lint-ignore no-explicit-any
  let rec: any = null;
  try {
    if (paddleSig) {
      const secret = Deno.env.get("PADDLE_WEBHOOK_SECRET") || "";
      if (!secret) return new Response("PADDLE_WEBHOOK_SECRET not set", { status: 401 });
      const parts: Record<string, string> = Object.fromEntries(
        paddleSig.split(";").map(p => p.split("=") as [string, string]));
      const expect = await hmacHex(secret, `${parts.ts}:${raw}`);
      if (!secret || !safeEqual(expect, parts.h1 || ""))
        return new Response("bad signature", { status: 401 });
      const ev = JSON.parse(raw);
      const d = ev.data || {};
      if (!/^subscription\./.test(ev.event_type || ""))
        return new Response("ignored", { status: 200 });
      const cd = d.custom_data || {};
      rec = {
        user_id: cd.user_id, plan: cd.plan || "pro", status: d.status || "active",
        provider: "paddle", customer_id: d.customer_id || "", subscription_id: d.id || "",
        current_period_end: d.current_billing_period?.ends_at || d.next_billed_at || null,
        update_url: d.management_urls?.update_payment_method || "",
        cancel_url: d.management_urls?.cancel || "",
      };
    } else if (lsSig) {
      const secret = Deno.env.get("LS_WEBHOOK_SECRET") || "";
      if (!secret) return new Response("LS_WEBHOOK_SECRET not set", { status: 401 });
      const expect = await hmacHex(secret, raw);
      if (!secret || !safeEqual(expect, lsSig))
        return new Response("bad signature", { status: 401 });
      const ev = JSON.parse(raw);
      const name: string = ev.meta?.event_name || "";
      const a = ev.data?.attributes || {};
      if (!name.startsWith("subscription_"))
        return new Response("ignored", { status: 200 });
      const cd = ev.meta?.custom_data || {};
      rec = {
        user_id: cd.user_id, plan: cd.plan || "pro", status: a.status || "active",
        provider: "lemonsqueezy", customer_id: String(a.customer_id || ""),
        subscription_id: String(ev.data?.id || ""),
        current_period_end: a.renews_at || a.ends_at || null,
        update_url: a.urls?.update_payment_method || "",
        cancel_url: a.urls?.customer_portal || "",
      };
    } else {
      return new Response("no signature header", { status: 400 });
    }
  } catch (e) {
    return new Response("bad payload: " + (e as Error).message, { status: 400 });
  }
  // no user id = a checkout that didn't come from the app; acknowledge so the
  // provider stops retrying, but store nothing
  if (!rec.user_id) return new Response("no user_id in custom data — ignored", { status: 200 });
  const st = String(rec.status).toLowerCase();
  rec.status = ["active", "trialing", "on_trial"].includes(st) ? "active"
    : st === "past_due" ? "past_due"
    : ["canceled", "cancelled", "expired", "paused", "unpaid"].includes(st) ? "canceled" : st;
  rec.updated_at = new Date().toISOString();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await admin.from("subscriptions").upsert(rec);
  if (error) return new Response("db error: " + error.message, { status: 500 });
  return new Response("ok", { status: 200 });
});
