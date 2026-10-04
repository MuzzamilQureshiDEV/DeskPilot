import { describe, expect, it } from "vitest";

import { aiAccess, PLANS, planOf, usagePeriodStart } from "@/lib/billing/plans";

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
