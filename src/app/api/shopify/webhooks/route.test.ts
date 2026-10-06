import { createHmac, randomBytes } from "node:crypto";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const handleShopifyWebhook = vi.fn();
vi.mock("@/lib/shopify/webhooks", () => ({ handleShopifyWebhook }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const SECRET = "shpss_unit_test_secret";
const sign = (body: string, secret = SECRET) => createHmac("sha256", secret).update(body, "utf8").digest("base64");

async function post(body: string, headers: Record<string, string>) {
  const { POST } = await import("./route");
  return POST(new NextRequest("http://localhost/api/shopify/webhooks", { method: "POST", body, headers }));
}

const body = JSON.stringify({ shop_id: 1, shop_domain: "demo.myshopify.com" });
const headers = (over: Record<string, string> = {}) => ({
  "x-shopify-topic": "shop/redact",
  "x-shopify-shop-domain": "demo.myshopify.com",
  "x-shopify-webhook-id": "wh-1",
  "x-shopify-hmac-sha256": sign(body),
  ...over,
});

describe("Shopify webhook route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SHOPIFY_API_KEY", "test-key");
    vi.stubEnv("SHOPIFY_API_SECRET", SECRET);
    vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    handleShopifyWebhook.mockReset();
  });

  it("returns 401 for a missing, forged or tampered HMAC, and does nothing", async () => {
    const unsigned: Record<string, string> = headers();
    delete unsigned["x-shopify-hmac-sha256"];
    expect((await post(body, unsigned)).status).toBe(401);
    expect((await post(body, headers({ "x-shopify-hmac-sha256": sign(body, "someone-else") }))).status).toBe(401);
    expect((await post(body.replace("demo", "evil"), headers())).status).toBe(401);
    expect(handleShopifyWebhook).not.toHaveBeenCalled();
  });

  it("passes a verified webhook to the handler", async () => {
    handleShopifyWebhook.mockResolvedValue({ status: "processed", topic: "shop/redact", shopId: null });
    const res = await post(body, headers());
    expect(res.status).toBe(200);
    expect(handleShopifyWebhook.mock.calls[0]?.[1]).toEqual({
      webhookId: "wh-1",
      topic: "shop/redact",
      domain: "demo.myshopify.com",
      body: { shop_id: 1, shop_domain: "demo.myshopify.com" },
    });
  });

  it("rejects a bad store domain and returns 500 so Shopify retries on failure", async () => {
    expect((await post(body, headers({ "x-shopify-shop-domain": "evil.com" }))).status).toBe(400);
    vi.spyOn(console, "error").mockImplementation(() => {});
    handleShopifyWebhook.mockRejectedValue(new Error("db down"));
    expect((await post(body, headers())).status).toBe(500);
  });
});
