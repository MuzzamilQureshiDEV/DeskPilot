import "server-only";

import { cache } from "react";

import type { SelfServePlan } from "@/lib/billing/plans";
import { paypalConfig, paypalFetch, type PayPalSubscription } from "@/lib/paypal/client";

// PayPal subscribe / switch / cancel, started by the signed-in owner. The shop's
// plan itself only changes when PayPal's verified webhook arrives.

export type PayPalPrice = { plan: SelfServePlan; amount: number; currency: string; interval: string };

type PlanDetails = {
  billing_cycles?: { tenure_type: string; frequency?: { interval_unit?: string }; pricing_scheme?: { fixed_price?: { value: string; currency_code: string } } }[];
};

/** Current prices from the PayPal plans (never hardcoded). Empty if PayPal isn't set up. */
export const loadPayPalPrices = cache(async (): Promise<PayPalPrice[]> => {
  const cfg = paypalConfig();
  if (!cfg) return [];
  try {
    const out: PayPalPrice[] = [];
    for (const plan of ["starter", "growth"] as const) {
      const p = await paypalFetch<PlanDetails>(cfg, `/v1/billing/plans/${cfg.plans[plan]}`);
      const cycle = p.billing_cycles?.find((c) => c.tenure_type === "REGULAR");
      const price = cycle?.pricing_scheme?.fixed_price;
      if (price) {
        out.push({
          plan,
          amount: Math.round(Number(price.value) * 100),
          currency: price.currency_code.toLowerCase(),
          interval: (cycle?.frequency?.interval_unit ?? "MONTH").toLowerCase(),
        });
      }
    }
    return out;
  } catch {
    console.error("paypal: could not load prices");
    return [];
  }
});

const approveLink = (sub: PayPalSubscription) => sub.links?.find((l) => l.rel === "approve")?.href ?? null;

function context(appUrl: string, brand: string) {
  return {
    brand_name: brand.slice(0, 127),
    shipping_preference: "NO_SHIPPING",
    user_action: "SUBSCRIBE_NOW",
    return_url: `${appUrl}/billing?paypal=success`,
    cancel_url: `${appUrl}/billing?paypal=cancel`,
  };
}

/** New subscription → PayPal approval page. */
export async function createPayPalSubscriptionUrl(shopId: string, email: string, plan: SelfServePlan, appUrl: string): Promise<string> {
  const cfg = paypalConfig();
  if (!cfg) throw new Error("PayPal isn't set up yet.");
  const sub = await paypalFetch<PayPalSubscription>(cfg, "/v1/billing/subscriptions", {
    method: "POST",
    // One pending subscription per shop + plan per 10 minutes (double clicks reuse it).
    requestId: `astadesk-${shopId}-${plan}-${Math.floor(Date.now() / 600_000)}`,
    body: { plan_id: cfg.plans[plan], custom_id: shopId, subscriber: { email_address: email }, application_context: context(appUrl, "AstaDesk") },
  });
  const url = approveLink(sub);
  if (!url) throw new Error("PayPal didn't return an approval link.");
  return url;
}

/** Switch plan on an existing subscription → PayPal re-approval page. */
export async function revisePayPalSubscriptionUrl(subscriptionId: string, plan: SelfServePlan, appUrl: string): Promise<string> {
  const cfg = paypalConfig();
  if (!cfg) throw new Error("PayPal isn't set up yet.");
  const res = await paypalFetch<{ links?: { href: string; rel: string }[] }>(cfg, `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/revise`, {
    method: "POST",
    body: { plan_id: cfg.plans[plan], application_context: context(appUrl, "AstaDesk") },
  });
  const url = res.links?.find((l) => l.rel === "approve")?.href;
  if (!url) throw new Error("PayPal didn't return an approval link.");
  return url;
}

/** Cancel (access stays until the paid period ends; the webhook updates the shop). */
export async function cancelPayPalSubscription(subscriptionId: string): Promise<void> {
  const cfg = paypalConfig();
  if (!cfg) throw new Error("PayPal isn't set up yet.");
  await paypalFetch(cfg, `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: "POST",
    body: { reason: "Cancelled by the store owner in AstaDesk" },
  });
}

export const paypalManageUrl = () =>
  paypalConfig()?.base.includes("sandbox") ? "https://www.sandbox.paypal.com/myaccount/autopay/" : "https://www.paypal.com/myaccount/autopay/";
