// Plan limits (CLAUDE.md §11). Prices live in Stripe (found by lookup key), not here.

export const PLAN_TIERS = ["trial", "starter", "growth", "scale"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

type PlanLimits = {
  /** AI replies per billing period; null means no limit (scale is "custom"). */
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

/** Plans merchants can buy themselves (scale is arranged by hand). */
export const SELF_SERVE_PLANS = ["starter", "growth"] as const;
export type SelfServePlan = (typeof SELF_SERVE_PLANS)[number];

/** Stripe price lookup keys (set by `npm run stripe:setup`). */
export const PRICE_LOOKUP_KEYS: Record<SelfServePlan, string> = {
  starter: "deskpilot_starter_monthly",
  growth: "deskpilot_growth_monthly",
};

export function planForPrice(lookupKey: string | null | undefined): SelfServePlan | null {
  return SELF_SERVE_PLANS.find((p) => PRICE_LOOKUP_KEYS[p] === lookupKey) ?? null;
}

/** Stripe statuses where a paid plan no longer gets AI replies. past_due keeps working while Stripe retries. */
const INACTIVE_STATUSES = new Set(["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]);

export type BillingState = {
  plan: string;
  trialEndsAt: string | null;
  subscriptionStatus?: string | null;
  currentPeriodStart?: string | null;
};

const isPaid = (plan: PlanTier) => plan === "starter" || plan === "growth";

/**
 * Start of the current usage period: the Stripe billing period for paid plans,
 * otherwise the UTC calendar month.
 */
export function usagePeriodStart(now: Date, shop?: BillingState): Date {
  if (shop && isPaid(planOf(shop.plan)) && shop.currentPeriodStart) {
    const start = new Date(shop.currentPeriodStart);
    if (start <= now) return start;
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export type AiAccess =
  | { allowed: true; remaining: number | null }
  | { allowed: false; reason: "usage_limit" | "trial_ended" | "subscription_inactive" };

/** Whether the AI may process another message (rule 7: stored but not processed when over). */
export function aiAccess(shop: BillingState, usedThisPeriod: number, now: Date): AiAccess {
  const plan = planOf(shop.plan);
  if (plan === "trial" && shop.trialEndsAt && new Date(shop.trialEndsAt) <= now) {
    return { allowed: false, reason: "trial_ended" };
  }
  if (isPaid(plan) && shop.subscriptionStatus && INACTIVE_STATUSES.has(shop.subscriptionStatus)) {
    return { allowed: false, reason: "subscription_inactive" };
  }
  const limit = PLANS[plan].aiRepliesPerMonth;
  if (limit === null) return { allowed: true, remaining: null };
  if (usedThisPeriod >= limit) return { allowed: false, reason: "usage_limit" };
  return { allowed: true, remaining: limit - usedThisPeriod };
}
