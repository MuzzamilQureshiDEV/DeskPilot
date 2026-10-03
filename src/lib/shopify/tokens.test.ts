import { describe, expect, it, vi } from "vitest";

import type { ShopifyAppConfig, ShopifyTokens } from "@/lib/shopify/oauth";
import {
  getShopifyAccessToken,
  ShopifyNotConnected,
  ShopifyReauthRequired,
  type StoredTokens,
  type TokenDeps,
} from "@/lib/shopify/tokens";

const NOW = new Date("2026-10-03T10:00:00Z");
const minutes = (m: number) => new Date(NOW.getTime() + m * 60_000);
const cfg: ShopifyAppConfig = { apiKey: "k", apiSecret: "s", scopes: ["read_orders"], appUrl: "http://localhost:3000" };

function deps(stored: StoredTokens | null, response?: { status: number; body?: unknown }) {
  const saved: ShopifyTokens[] = [];
  const fetchFn = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(response?.body ?? {}), { status: response?.status ?? 200 }),
  );
  const d: TokenDeps = {
    store: {
      load: async () => stored,
      save: async (_id, t) => {
        saved.push(t);
      },
    },
    config: cfg,
    decrypt: (blob) => blob.replace("enc:", ""),
    fetchFn,
    now: () => NOW,
  };
  return { d, saved, fetchFn };
}

const stored = (accessInMin: number, refreshInMin = 60 * 24 * 30): StoredTokens => ({
  domain: "my-store.myshopify.com",
  accessTokenEnc: "enc:shpat_current",
  refreshTokenEnc: "enc:shprt_current",
  accessExpiresAt: minutes(accessInMin),
  refreshExpiresAt: minutes(refreshInMin),
});

const refreshed = {
  access_token: "shpat_fresh",
  scope: "read_orders",
  expires_in: 3600,
  refresh_token: "shprt_fresh",
  refresh_token_expires_in: 7_776_000,
};

describe("getShopifyAccessToken", () => {
  it("returns the stored token while it has more than 5 minutes left", async () => {
    const { d, fetchFn } = deps(stored(30));
    expect(await getShopifyAccessToken("shop-1", d)).toEqual({ domain: "my-store.myshopify.com", accessToken: "shpat_current" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refreshes near expiry and saves the rotated pair", async () => {
    const { d, saved, fetchFn } = deps(stored(2), { status: 200, body: refreshed });
    const res = await getShopifyAccessToken("shop-2", d);
    expect(res.accessToken).toBe("shpat_fresh");
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({ refresh_token: "shprt_current" });
    expect(saved[0]).toMatchObject({ accessToken: "shpat_fresh", refreshToken: "shprt_fresh" });
  });

  it("shares one refresh between concurrent callers", async () => {
    const { d, fetchFn } = deps(stored(-1), { status: 200, body: refreshed });
    const results = await Promise.all([getShopifyAccessToken("shop-3", d), getShopifyAccessToken("shop-3", d)]);
    expect(results.map((r) => r.accessToken)).toEqual(["shpat_fresh", "shpat_fresh"]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("asks for reconnection when the refresh token expired or is rejected", async () => {
    await expect(getShopifyAccessToken("shop-4", deps(stored(-1, -1)).d)).rejects.toBeInstanceOf(ShopifyReauthRequired);
    await expect(getShopifyAccessToken("shop-5", deps(stored(-1), { status: 401 }).d)).rejects.toBeInstanceOf(
      ShopifyReauthRequired,
    );
  });

  it("reports shops that aren't connected", async () => {
    await expect(getShopifyAccessToken("shop-6", deps(null).d)).rejects.toBeInstanceOf(ShopifyNotConnected);
  });
});
