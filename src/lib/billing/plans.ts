// Plan limits (CLAUDE.md §11). Prices live in Stripe, not here (task 3.4).

export const PLAN_TIERS = ["trial", "starter", "growth", "scale"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

type PlanLimits = {
  /** AI replies per month; null means no limit (scale is "custom", unlimited until 3.4). */
  aiRepliesPerMonth: number | null;
  autopilot: boolean;
};

export const PLANS: Record<PlanTier, PlanLimits> = {
  trial: { aiRepliesPerMonth: 25, autopilot: false },
  starter: { aiRepliesPerMonth: 100, autopilot: false },
  growth: { aiRepliesPerMonth: 250, autopilot: true },
  scale: { aiRepliesPerMonth: null, autopilot: true },
};

export function planOf(value: string): PlanTier {
  return PLAN_TIERS.find((p) => p === value) ?? "trial";
}

/** Start of the current usage period (UTC calendar month until Stripe cycles in 3.4). */
export function usagePeriodStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export type AiAccess =
  | { allowed: true; remaining: number | null }
  | { allowed: false; reason: "usage_limit" | "trial_ended" };

/** Whether the AI may process another message (rule 7: stored but not processed when over). */
export function aiAccess(
  shop: { plan: string; trialEndsAt: string | null },
  usedThisPeriod: number,
  now: Date,
): AiAccess {
  const plan = planOf(shop.plan);
  if (plan === "trial" && shop.trialEndsAt && new Date(shop.trialEndsAt) <= now) {
    return { allowed: false, reason: "trial_ended" };
  }
  const limit = PLANS[plan].aiRepliesPerMonth;
  if (limit === null) return { allowed: true, remaining: null };
  if (usedThisPeriod >= limit) return { allowed: false, reason: "usage_limit" };
  return { allowed: true, remaining: limit - usedThisPeriod };
}
