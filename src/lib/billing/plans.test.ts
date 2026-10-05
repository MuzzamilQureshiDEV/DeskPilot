import { describe, expect, it } from "vitest";

import { aiAccess, PLANS, planForPrice, planOf, usagePeriodStart } from "@/lib/billing/plans";
import { billingSummary, formatPrice } from "@/lib/billing/status";

const NOW = new Date("2026-10-04T12:00:00Z");
const future = "2026-10-16T00:00:00Z";

describe("plans", () => {
  it("match the spec's limits", () => {
    expect(PLANS.trial).toEqual({ aiRepliesPerMonth: 25, autopilot: false });
    expect(PLANS.starter).toEqual({ aiRepliesPerMonth: 100, autopilot: false });
    expect(PLANS.growth).toEqual({ aiRepliesPerMonth: 250, autopilot: true });
    expect(PLANS.scale.autopilot).toBe(true);
    expect(planOf("enterprise")).toBe("trial");
  });

  it("counts usage from the start of the UTC month", () => {
    expect(usagePeriodStart(NOW).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("allows AI until the plan limit, then stops", () => {
    expect(aiAccess({ plan: "trial", trialEndsAt: future }, 24, NOW)).toEqual({ allowed: true, remaining: 1 });
    expect(aiAccess({ plan: "trial", trialEndsAt: future }, 25, NOW)).toEqual({ allowed: false, reason: "usage_limit" });
    expect(aiAccess({ plan: "growth", trialEndsAt: null }, 249, NOW).allowed).toBe(true);
    expect(aiAccess({ plan: "scale", trialEndsAt: null }, 1_000_000, NOW)).toEqual({ allowed: true, remaining: null });
  });

  it("stops AI when the trial has ended", () => {
    expect(aiAccess({ plan: "trial", trialEndsAt: "2026-10-01T00:00:00Z" }, 0, NOW)).toEqual({
      allowed: false,
      reason: "trial_ended",
    });
    // Paid plans aren't affected by an old trial date.
    expect(aiAccess({ plan: "starter", trialEndsAt: "2026-10-01T00:00:00Z" }, 0, NOW).allowed).toBe(true);
  });
});

describe("Stripe billing state", () => {
  const paid = (subscriptionStatus: string) => ({ plan: "growth", trialEndsAt: null, subscriptionStatus });

  it("maps Stripe price lookup keys to plans", () => {
    expect(planForPrice("deskpilot_starter_monthly")).toBe("starter");
    expect(planForPrice("deskpilot_growth_monthly")).toBe("growth");
    expect(planForPrice("something_else")).toBeNull();
    expect(planForPrice(null)).toBeNull();
  });

  it("keeps the AI on while a payment is retried, and stops it when the subscription ends", () => {
    expect(aiAccess(paid("active"), 0, NOW).allowed).toBe(true);
    expect(aiAccess(paid("trialing"), 0, NOW).allowed).toBe(true);
    expect(aiAccess(paid("past_due"), 0, NOW).allowed).toBe(true);
    for (const s of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]) {
      expect(aiAccess(paid(s), 0, NOW)).toEqual({ allowed: false, reason: "subscription_inactive" });
    }
    // Scale is arranged by hand, so a stray status doesn't switch it off.
    expect(aiAccess({ plan: "scale", trialEndsAt: null, subscriptionStatus: "canceled" }, 0, NOW).allowed).toBe(true);
  });

  it("counts paid usage from the Stripe billing period", () => {
    const start = "2026-09-20T08:00:00.000Z";
    expect(usagePeriodStart(NOW, { plan: "starter", trialEndsAt: null, currentPeriodStart: start }).toISOString()).toBe(start);
    // Trial (or a period in the future) falls back to the calendar month.
    expect(usagePeriodStart(NOW, { plan: "trial", trialEndsAt: future, currentPeriodStart: start }).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(usagePeriodStart(NOW, { plan: "growth", trialEndsAt: null, currentPeriodStart: "2026-11-01T00:00:00Z" }).toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    );
  });
});

describe("billing summary", () => {
  it("describes each state in plain words", () => {
    expect(billingSummary({ plan: "trial", trialEndsAt: "2026-10-14T12:00:00Z" }, NOW)).toMatchObject({ label: "Free trial", tone: "ok" });
    expect(billingSummary({ plan: "trial", trialEndsAt: "2026-10-06T12:00:00Z" }, NOW)).toMatchObject({ tone: "warn", detail: expect.stringContaining("2 days left") });
    expect(billingSummary({ plan: "trial", trialEndsAt: "2026-10-01T00:00:00Z" }, NOW).label).toBe("Trial ended");
    expect(
      billingSummary({ plan: "growth", trialEndsAt: null, subscriptionStatus: "active", currentPeriodEnd: "2026-11-04T00:00:00Z" }, NOW).detail,
    ).toBe("Renews on November 4, 2026.");
    expect(
      billingSummary(
        { plan: "growth", trialEndsAt: null, subscriptionStatus: "active", currentPeriodEnd: "2026-11-04T00:00:00Z", cancelAtPeriodEnd: true },
        NOW,
      ),
    ).toMatchObject({ label: "Cancelling", tone: "warn" });
    expect(billingSummary(paidState("past_due"), NOW)).toMatchObject({ label: "Payment failed", tone: "bad" });
    expect(billingSummary(paidState("canceled"), NOW).label).toBe("Cancelled");
  });

  it("formats Stripe amounts", () => {
    expect(formatPrice(2900, "usd")).toBe("$29");
    expect(formatPrice(7950, "usd")).toBe("$79.50");
  });
});

function paidState(subscriptionStatus: string) {
  return { plan: "starter", trialEndsAt: null, subscriptionStatus };
}
