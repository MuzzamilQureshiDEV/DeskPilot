import type { SupabaseClient } from "@supabase/supabase-js";

import type { PayPalSubscription } from "@/lib/paypal/client";
import { PAYPAL_EVENTS, planFromPayPal, statusFromPayPal, subscriptionIdOf } from "@/lib/paypal/mapping";
import type { Database } from "@/types/database";

// PayPal webhook → shop billing state. Runs with the service role after the
// signature was verified with PayPal. State-based: the subscription is
// re-fetched from PayPal, so repeated or out-of-order events converge.

type Db = SupabaseClient<Database>;

export type PayPalEvent = { id: string; event_type: string; resource?: Record<string, unknown> };
export type PayPalWebhookDeps = {
  getSubscription: (id: string) => Promise<PayPalSubscription>;
  plans: { starter: string; growth: string; scale?: string };
};
export type PayPalWebhookResult =
  | { status: "processed"; shopId: string }
  | { status: "duplicate" }
  | { status: "ignored"; reason: "unhandled_type" | "no_subscription" | "unknown_shop" | "stale_subscription" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findShop(db: Db, sub: PayPalSubscription) {
  const cols = "id, paypal_subscription_id, subscription_status, current_period_end";
  const { data: bySub } = await db.from("shops").select(cols).eq("paypal_subscription_id", sub.id).maybeSingle();
  if (bySub) return bySub;
  // A new subscription: trust custom_id (set by our server) only for a shop that
  // has no other live PayPal subscription.
  if (sub.custom_id && UUID.test(sub.custom_id)) {
    const { data } = await db.from("shops").select(cols).eq("id", sub.custom_id).maybeSingle();
    if (data) return data;
  }
  return null;
}

async function apply(db: Db, event: PayPalEvent, deps: PayPalWebhookDeps): Promise<PayPalWebhookResult> {
  if (!(PAYPAL_EVENTS as readonly string[]).includes(event.event_type)) return { status: "ignored", reason: "unhandled_type" };
  const subId = subscriptionIdOf(event);
  if (!subId) return { status: "ignored", reason: "no_subscription" };

  const sub = await deps.getSubscription(subId);
  const shop = await findShop(db, sub);
  if (!shop) return { status: "ignored", reason: "unknown_shop" };

  const status = statusFromPayPal(sub.status);
  const ended = status === "canceled";
  // A different, older subscription ending must not touch the shop's current one;
  // a pending one must not replace a live one.
  if (shop.paypal_subscription_id && shop.paypal_subscription_id !== sub.id) {
    const currentLive = shop.subscription_status === "active" || shop.subscription_status === "past_due";
    if (ended || (status === "incomplete" && currentLive)) return { status: "ignored", reason: "stale_subscription" };
  }

  const plan = planFromPayPal(sub.plan_id, deps.plans);
  const start = sub.billing_info?.last_payment?.time ?? sub.start_time ?? null;
  const next = sub.billing_info?.next_billing_time ?? null;
  const { error } = await db
    .from("shops")
    .update({
      ...(plan ? { plan } : {}),
      billing_provider: "paypal",
      paypal_subscription_id: sub.id,
      subscription_status: status,
      ...(start ? { current_period_start: start } : {}),
      // A cancelled subscription has no next billing date: keep the paid-until date.
      ...(next ? { current_period_end: next } : {}),
      cancel_at_period_end: ended,
    })
    .eq("id", shop.id);
  if (error) throw new Error("Could not update shop billing");
  return { status: "processed", shopId: shop.id };
}

/** Process a verified PayPal event once. Throws on failure so PayPal retries. */
export async function handlePayPalEvent(db: Db, event: PayPalEvent, deps: PayPalWebhookDeps): Promise<PayPalWebhookResult> {
  const { error: claimError } = await db.from("payment_events").insert({ provider: "paypal", event_id: event.id, type: event.event_type });
  if (claimError) {
    if (claimError.code === "23505") return { status: "duplicate" };
    throw new Error("Could not record PayPal event");
  }
  try {
    return await apply(db, event, deps);
  } catch (err) {
    await db.from("payment_events").delete().eq("provider", "paypal").eq("event_id", event.id);
    throw err;
  }
}
