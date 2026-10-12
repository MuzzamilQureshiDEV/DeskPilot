import { describe, expect, it } from "vitest";

import { aiAccess, PLANS, planForPrice, planOf, usagePeriodStart } from "@/lib/billing/plans";
import { billingSummary, formatPrice } from "@/lib/billing/status";

const NOW = new Date("2026-10-04T12:00:00Z");
const future = "2026-10-16T00:00:00Z";

describe("plans", () => {
  it("match the spec's limits", () => {
    // "trial" = no plan yet: no AI replies for real customers.
    expect(PLANS.trial).toEqual({ aiRepliesPerMonth: 0, autopilot: false });
    expect(PLANS.starter).toEqual({ aiRepliesPerMonth: 100, autopilot: false });
    expect(PLANS.growth).toEqual({ aiRepliesPerMonth: 250, autopilot: true });
    expect(PLANS.scale).toEqual({ aiRepliesPerMonth: 1000, autopilot: true });
    expect(planOf("enterprise")).toBe("trial");
  });

  it("counts usage from the start of the UTC month", () => {
    expect(usagePeriodStart(NOW).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("allows AI until the plan limit, then stops", () => {
    expect(aiAccess({ plan: "starter", trialEndsAt: null }, 99, NOW)).toEqual({ allowed: true, remaining: 1 });
    expect(aiAccess({ plan: "starter", trialEndsAt: null }, 100, NOW)).toEqual({ allowed: false, reason: "usage_limit" });
    expect(aiAccess({ plan: "growth", trialEndsAt: null }, 249, NOW).allowed).toBe(true);
    expect(aiAccess({ plan: "scale", trialEndsAt: null }, 999, NOW)).toEqual({ allowed: true, remaining: 1 });
    expect(aiAccess({ plan: "scale", trialEndsAt: null }, 1000, NOW)).toEqual({ allowed: false, reason: "usage_limit" });
  });

  it("no plan means no AI replies for real customers (there is no free trial)", () => {
    expect(aiAccess({ plan: "trial", trialEndsAt: null }, 0, NOW)).toEqual({ allowed: false, reason: "no_plan" });
    expect(aiAccess({ plan: "trial", trialEndsAt: future }, 0, NOW)).toEqual({ allowed: false, reason: "no_plan" });
  });
});

describe("Stripe billing state", () => {
  const paid = (subscriptionStatus: string) => ({ plan: "growth", trialEndsAt: null, subscriptionStatus });

  it("maps Stripe price lookup keys to plans", () => {
    expect(planForPrice("deskpilot_starter_monthly")).toBe("starter");
    expect(planForPrice("deskpilot_growth_monthly")).toBe("growth");
    expect(planForPrice("deskpilot_scale_monthly")).toBe("scale");
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
    // Scale is a normal subscription now; one set by hand (no subscription status) stays on.
    expect(aiAccess({ plan: "scale", trialEndsAt: null, subscriptionStatus: "canceled" }, 0, NOW).allowed).toBe(false);
    expect(aiAccess({ plan: "scale", trialEndsAt: null }, 0, NOW).allowed).toBe(true);
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
    expect(billingSummary({ plan: "trial", trialEndsAt: null }, NOW)).toMatchObject({ label: "No plan yet", tone: "warn" });
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
    expect(formatPrice(5200, "usd")).toBe("$52");
    expect(formatPrice(23000, "usd")).toBe("$230");
    expect(formatPrice(7950, "usd")).toBe("$79.50");
  });
});

function paidState(subscriptionStatus: string) {
  return { plan: "starter", trialEndsAt: null, subscriptionStatus };
}
