import { describe, expect, it, vi } from "vitest";

import { registerUninstallWebhook } from "@/lib/shopify/register";

const reply = (payload: unknown) => vi.fn(async () => new Response(JSON.stringify({ data: { webhookSubscriptionCreate: payload } }), { status: 200 }));
const conn = { domain: "demo.myshopify.com", accessToken: "tok" };

describe("registerUninstallWebhook", () => {
  it("subscribes APP_UNINSTALLED to our webhook URL", async () => {
    const fetchFn = reply({ webhookSubscription: { id: "gid://shopify/WebhookSubscription/1" }, userErrors: [] });
    expect(await registerUninstallWebhook(conn, "https://app.example.com/", fetchFn)).toBe("created");
    const sent = JSON.parse(String((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent.variables).toEqual({ topic: "APP_UNINSTALLED", sub: { uri: "https://app.example.com/api/shopify/webhooks" } });
  });

  it("treats an existing subscription as done and other errors as failures", async () => {
    const taken = reply({ webhookSubscription: null, userErrors: [{ field: ["uri"], message: "Address for this topic has already been taken" }] });
    expect(await registerUninstallWebhook(conn, "https://app.example.com", taken)).toBe("exists");
    const bad = reply({ webhookSubscription: null, userErrors: [{ field: ["uri"], message: "Address is invalid" }] });
    await expect(registerUninstallWebhook(conn, "https://app.example.com", bad)).rejects.toThrow("Address is invalid");
  });
});
