import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const handlePayPalEvent = vi.fn();
const paypalFetch = vi.fn();
vi.mock("@/lib/paypal/webhook", () => ({ handlePayPalEvent }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/paypal/client", () => ({
  paypalConfig: () => ({ base: "https://api-m.sandbox.paypal.com", clientId: "c", secret: "s", webhookId: "WH-1", plans: { starter: "P-S", growth: "P-G" } }),
  paypalFetch,
}));

const SIG = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.paypal.com/cert",
  "paypal-transmission-id": "t-1",
  "paypal-transmission-sig": "sig",
  "paypal-transmission-time": "2026-10-12T12:00:00Z",
};
const body = JSON.stringify({ id: "WH-EVT-1", event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: { id: "I-1" } });

async function post(headers: Record<string, string>) {
  const { POST } = await import("./route");
  return POST(new NextRequest("http://localhost/api/paypal/webhook", { method: "POST", body, headers: { "content-type": "application/json", ...headers } }));
}

describe("PayPal webhook route", () => {
  beforeEach(() => {
    vi.resetModules();
    handlePayPalEvent.mockReset();
    paypalFetch.mockReset();
  });

  it("rejects requests without PayPal's signature headers, before calling PayPal", async () => {
    expect((await post({})).status).toBe(400);
    expect(paypalFetch).not.toHaveBeenCalled();
    expect(handlePayPalEvent).not.toHaveBeenCalled();
  });

  it("rejects events PayPal says are not genuine", async () => {
    paypalFetch.mockResolvedValue({ verification_status: "FAILURE" });
    expect((await post(SIG)).status).toBe(400);
    expect(paypalFetch.mock.calls[0]?.[2]?.body).toMatchObject({ webhook_id: "WH-1", transmission_id: "t-1" });
    expect(handlePayPalEvent).not.toHaveBeenCalled();
  });

  it("processes verified events and asks PayPal to retry on failure", async () => {
    paypalFetch.mockResolvedValue({ verification_status: "SUCCESS" });
    handlePayPalEvent.mockResolvedValue({ status: "processed", shopId: "s" });
    expect((await post(SIG)).status).toBe(200);
    expect(handlePayPalEvent.mock.calls[0]?.[1]).toMatchObject({ id: "WH-EVT-1" });

    vi.spyOn(console, "error").mockImplementation(() => {});
    handlePayPalEvent.mockRejectedValue(new Error("db down"));
    expect((await post(SIG)).status).toBe(500);
  });
});
