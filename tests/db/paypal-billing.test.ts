import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { aiAccess } from "@/lib/billing/plans";
import type { PayPalSubscription } from "@/lib/paypal/client";
import { handlePayPalEvent, type PayPalWebhookDeps } from "@/lib/paypal/webhook";

import { adminClient, createTestUser, deleteTestUser, hasDbEnv, type Db, type TestUser } from "./helpers";

const plans = { starter: "P-STARTER-TEST", growth: "P-GROWTH-TEST" };
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

function sub(over: Partial<PayPalSubscription> & { id: string }): PayPalSubscription {
  return {
    status: "ACTIVE",
    plan_id: plans.growth,
    start_time: iso(-1),
    billing_info: { last_payment: { time: iso(-1) }, next_billing_time: iso(29) },
    ...over,
  };
}
const event = (type: string, subscriptionId: string, id = `WH-${randomUUID()}`) => ({ id, event_type: type, resource: { id: subscriptionId } });
const deps = (s: PayPalSubscription): PayPalWebhookDeps => ({ getSubscription: async () => s, plans });

describe.skipIf(!hasDbEnv)("PayPal billing webhook (live DB)", () => {
  let admin: Db;
  let userA: TestUser | undefined;
  let userB: TestUser | undefined;
  let shopA = "";
  let shopB = "";
  const subA = `I-${randomUUID().slice(0, 12)}`;

  const row = async (id: string) =>
    (
      await admin
        .from("shops")
        .select("plan, trial_ends_at, billing_provider, paypal_subscription_id, subscription_status, current_period_end, cancel_at_period_end")
        .eq("id", id)
        .single()
    ).data!;
  const access = (r: Awaited<ReturnType<typeof row>>) =>
    aiAccess({ plan: r.plan, trialEndsAt: r.trial_ends_at, subscriptionStatus: r.subscription_status, currentPeriodEnd: r.current_period_end }, 0, new Date());

  beforeAll(async () => {
    admin = adminClient();
    userA = await createTestUser(admin, { shopName: "PayPal A" });
    userB = await createTestUser(admin, { shopName: "PayPal B" });
    shopA = (await admin.from("shop_members").select("shop_id").eq("user_id", userA.id).single()).data?.shop_id ?? "";
    shopB = (await admin.from("shop_members").select("shop_id").eq("user_id", userB.id).single()).data?.shop_id ?? "";
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of [shopA, shopB]) if (id) await admin.from("shops").delete().eq("id", id);
    await deleteTestUser(admin, userA);
    await deleteTestUser(admin, userB);
  });

  it("activates the plan when the subscription is approved, once", async () => {
    const e = event("BILLING.SUBSCRIPTION.ACTIVATED", subA);
    const s = sub({ id: subA, custom_id: shopA });
    expect(await handlePayPalEvent(admin, e, deps(s))).toEqual({ status: "processed", shopId: shopA });
    expect(await handlePayPalEvent(admin, e, deps(s))).toEqual({ status: "duplicate" });
    expect(await row(shopA)).toMatchObject({ plan: "growth", billing_provider: "paypal", paypal_subscription_id: subA, subscription_status: "active" });
  });

  it("members can't set billing from the browser", async () => {
    expect((await userA!.client.from("shops").update({ billing_provider: "stripe" }).eq("id", shopA)).error).not.toBeNull();
    expect((await userA!.client.from("shops").update({ paypal_subscription_id: "I-FAKE" }).eq("id", shopA)).error).not.toBeNull();
  });

  it("follows a plan switch and keeps the AI on while a payment is retried", async () => {
    await handlePayPalEvent(admin, event("BILLING.SUBSCRIPTION.UPDATED", subA), deps(sub({ id: subA, plan_id: plans.starter })));
    expect((await row(shopA)).plan).toBe("starter");
    await handlePayPalEvent(admin, event("BILLING.SUBSCRIPTION.SUSPENDED", subA), deps(sub({ id: subA, plan_id: plans.starter, status: "SUSPENDED" })));
    const r = await row(shopA);
    expect(r.subscription_status).toBe("past_due");
    expect(access(r).allowed).toBe(true);
  });

  it("a cancelled plan keeps working until the paid period ends", async () => {
    const cancelled = sub({ id: subA, plan_id: plans.starter, status: "CANCELLED", billing_info: { last_payment: { time: iso(-1) } } });
    await handlePayPalEvent(admin, event("BILLING.SUBSCRIPTION.CANCELLED", subA), deps(cancelled));
    const r = await row(shopA);
    expect(r).toMatchObject({ subscription_status: "canceled", cancel_at_period_end: true });
    expect(new Date(r.current_period_end!).getTime()).toBeGreaterThan(Date.now()); // kept from before
    expect(access(r).allowed).toBe(true);

    await admin.from("shops").update({ current_period_end: iso(-1) }).eq("id", shopA);
    expect(access(await row(shopA))).toEqual({ allowed: false, reason: "subscription_inactive" });
  });

  it("an old subscription ending can't cancel a newer one, and a pending one can't replace a live one", async () => {
    const newSub = `I-${randomUUID().slice(0, 12)}`;
    await handlePayPalEvent(admin, event("BILLING.SUBSCRIPTION.ACTIVATED", newSub), deps(sub({ id: newSub, custom_id: shopA })));
    const old = sub({ id: `I-${randomUUID().slice(0, 12)}`, custom_id: shopA, status: "CANCELLED" });
    expect(await handlePayPalEvent(admin, event("BILLING.SUBSCRIPTION.CANCELLED", old.id), deps(old))).toEqual({ status: "ignored", reason: "stale_subscription" });
    const pending = sub({ id: `I-${randomUUID().slice(0, 12)}`, custom_id: shopA, status: "APPROVAL_PENDING" });
    expect(await handlePayPalEvent(admin, event("BILLING.SUBSCRIPTION.UPDATED", pending.id), deps(pending))).toEqual({ status: "ignored", reason: "stale_subscription" });
    expect(await row(shopA)).toMatchObject({ paypal_subscription_id: newSub, subscription_status: "active" });
  });

  it("ignores unknown subscriptions and never touches another shop", async () => {
    const stranger = sub({ id: `I-${randomUUID().slice(0, 12)}` });
    expect(await handlePayPalEvent(admin, event("BILLING.SUBSCRIPTION.ACTIVATED", stranger.id), deps(stranger))).toEqual({ status: "ignored", reason: "unknown_shop" });
    expect(await handlePayPalEvent(admin, event("CUSTOMER.DISPUTE.CREATED", "x"), deps(stranger))).toEqual({ status: "ignored", reason: "unhandled_type" });
    expect(await row(shopB)).toMatchObject({ plan: "trial", billing_provider: null, paypal_subscription_id: null });
  });

  it("lets PayPal retry an event that failed halfway", async () => {
    const e = event("BILLING.SUBSCRIPTION.UPDATED", subA);
    await expect(handlePayPalEvent(admin, e, { getSubscription: async () => Promise.reject(new Error("PayPal down")), plans })).rejects.toThrow();
    expect((await handlePayPalEvent(admin, e, deps(sub({ id: subA })))).status).not.toBe("duplicate");
  });
});
