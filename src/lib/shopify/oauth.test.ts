import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  buildAuthorizeUrl,
  exchangeCode,
  missingScopes,
  normalizeShopDomain,
  refreshAccessToken,
  ShopifyTokenError,
  verifyShopifyHmac,
  type ShopifyAppConfig,
} from "@/lib/shopify/oauth";

const cfg: ShopifyAppConfig = {
  apiKey: "key123",
  apiSecret: "secret456",
  scopes: ["read_orders", "write_orders", "read_products"],
  appUrl: "http://localhost:3000",
};
const NOW = new Date("2026-10-03T10:00:00Z");

function sign(params: Record<string, string>, secret = cfg.apiSecret): URLSearchParams {
  const message = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const hmac = createHmac("sha256", secret).update(message).digest("hex");
  return new URLSearchParams({ ...params, hmac });
}

describe("normalizeShopDomain", () => {
  it.each([
    ["my-store", "my-store.myshopify.com"],
    ["My-Store.myshopify.com", "my-store.myshopify.com"],
    [" my-store.myshopify.com ", "my-store.myshopify.com"],
    ["https://my-store.myshopify.com/admin/orders", "my-store.myshopify.com"],
    ["https://admin.shopify.com/store/my-store/orders", "my-store.myshopify.com"],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeShopDomain(input)).toBe(expected);
  });

  it.each([
    "",
    "evil.com",
    "my-store.myshopify.com.evil.com",
    "evil.com?x=.myshopify.com",
    "https://evil.com/my-store.myshopify.com",
    "-bad.myshopify.com",
    "a_b.myshopify.com",
    "my store.myshopify.com",
    "https://admin.shopify.com/settings",
  ])("rejects %j", (input) => {
    expect(normalizeShopDomain(input)).toBeNull();
  });
});

describe("buildAuthorizeUrl", () => {
  it("requests an offline token with our scopes, callback and state", () => {
    const url = new URL(buildAuthorizeUrl(cfg, "my-store.myshopify.com", "st4te"));
    expect(url.origin + url.pathname).toBe("https://my-store.myshopify.com/admin/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "key123",
      scope: "read_orders,write_orders,read_products",
      redirect_uri: "http://localhost:3000/api/shopify/callback",
      state: "st4te",
    });
    expect(url.searchParams.has("grant_options[]")).toBe(false);
  });
});

describe("verifyShopifyHmac", () => {
  const params = { code: "abc", shop: "my-store.myshopify.com", state: "s", timestamp: "1790000000", host: "aG9zdA" };

  it("accepts Shopify's signature regardless of param order", () => {
    expect(verifyShopifyHmac(sign(params), cfg.apiSecret)).toBe(true);
  });

  it("rejects tampering, a wrong secret or a missing hmac", () => {
    const tampered = sign(params);
    tampered.set("shop", "other.myshopify.com");
    expect(verifyShopifyHmac(tampered, cfg.apiSecret)).toBe(false);
    expect(verifyShopifyHmac(sign(params, "wrong"), cfg.apiSecret)).toBe(false);
    expect(verifyShopifyHmac(new URLSearchParams(params), cfg.apiSecret)).toBe(false);
  });
});

describe("token requests", () => {
  const okBody = {
    access_token: "shpat_new",
    scope: "write_orders,read_products",
    expires_in: 3600,
    refresh_token: "shprt_new",
    refresh_token_expires_in: 7_776_000,
  };
  const fetchReturning = (status: number, body: unknown) =>
    vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));

  it("exchanges the code for an expiring offline token pair", async () => {
    const fetchFn = fetchReturning(200, okBody);
    const t = await exchangeCode(cfg, "my-store.myshopify.com", "the-code", fetchFn, NOW);

    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe("https://my-store.myshopify.com/admin/oauth/access_token");
    expect(JSON.parse(String(init?.body))).toEqual({
      client_id: "key123",
      client_secret: "secret456",
      code: "the-code",
      expiring: "1",
    });
    expect(t).toEqual({
      accessToken: "shpat_new",
      refreshToken: "shprt_new",
      scopes: ["write_orders", "read_products"],
      accessExpiresAt: new Date("2026-10-03T11:00:00Z"),
      refreshExpiresAt: new Date("2027-01-01T10:00:00Z"),
    });
  });

  it("refreshes with grant_type=refresh_token", async () => {
    const fetchFn = fetchReturning(200, okBody);
    await refreshAccessToken(cfg, "my-store.myshopify.com", "shprt_old", fetchFn, NOW);
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "shprt_old",
    });
  });

  it("rejects error statuses and malformed responses", async () => {
    await expect(exchangeCode(cfg, "s.myshopify.com", "c", fetchReturning(400, {}), NOW)).rejects.toMatchObject({
      status: 400,
    });
    // A non-expiring token response (no refresh token) isn't accepted.
    const legacy = { access_token: "x", scope: "read_orders" };
    await expect(exchangeCode(cfg, "s.myshopify.com", "c", fetchReturning(200, legacy), NOW)).rejects.toBeInstanceOf(
      ShopifyTokenError,
    );
  });
});

describe("missingScopes", () => {
  it("treats write_x as covering read_x", () => {
    expect(missingScopes(["write_orders", "read_products"], cfg.scopes)).toEqual([]);
    expect(missingScopes(["read_orders"], cfg.scopes)).toEqual(["write_orders", "read_products"]);
  });
});
