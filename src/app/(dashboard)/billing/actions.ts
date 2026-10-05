"use server";

import { redirect } from "next/navigation";

import { getAuthUser, getCurrentShop } from "@/lib/auth/session";
import { SELF_SERVE_PLANS, type SelfServePlan } from "@/lib/billing/plans";
import { serverEnv } from "@/lib/env";
import { createCheckoutUrl, createPortalUrl, LIVE_STATUSES } from "@/lib/stripe/checkout";
import { createClient } from "@/lib/supabase/server";

export type BillingResult = { error: string } | undefined;

async function ownerContext() {
  const [user, shop] = await Promise.all([getAuthUser(), getCurrentShop()]);
  if (!user?.email || !shop) return { ok: false, error: "Log in again and retry." } as const;
  if (shop.role !== "owner") return { ok: false, error: "Only the store owner can change billing." } as const;
  const appUrl = serverEnv().NEXT_PUBLIC_APP_URL;
  if (!appUrl) return { ok: false, error: "Billing isn't set up yet." } as const;
  return { ok: true, user: { email: user.email }, shop, appUrl } as const;
}

const message = (err: unknown) => (err instanceof Error && err.message.length < 120 ? err.message : "Something went wrong. Please try again.");

/** Start Stripe Checkout for a plan, or open the portal if a subscription already exists. */
export async function choosePlanAction(plan: SelfServePlan): Promise<BillingResult> {
  if (!SELF_SERVE_PLANS.includes(plan)) return { error: "Unknown plan." };
  const ctx = await ownerContext();
  if (!ctx.ok) return { error: ctx.error };

  let url: string;
  try {
    const db = await createClient();
    url =
      ctx.shop.subscriptionStatus && LIVE_STATUSES.has(ctx.shop.subscriptionStatus)
        ? await createPortalUrl(db, ctx.shop.id, ctx.appUrl)
        : await createCheckoutUrl(db, ctx.shop, ctx.user.email, plan, ctx.appUrl);
  } catch (err) {
    console.error("billing: checkout failed");
    return { error: message(err) };
  }
  redirect(url);
}

/** Stripe Customer Portal: change plan, update card, invoices, cancel. */
export async function openPortalAction(): Promise<BillingResult> {
  const ctx = await ownerContext();
  if (!ctx.ok) return { error: ctx.error };
  let url: string;
  try {
    url = await createPortalUrl(await createClient(), ctx.shop.id, ctx.appUrl);
  } catch (err) {
    console.error("billing: portal failed");
    return { error: message(err) };
  }
  redirect(url);
}
