import { NextRequest } from "next/server";
import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const handleStripeEvent = vi.fn();
vi.mock("@/lib/stripe/webhook", () => ({ handleStripeEvent }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const SECRET = "whsec_test_secret_for_unit_tests";
const stripe = new Stripe("sk_test_unit");

async function post(body: string, signature?: string) {
  const { POST } = await import("./route");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["stripe-signature"] = signature;
  return POST(new NextRequest("http://localhost/api/stripe/webhook", { method: "POST", body, headers }));
}

describe("Stripe webhook route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    handleStripeEvent.mockReset();
  });

  const event = JSON.stringify({ id: "evt_1", object: "event", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } });

  it("rejects missing and forged signatures before touching anything", async () => {
    expect((await post(event)).status).toBe(400);
    const forged = stripe.webhooks.generateTestHeaderString({ payload: event, secret: "whsec_someone_else" });
    expect((await post(event, forged)).status).toBe(400);
    const tampered = stripe.webhooks.generateTestHeaderString({ payload: event, secret: SECRET });
    expect((await post(event.replace("sub_1", "sub_2"), tampered)).status).toBe(400);
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });

  it("processes a correctly signed event", async () => {
    handleStripeEvent.mockResolvedValue({ status: "processed", shopId: "s1" });
    const res = await post(event, stripe.webhooks.generateTestHeaderString({ payload: event, secret: SECRET }));
    expect(res.status).toBe(200);
    expect(handleStripeEvent.mock.calls[0]?.[1]).toMatchObject({ id: "evt_1", type: "customer.subscription.updated" });
  });

  it("returns 500 so Stripe retries when processing fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    handleStripeEvent.mockRejectedValue(new Error("db down"));
    const res = await post(event, stripe.webhooks.generateTestHeaderString({ payload: event, secret: SECRET }));
    expect(res.status).toBe(500);
  });
});
