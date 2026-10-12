// How a shop's billing state reads on the Billing page (pure).

import { planOf, type BillingState } from "@/lib/billing/plans";

export type BillingSummary = {
  label: string;
  tone: "ok" | "warn" | "bad";
  detail: string;
};

const fmt = (iso: string) => new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));

export function billingSummary(
  shop: BillingState & { currentPeriodEnd?: string | null; cancelAtPeriodEnd?: boolean },
  now: Date,
): BillingSummary {
  const plan = planOf(shop.plan);
  if (plan === "trial") {
    return { label: "No plan yet", tone: "warn", detail: "Choose a plan so Ava can reply to your customers. Exploring and the sample store are free." };
  }

  switch (shop.subscriptionStatus) {
    case "active":
    case "trialing":
      return shop.cancelAtPeriodEnd && shop.currentPeriodEnd
        ? { label: "Cancelling", tone: "warn", detail: `Your plan ends on ${fmt(shop.currentPeriodEnd)}. Renew in Manage billing to keep it.` }
        : { label: "Active", tone: "ok", detail: shop.currentPeriodEnd ? `Renews on ${fmt(shop.currentPeriodEnd)}.` : "Your plan is active." };
    case "past_due":
      return { label: "Payment failed", tone: "bad", detail: "Update your card in Manage billing. Stripe will retry the payment." };
    case "canceled":
    case "incomplete_expired":
      return shop.currentPeriodEnd && new Date(shop.currentPeriodEnd) > now
        ? { label: "Cancelling", tone: "warn", detail: `Cancelled. Your plan keeps working until ${fmt(shop.currentPeriodEnd)}.` }
        : { label: "Cancelled", tone: "bad", detail: "Choose a plan to turn the AI back on." };
    case "unpaid":
    case "incomplete":
    case "paused":
      return { label: "Not active", tone: "bad", detail: "Finish the payment in Manage billing to turn the AI back on." };
    default:
      return { label: "Active", tone: "ok", detail: "Your plan is active." };
  }
}

export function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: amount % 100 === 0 ? 0 : 2 }).format(amount / 100);
}
