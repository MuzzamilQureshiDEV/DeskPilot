import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import type Stripe from "stripe";

import { PRICE_LOOKUP_KEYS, SELF_SERVE_PLANS, type SelfServePlan } from "@/lib/billing/plans";
import { stripeClient } from "@/lib/stripe/client";
import type { Database } from "@/types/database";

// Checkout + Customer Portal. Runs in the signed-in owner's context with the
// RLS client; the plan itself only changes via the verified webhook.

type Db = SupabaseClient<Database>;

/** Statuses where the shop already has a live subscription (change it in the portal, don't buy twice). */
export const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export type PlanPrice = { plan: SelfServePlan; priceId: string; amount: number; currency: string; interval: string };

/** Current prices from Stripe by lookup key (never hardcoded). Empty if billing isn't set up. */
export const loadPrices = cache(async (): Promise<PlanPrice[]> => {
  const stripe = stripeClient();
  if (!stripe) return [];
  try {
    const { data } = await stripe.prices.list({ lookup_keys: Object.values(PRICE_LOOKUP_KEYS), active: true, limit: 10 });
    return SELF_SERVE_PLANS.flatMap((plan) => {
      const p = data.find((x) => x.lookup_key === PRICE_LOOKUP_KEYS[plan]);
      return p && p.unit_amount !== null
        ? [{ plan, priceId: p.id, amount: p.unit_amount, currency: p.currency, interval: p.recurring?.interval ?? "month" }]
        : [];
    });
  } catch {
    console.error("stripe: could not load prices");
    return [];
  }
});

/** The shop's Stripe customer id, creating and linking one on first use. */
async function ensureCustomer(
  stripe: Stripe,
  db: Db,
  shop: { id: string; name: string },
  email: string,
): Promise<string> {
  const { data } = await db.from("shops").select("stripe_customer_id").eq("id", shop.id).single();
  if (data?.stripe_customer_id) return data.stripe_customer_id;

  // Idempotency key: a double click within 24h reuses the same customer.
  const customer = await stripe.customers.create(
    { email, name: shop.name, metadata: { shop_id: shop.id } },
    { idempotencyKey: `deskpilot-customer-${shop.id}` },
  );
  const { error } = await db.rpc("link_stripe_customer", { p_shop_id: shop.id, p_customer_id: customer.id });
  if (error) {
    const { data: again } = await db.from("shops").select("stripe_customer_id").eq("id", shop.id).single();
    if (again?.stripe_customer_id) return again.stripe_customer_id;
    throw new Error("Could not link billing account");
  }
  return customer.id;
}

export async function createCheckoutUrl(
  db: Db,
  shop: { id: string; name: string },
  email: string,
  plan: SelfServePlan,
  appUrl: string,
): Promise<string> {
  const stripe = stripeClient();
  if (!stripe) throw new Error("Billing isn't set up yet.");
  const price = (await loadPrices()).find((p) => p.plan === plan);
  if (!price) throw new Error("This plan isn't available right now.");

  const customer = await ensureCustomer(stripe, db, shop, email);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: shop.id,
    line_items: [{ price: price.priceId, quantity: 1 }],
    subscription_data: { metadata: { shop_id: shop.id } },
    allow_promotion_codes: true,
    success_url: `${appUrl}/billing?checkout=success`,
    cancel_url: `${appUrl}/billing?checkout=cancel`,
  });
  if (!session.url) throw new Error("Couldn't start checkout.");
  return session.url;
}

/** Our Customer Portal configuration (created by npm run stripe:setup); falls back to Stripe's default. */
const portalConfiguration = cache(async (stripe: Stripe): Promise<string | undefined> => {
  const { data } = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  return data.find((c) => c.metadata?.app === "deskpilot")?.id;
});

export async function createPortalUrl(db: Db, shopId: string, appUrl: string): Promise<string> {
  const stripe = stripeClient();
  if (!stripe) throw new Error("Billing isn't set up yet.");
  const { data } = await db.from("shops").select("stripe_customer_id").eq("id", shopId).single();
  if (!data?.stripe_customer_id) throw new Error("No billing account yet. Choose a plan first.");
  const session = await stripe.billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: `${appUrl}/billing`,
    configuration: await portalConfiguration(stripe),
  });
  return session.url;
}
