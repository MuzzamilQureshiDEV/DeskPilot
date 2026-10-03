import { createHmac, randomBytes } from "node:crypto";

import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "test-secret";
const SHOP_ID = "11111111-2222-4333-8444-555555555555";

const session = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  shop: null as { id: string } | null,
  status: null as { domain: string | null; needs_reconnect: boolean } | null,
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthUser: async () => session.user,
  getCurrentShop: async () => session.shop,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: () => ({ maybeSingle: async () => ({ data: session.status }) }),
  }),
}));

beforeAll(() => {
  vi.stubEnv("SHOPIFY_API_KEY", "test-key");
  vi.stubEnv("SHOPIFY_API_SECRET", SECRET);
  vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("base64"));
});

beforeEach(() => {
  session.user = null;
  session.shop = null;
  session.status = null;
});

function shopifySigned(params: Record<string, string>, secret = SECRET): string {
  const message = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return new URLSearchParams({ ...params, hmac: createHmac("sha256", secret).update(message).digest("hex") }).toString();
}

async function call(query: string) {
  const { GET } = await import("./route");
  const res = await GET(new NextRequest(`http://localhost:3000/api/shopify/install?${query}`));
  return { location: new URL(res.headers.get("location") ?? "", "http://localhost:3000"), cookie: res.headers.get("set-cookie") };
}

const now = () => String(Math.floor(Date.now() / 1000));

describe("install route", () => {
  it("sends a new merchant from Shopify's install link to signup, keeping the store", async () => {
    const { location } = await call(shopifySigned({ shop: "harbor-pine.myshopify.com", timestamp: now() }));
    expect(location.pathname).toBe("/signup");
    expect(location.searchParams.get("shop")).toBe("harbor-pine.myshopify.com");
    expect(location.searchParams.get("next")).toBe("/api/shopify/install?shop=harbor-pine.myshopify.com");
  });

  it("rejects a forged or stale Shopify signature", async () => {
    const forged = await call(shopifySigned({ shop: "a.myshopify.com", timestamp: now() }, "wrong"));
    expect(forged.location.search).toBe("?error=invalid");
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    const stale = await call(shopifySigned({ shop: "a.myshopify.com", timestamp: old }));
    expect(stale.location.search).toBe("?error=invalid");
  });

  it("sends a signed-in merchant straight to Shopify with a state cookie", async () => {
    session.user = { id: "u1", email: "a@example.com" };
    session.shop = { id: SHOP_ID };
    const { location, cookie } = await call("shop=my-store");
    expect(location.origin).toBe("https://my-store.myshopify.com");
    expect(location.pathname).toBe("/admin/oauth/authorize");
    const state = location.searchParams.get("state");
    expect(cookie).toContain(`shopify_oauth=${state}.${SHOP_ID}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/shopify\/callback/i);
  });

  it("doesn't restart OAuth for a store that's already connected", async () => {
    session.user = { id: "u1", email: "a@example.com" };
    session.shop = { id: SHOP_ID };
    session.status = { domain: "my-store.myshopify.com", needs_reconnect: false };
    expect((await call("shop=my-store.myshopify.com")).location.pathname).toBe("/store");
    expect((await call("shop=other.myshopify.com")).location.search).toBe("?error=already_connected");
  });

  it("validates the address for signed-in merchants", async () => {
    session.user = { id: "u1", email: "a@example.com" };
    session.shop = { id: SHOP_ID };
    expect((await call("shop=evil.com")).location.search).toBe("?error=invalid_domain");
  });
});
