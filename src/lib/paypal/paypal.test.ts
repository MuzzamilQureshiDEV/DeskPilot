import { describe, expect, it } from "vitest";

import { aiAccess } from "@/lib/billing/plans";
import { billingSummary } from "@/lib/billing/status";
import { planFromPayPal, statusFromPayPal, subscriptionIdOf } from "@/lib/paypal/mapping";

const NOW = new Date("2026-10-12T12:00:00Z");
const plans = { starter: "P-STARTER", growth: "P-GROWTH" };

describe("PayPal mapping", () => {
  it("maps PayPal statuses to ours", () => {
    expect(statusFromPayPal("ACTIVE")).toBe("active");
    expect(statusFromPayPal("SUSPENDED")).toBe("past_due");
    expect(statusFromPayPal("CANCELLED")).toBe("canceled");
    expect(statusFromPayPal("EXPIRED")).toBe("canceled");
    expect(statusFromPayPal("APPROVAL_PENDING")).toBe("incomplete");
  });

  it("maps plan ids and ignores unknown plans", () => {
    expect(planFromPayPal("P-GROWTH", plans)).toBe("growth");
    expect(planFromPayPal("P-STARTER", plans)).toBe("starter");
    expect(planFromPayPal("P-OTHER", plans)).toBeNull();
  });

  it("finds the subscription an event is about", () => {
    expect(subscriptionIdOf({ event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: { id: "I-1" } })).toBe("I-1");
    expect(subscriptionIdOf({ event_type: "PAYMENT.SALE.COMPLETED", resource: { id: "SALE-9", billing_agreement_id: "I-1" } })).toBe("I-1");
    expect(subscriptionIdOf({ event_type: "PAYMENT.SALE.COMPLETED", resource: { id: "SALE-9" } })).toBeNull();
  });
});

describe("cancelled but paid", () => {
  const cancelled = (end: string) => ({ plan: "growth", trialEndsAt: null, subscriptionStatus: "canceled", currentPeriodEnd: end });

  it("keeps the AI on until the paid period ends, then stops it", () => {
    expect(aiAccess(cancelled("2026-10-30T00:00:00Z"), 0, NOW).allowed).toBe(true);
    expect(aiAccess(cancelled("2026-10-01T00:00:00Z"), 0, NOW)).toEqual({ allowed: false, reason: "subscription_inactive" });
    expect(aiAccess({ plan: "growth", trialEndsAt: null, subscriptionStatus: "canceled" }, 0, NOW).allowed).toBe(false);
  });

  it("says when a cancelled plan ends", () => {
    expect(billingSummary(cancelled("2026-10-30T00:00:00Z"), NOW)).toMatchObject({ label: "Cancelling", detail: expect.stringContaining("October 30, 2026") });
    expect(billingSummary(cancelled("2026-10-01T00:00:00Z"), NOW).label).toBe("Cancelled");
  });
});
