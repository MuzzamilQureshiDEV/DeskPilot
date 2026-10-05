import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { planForPrice } from "@/lib/billing/plans";
import type { Database } from "@/types/database";

// Stripe webhook → shop billing state (CLAUDE.md §11, rule 5). Runs with the
// service role after signature verification; every write filters by shop id.
// State-based: we re-fetch the subscription from Stripe, so out-of-order or
// repeated events always converge on Stripe's current truth.

type Db = SupabaseClient<Database>;

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
] as const satisfies readonly Stripe.Event.Type[];

export type WebhookDeps = { retrieveSubscription: (id: string) => Promise<Stripe.Subscription> };

export type WebhookResult =
  | { status: "processed"; shopId: string }
  | { status: "duplicate" }
  | { status: "ignored"; reason: "unhandled_type" | "no_subscription" | "unknown_shop" | "stale_subscription" };

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));
const iso = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toISOString() : null);

/** Which subscription (and which shop hint) an event is about. */
function subjectOf(event: Stripe.Event): { subscriptionId: string | null; shopHint: string | null } {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      return { subscriptionId: s.mode === "subscription" ? idOf(s.subscription) : null, shopHint: s.client_reference_id };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return { subscriptionId: event.data.object.id, shopHint: null };
    case "invoice.payment_failed":
      return { subscriptionId: idOf(event.data.object.parent?.subscription_details?.subscription), shopHint: null };
    default:
      return { subscriptionId: null, shopHint: null };
  }
}

async function findShop(db: Db, customerId: string, hints: (string | null | undefined)[]) {
  for (const hint of hints) {
    if (!hint || !/^[0-9a-f-]{36}$/i.test(hint)) continue;
    const { data } = await db.from("shops").select("id, stripe_customer_id, stripe_subscription_id").eq("id", hint).maybeSingle();
    // The hint only counts if the shop isn't linked to a different Stripe customer.
    if (data && (!data.stripe_customer_id || data.stripe_customer_id === customerId)) return data;
  }
  const { data } = await db
    .from("shops")
    .select("id, stripe_customer_id, stripe_subscription_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data;
}

async function apply(db: Db, event: Stripe.Event, deps: WebhookDeps): Promise<WebhookResult> {
  if (!(HANDLED_EVENTS as readonly string[]).includes(event.type)) return { status: "ignored", reason: "unhandled_type" };
  const { subscriptionId, shopHint } = subjectOf(event);
  if (!subscriptionId) return { status: "ignored", reason: "no_subscription" };

  const sub = await deps.retrieveSubscription(subscriptionId);
  const customerId = idOf(sub.customer);
  if (!customerId) return { status: "ignored", reason: "no_subscription" };

  const shop = await findShop(db, customerId, [sub.metadata?.shop_id, shopHint]);
  if (!shop) return { status: "ignored", reason: "unknown_shop" };

  const ended = sub.status === "canceled" || sub.status === "incomplete_expired";
  // An old subscription ending must not cancel the shop's current one.
  if (ended && shop.stripe_subscription_id && shop.stripe_subscription_id !== sub.id) {
    return { status: "ignored", reason: "stale_subscription" };
  }

  const item = sub.items.data[0];
  const plan = planForPrice(item?.price.lookup_key);
  const { error } = await db
    .from("shops")
    .update({
      ...(plan ? { plan } : {}),
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      subscription_status: sub.status,
      current_period_start: iso(item?.current_period_start),
      current_period_end: iso(item?.current_period_end),
      cancel_at_period_end: sub.cancel_at_period_end || (!ended && sub.cancel_at !== null),
    })
    .eq("id", shop.id);
  if (error) throw new Error("Could not update shop billing");
  return { status: "processed", shopId: shop.id };
}

/** Process a verified Stripe event once. Throws on failure so Stripe retries. */
export async function handleStripeEvent(db: Db, event: Stripe.Event, deps: WebhookDeps): Promise<WebhookResult> {
  const { error: claimError } = await db.from("stripe_events").insert({ id: event.id, type: event.type });
  if (claimError) {
    if (claimError.code === "23505") return { status: "duplicate" };
    throw new Error("Could not record Stripe event");
  }
  try {
    return await apply(db, event, deps);
  } catch (err) {
    // Release the claim so Stripe's retry processes it again.
    await db.from("stripe_events").delete().eq("id", event.id);
    throw err;
  }
}
