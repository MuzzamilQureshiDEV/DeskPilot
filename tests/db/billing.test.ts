import { randomUUID } from "node:crypto";

import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { aiAccess } from "@/lib/billing/plans";
import { handleStripeEvent, type WebhookDeps } from "@/lib/stripe/webhook";

import { adminClient, createTestUser, deleteTestUser, hasDbEnv, type Db, type TestUser } from "./helpers";

const NOW_S = Math.floor(Date.now() / 1000);
const tag = () => randomUUID().replace(/-/g, "").slice(0, 14);

function subscription(over: {
  id: string;
  customer: string;
  lookupKey?: string;
  status?: Stripe.Subscription.Status;
  shopId?: string;
  cancelAtPeriodEnd?: boolean;
}): Stripe.Subscription {
  return {
    id: over.id,
    object: "subscription",
    customer: over.customer,
    status: over.status ?? "active",
    metadata: over.shopId ? { shop_id: over.shopId } : {},
    cancel_at_period_end: over.cancelAtPeriodEnd ?? false,
    cancel_at: null,
    items: {
      object: "list",
      data: [
        {
          id: `si_${tag()}`,
          price: { id: `price_${tag()}`, lookup_key: over.lookupKey ?? "deskpilot_growth_monthly" },
          current_period_start: NOW_S - 86_400,
          current_period_end: NOW_S + 29 * 86_400,
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

function event(type: string, object: Record<string, unknown>, id = `evt_${tag()}`): Stripe.Event {
  return { id, object: "event", type, data: { object } } as unknown as Stripe.Event;
}

const depsFor = (sub: Stripe.Subscription): WebhookDeps => ({ retrieveSubscription: async () => sub });

describe.skipIf(!hasDbEnv)("Stripe billing webhook (live DB)", () => {
  let admin: Db;
  let owner: TestUser | undefined;
  let other: TestUser | undefined;
  let shopA = "";
  let shopB = "";
  const cusA = `cus_${tag()}`;
  const cusB = `cus_${tag()}`;
  const subA = `sub_${tag()}`;

  const shopRow = async (id: string) =>
    (
      await admin
        .from("shops")
        .select("plan, trial_ends_at, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_start, current_period_end, cancel_at_period_end")
        .eq("id", id)
        .single()
    ).data;

  beforeAll(async () => {
    admin = adminClient();
    owner = await createTestUser(admin, { shopName: "Billing A" });
    other = await createTestUser(admin, { shopName: "Billing B" });
    shopA = (await admin.from("shop_members").select("shop_id").eq("user_id", owner.id).single()).data?.shop_id ?? "";
    shopB = (await admin.from("shop_members").select("shop_id").eq("user_id", other.id).single()).data?.shop_id ?? "";
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of [shopA, shopB]) if (id) await admin.from("shops").delete().eq("id", id);
    await deleteTestUser(admin, owner);
    await deleteTestUser(admin, other);
  });

  it("lets only the owner link a Stripe customer, once", async () => {
    // Someone else's shop.
    expect((await other!.client.rpc("link_stripe_customer", { p_shop_id: shopA, p_customer_id: cusA })).error?.code).toBe("42501");
    expect((await owner!.client.rpc("link_stripe_customer", { p_shop_id: shopA, p_customer_id: "not-a-customer" })).error).not.toBeNull();
    expect((await owner!.client.rpc("link_stripe_customer", { p_shop_id: shopA, p_customer_id: cusA })).error).toBeNull();
    expect((await owner!.client.rpc("link_stripe_customer", { p_shop_id: shopA, p_customer_id: `cus_${tag()}` })).error).not.toBeNull();
    expect((await shopRow(shopA))?.stripe_customer_id).toBe(cusA);
    await admin.from("shops").update({ stripe_customer_id: cusB }).eq("id", shopB);
  });

  it("never lets a member change their own plan from the browser", async () => {
    await owner!.client.from("shops").update({ plan: "scale" }).eq("id", shopA);
    await owner!.client.from("shops").update({ subscription_status: "active" }).eq("id", shopA);
    const row = await shopRow(shopA);
    expect(row?.plan).toBe("trial");
    expect(row?.subscription_status).toBeNull();
  });

  it("activates the plan when checkout completes, and only once", async () => {
    const sub = subscription({ id: subA, customer: cusA, shopId: shopA });
    const completed = event("checkout.session.completed", { mode: "subscription", subscription: subA, client_reference_id: shopA, customer: cusA });

    expect(await handleStripeEvent(admin, completed, depsFor(sub))).toEqual({ status: "processed", shopId: shopA });
    expect(await handleStripeEvent(admin, completed, depsFor(sub))).toEqual({ status: "duplicate" });

    const row = await shopRow(shopA);
    expect(row).toMatchObject({ plan: "growth", stripe_subscription_id: subA, subscription_status: "active", cancel_at_period_end: false });
    expect(new Date(row?.current_period_start ?? 0).getTime()).toBe((NOW_S - 86_400) * 1000);
    expect(new Date(row?.current_period_end ?? 0).getTime()).toBe((NOW_S + 29 * 86_400) * 1000);
  });

  it("follows plan switches and scheduled cancellation", async () => {
    const sub = subscription({ id: subA, customer: cusA, lookupKey: "deskpilot_starter_monthly", cancelAtPeriodEnd: true });
    await handleStripeEvent(admin, event("customer.subscription.updated", { id: subA }), depsFor(sub));
    expect(await shopRow(shopA)).toMatchObject({ plan: "starter", cancel_at_period_end: true });
  });

  it("keeps the AI on when a payment fails, then stops it when the subscription ends", async () => {
    const failing = subscription({ id: subA, customer: cusA, lookupKey: "deskpilot_starter_monthly", status: "past_due" });
    const invoice = { parent: { type: "subscription_details", subscription_details: { subscription: subA } } };
    await handleStripeEvent(admin, event("invoice.payment_failed", invoice), depsFor(failing));
    let row = await shopRow(shopA);
    expect(row?.subscription_status).toBe("past_due");
    expect(aiAccess({ plan: row!.plan, trialEndsAt: row!.trial_ends_at, subscriptionStatus: row!.subscription_status }, 0, new Date()).allowed).toBe(true);

    const ended = subscription({ id: subA, customer: cusA, lookupKey: "deskpilot_starter_monthly", status: "canceled" });
    await handleStripeEvent(admin, event("customer.subscription.deleted", { id: subA }), depsFor(ended));
    row = await shopRow(shopA);
    expect(row).toMatchObject({ plan: "starter", subscription_status: "canceled" });
    expect(aiAccess({ plan: row!.plan, trialEndsAt: row!.trial_ends_at, subscriptionStatus: row!.subscription_status }, 0, new Date())).toEqual({
      allowed: false,
      reason: "subscription_inactive",
    });
  });

  it("ignores an old subscription ending after the shop has a new one", async () => {
    const newSub = `sub_${tag()}`;
    await handleStripeEvent(admin, event("customer.subscription.created", { id: newSub }), depsFor(subscription({ id: newSub, customer: cusA })));
    const old = subscription({ id: `sub_${tag()}`, customer: cusA, status: "canceled" });
    expect(await handleStripeEvent(admin, event("customer.subscription.deleted", { id: old.id }), depsFor(old))).toEqual({
      status: "ignored",
      reason: "stale_subscription",
    });
    expect(await shopRow(shopA)).toMatchObject({ stripe_subscription_id: newSub, subscription_status: "active", plan: "growth" });
  });

  it("never lets an event's shop hint move billing onto another shop", async () => {
    // Shop B belongs to a different Stripe customer, so a hint pointing at it is ignored.
    const sub = subscription({ id: `sub_${tag()}`, customer: cusA, shopId: shopB });
    const res = await handleStripeEvent(admin, event("customer.subscription.updated", { id: sub.id }), depsFor(sub));
    expect(res).toEqual({ status: "processed", shopId: shopA });
    expect(await shopRow(shopB)).toMatchObject({ plan: "trial", subscription_status: null, stripe_customer_id: cusB });
  });

  it("ignores unknown customers and unrelated events", async () => {
    const stranger = subscription({ id: `sub_${tag()}`, customer: `cus_${tag()}` });
    expect(await handleStripeEvent(admin, event("customer.subscription.updated", { id: stranger.id }), depsFor(stranger))).toEqual({
      status: "ignored",
      reason: "unknown_shop",
    });
    expect(await handleStripeEvent(admin, event("customer.created", {}), depsFor(stranger))).toEqual({ status: "ignored", reason: "unhandled_type" });
  });

  it("lets Stripe retry an event that failed halfway", async () => {
    const e = event("customer.subscription.updated", { id: subA });
    const broken: WebhookDeps = {
      retrieveSubscription: async () => {
        throw new Error("Stripe unavailable");
      },
    };
    await expect(handleStripeEvent(admin, e, broken)).rejects.toThrow();
    const sub = subscription({ id: subA, customer: cusA });
    expect((await handleStripeEvent(admin, e, depsFor(sub))).status).toBe("processed");
  });
});
