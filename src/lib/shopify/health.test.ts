import { describe, expect, it, vi } from "vitest";

import { checkShopifyConnection, explainShopifyError } from "@/lib/shopify/health";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("Shopify connection test", () => {
  it("passes every check when Shopify answers", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => json({ data: {} }));
    const checks = await checkShopifyConnection({ domain: "s.myshopify.com", accessToken: "t" }, fetchFn);
    expect(checks.map((c) => [c.id, c.ok])).toEqual([["store", true], ["products", true], ["orders", true]]);
    expect(String(fetchFn.mock.calls[0]![0])).toBe("https://s.myshopify.com/admin/api/2026-10/graphql.json");
  });

  it("explains a missing protected-customer-data approval on orders", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (_u, init) =>
      String(init?.body).includes("orders")
        ? json({ errors: [{ message: "This app is not approved to access the Order object. See https://shopify.dev/docs/apps/launch/protected-customer-data", extensions: { code: "ACCESS_DENIED" } }] })
        : json({ data: {} }),
    );
    const checks = await checkShopifyConnection({ domain: "s.myshopify.com", accessToken: "t" }, fetchFn);
    const orders = checks.find((c) => c.id === "orders")!;
    expect(orders.ok).toBe(false);
    expect(orders.detail).toContain("Protected customer data");
    expect(checks.find((c) => c.id === "products")!.ok).toBe(true);
  });

  it("turns HTTP errors and network failures into plain words", async () => {
    expect(explainShopifyError("store", 401, [])).toContain("Reconnect");
    expect(explainShopifyError("store", 402, [])).toContain("frozen");
    expect(explainShopifyError("products", 503, [])).toContain("busy");
    const down = await checkShopifyConnection({ domain: "s.myshopify.com", accessToken: "t" }, async () => Promise.reject(new Error("offline")));
    expect(down.every((c) => !c.ok && c.detail.includes("Couldn't reach Shopify"))).toBe(true);
  });
});
