// PayPal → AstaDesk billing vocabulary (pure, tested).

import type { SelfServePlan } from "@/lib/billing/plans";

/** Our `subscription_status` values are shared with Stripe. */
export function statusFromPayPal(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "active";
    case "SUSPENDED":
      return "past_due"; // payments failing; PayPal retries, the AI stays on
    case "CANCELLED":
    case "EXPIRED":
      return "canceled";
    default:
      return "incomplete"; // APPROVAL_PENDING / APPROVED: not paid yet
  }
}

export function planFromPayPal(planId: string, plans: { starter: string; growth: string }): SelfServePlan | null {
  if (planId === plans.starter) return "starter";
  if (planId === plans.growth) return "growth";
  return null;
}

/** The subscription an event is about (subscription events carry it as the resource; payments as billing_agreement_id). */
export function subscriptionIdOf(event: { event_type?: string; resource?: Record<string, unknown> }): string | null {
  const r = event.resource ?? {};
  if (event.event_type?.startsWith("BILLING.SUBSCRIPTION.") && typeof r.id === "string") return r.id;
  if (typeof r.billing_agreement_id === "string") return r.billing_agreement_id;
  return null;
}

export const PAYPAL_EVENTS = [
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "BILLING.SUBSCRIPTION.RE-ACTIVATED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
  "PAYMENT.SALE.COMPLETED",
] as const;
