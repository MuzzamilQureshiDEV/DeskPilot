// Marketing copy for the plan cards (landing page + Billing). Lists only
// features AstaDesk actually has. Prices come from PayPal / Stripe.

import { PLANS, type SelfServePlan } from "@/lib/billing/plans";

export type PlanCopy = {
  kicker: string;
  tagline: string;
  name: string;
  description: string;
  includes?: string;
  features: string[];
  quote: string;
  featured?: boolean;
};

export const PLAN_COPY: Record<SelfServePlan, PlanCopy> = {
  starter: {
    kicker: "Starter",
    tagline: "Get help",
    name: "The Support Sidekick",
    description: "For founders who are tired of answering the same customer questions.",
    features: [
      `${PLANS.starter.aiRepliesPerMonth} AI replies per month`,
      "Gmail & Outlook forwarding + Shopify",
      "AI email support",
      "Live chat widget for your store",
      "Live Shopify order lookup",
      "Shipping, tracking, product and order questions",
      "Returns & policy questions",
      "AI-drafted replies",
      "Human approval before replies and actions",
      "Confidence scoring",
      "Email loop protection",
    ],
    quote: "Let Ava handle the repetitive stuff. You handle the business.",
  },
  growth: {
    kicker: "Growth",
    tagline: "Get out of the inbox",
    name: "The AI Support Employee",
    description: "For Shopify brands ready to stop managing their inbox themselves.",
    includes: "Everything in Starter, plus:",
    features: [
      `${PLANS.growth.aiRepliesPerMonth} AI replies per month`,
      "Autopilot for high-confidence routine tickets",
      "Refund approval workflows",
      "Cancellation approval workflows",
      "Address-change workflows",
      "Live Shopify tracking",
      "Priority support",
    ],
    quote: "Your AI support employee.",
    featured: true,
  },
  scale: {
    kicker: "Scale",
    tagline: "Build your support operation",
    name: "The Support Department",
    description: "For brands where support is becoming a real operational bottleneck.",
    includes: "Everything in Growth, plus:",
    features: [
      `${(PLANS.scale.aiRepliesPerMonth ?? 0).toLocaleString("en-US")} AI replies per month (fair use, more on request)`,
      "Full autopilot where supported",
      "Shopify actions with approval safeguards",
      "Priority support",
      "Dedicated onboarding",
    ],
    quote: "Your support team shouldn't be the reason you stop growing.",
  },
};

export const FOUNDING_BADGE = "Founding price — limited founding spots";

/**
 * The "Customize" card: a monthly fee plus a price per AI reply. Not in
 * PayPal / Stripe; our team sets it up by hand, so the prices live here (USD cents).
 */
export const CUSTOM_PLAN = {
  monthlyAmount: 4000,
  perReplyAmount: 3,
  currency: "USD",
  badge: "Pay per reply",
  copy: {
    kicker: "Customize",
    tagline: "Pay for what you use",
    name: "The Flexible Plan",
    description: "For stores whose support volume changes month to month.",
    includes: "Everything in Growth, plus:",
    features: [
      "$0.03 per AI reply on top of the monthly fee",
      "Pay only for the replies Ava sends",
      "Set up with our team",
    ],
    quote: "Pay for the replies you need, nothing more.",
  } satisfies PlanCopy,
};
