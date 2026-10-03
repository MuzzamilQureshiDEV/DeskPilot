import { createHmac, randomBytes } from "node:crypto";

import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Every case below must be rejected before the session or database is touched.
const SECRET = "test-secret";

beforeAll(() => {
  vi.stubEnv("SHOPIFY_API_KEY", "test-key");
  vi.stubEnv("SHOPIFY_API_SECRET", SECRET);
  vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("base64"));
});

function signed(params: Record<string, string>, secret = SECRET): string {
  const message = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const hmac = createHmac("sha256", secret).update(message).digest("hex");
  return new URLSearchParams({ ...params, hmac }).toString();
}

async function call(query: string, cookie?: string) {
  const { GET } = await import("./route");
  const req = new NextRequest(`http://localhost:3000/api/shopify/callback?${query}`, {
    headers: cookie ? { cookie } : {},
  });
  const res = await GET(req);
  return { status: res.status, location: res.headers.get("location") ?? "" };
}

const SHOP_ID = "11111111-2222-4333-8444-555555555555";
const base = { code: "c0de", shop: "my-store.myshopify.com", state: "abc", timestamp: "1790000000" };

describe("Shopify OAuth callback rejects untrusted requests", () => {
  it("bad or missing HMAC", async () => {
    const res = await call(signed(base, "wrong-secret"), `shopify_oauth=abc.${SHOP_ID}`);
    expect(res.location).toContain("/store?error=invalid");
    expect((await call(new URLSearchParams(base).toString(), `shopify_oauth=abc.${SHOP_ID}`)).location).toContain(
      "error=invalid",
    );
  });

  it("non-Shopify or non-canonical shop domain, even when signed", async () => {
    for (const shop of ["evil.com", "My-Store.myshopify.com", "my-store.myshopify.com.evil.com"]) {
      const res = await call(signed({ ...base, shop }), `shopify_oauth=abc.${SHOP_ID}`);
      expect(res.location, shop).toContain("error=invalid");
    }
  });

  it("missing or mismatched state cookie", async () => {
    expect((await call(signed(base))).location).toContain("error=invalid");
    expect((await call(signed(base), `shopify_oauth=other.${SHOP_ID}`)).location).toContain("error=invalid");
    expect((await call(signed(base), "shopify_oauth=abc.not-a-uuid")).location).toContain("error=invalid");
  });

  it("always clears the OAuth cookie", async () => {
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(`http://localhost:3000/api/shopify/callback?${signed(base, "x")}`));
    expect(res.headers.get("set-cookie")).toMatch(/shopify_oauth=;.*Max-Age=0/i);
  });
});
