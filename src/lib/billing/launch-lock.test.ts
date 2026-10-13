import { beforeEach, describe, expect, it, vi } from "vitest";

const env: { PAYPAL_ENV?: string; STRIPE_SECRET_KEY?: string } = {};
let paypal: object | null = null;
vi.mock("@/lib/env", () => ({ serverEnv: () => env }));
vi.mock("@/lib/paypal/client", () => ({ paypalConfig: () => paypal }));

const { plansLocked, realMoneyBilling } = await import("@/lib/billing/launch-lock");
const { LAUNCH_AT } = await import("@/lib/launch");

const before = new Date(new Date(LAUNCH_AT).getTime() - 60_000);
const after = new Date(new Date(LAUNCH_AT).getTime() + 1);

describe("plans locked until launch", () => {
  beforeEach(() => {
    delete env.PAYPAL_ENV;
    delete env.STRIPE_SECRET_KEY;
    paypal = null;
  });

  it("PayPal sandbox stays open so checkout can be tested", () => {
    paypal = {};
    env.PAYPAL_ENV = "sandbox";
    expect(realMoneyBilling()).toBe(false);
    expect(plansLocked(before)).toBe(false);
  });

  it("live PayPal is locked until launch, then opens", () => {
    paypal = {};
    env.PAYPAL_ENV = "live";
    expect(plansLocked(before)).toBe(true);
    expect(plansLocked(after)).toBe(false);
  });

  it("Stripe: test keys open, live keys locked until launch", () => {
    env.STRIPE_SECRET_KEY = "sk_test_123";
    expect(plansLocked(before)).toBe(false);
    env.STRIPE_SECRET_KEY = "sk_live_123";
    expect(plansLocked(before)).toBe(true);
    expect(plansLocked(after)).toBe(false);
  });
});
