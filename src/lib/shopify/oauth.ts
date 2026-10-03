import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { serverEnv } from "@/lib/env";
import { DEFAULT_SHOPIFY_SCOPES, SHOPIFY_CALLBACK_PATH } from "@/lib/shopify/config";

// Authorization code grant for a non-embedded public app, with expiring
// offline tokens (https://shopify.dev, checked 2026-10-03).

export type ShopifyAppConfig = {
  apiKey: string;
  apiSecret: string;
  scopes: string[];
  appUrl: string;
};

/** App credentials from env, or null when Shopify isn't configured yet. */
export function shopifyAppConfig(): ShopifyAppConfig | null {
  const env = serverEnv();
  if (!env.SHOPIFY_API_KEY || !env.SHOPIFY_API_SECRET || !env.ENCRYPTION_KEY) return null;
  const scopes = env.SHOPIFY_SCOPES
    ? env.SHOPIFY_SCOPES.split(",").map((s) => s.trim()).filter(Boolean)
    : [...DEFAULT_SHOPIFY_SCOPES];
  return { apiKey: env.SHOPIFY_API_KEY, apiSecret: env.SHOPIFY_API_SECRET, scopes, appUrl: env.NEXT_PUBLIC_APP_URL };
}

export { normalizeShopDomain } from "@/lib/shopify/domain";

/** Max age of a Shopify-signed request (install link), in seconds. */
const MAX_SIGNED_REQUEST_AGE_S = 10 * 60;

/** Signature is valid and `timestamp` is recent (within 10 minutes, either way). */
export function verifyFreshShopifyRequest(params: URLSearchParams, secret: string, now: Date = new Date()): boolean {
  if (!verifyShopifyHmac(params, secret)) return false;
  const ts = Number(params.get("timestamp"));
  if (!Number.isFinite(ts)) return false;
  return Math.abs(now.getTime() / 1000 - ts) <= MAX_SIGNED_REQUEST_AGE_S;
}

export function buildAuthorizeUrl(cfg: ShopifyAppConfig, shop: string, state: string): string {
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", cfg.apiKey);
  url.searchParams.set("scope", cfg.scopes.join(","));
  url.searchParams.set("redirect_uri", new URL(SHOPIFY_CALLBACK_PATH, cfg.appUrl).toString());
  url.searchParams.set("state", state);
  return url.toString();
}

/** Verifies the `hmac` Shopify adds to OAuth redirects (all other params, sorted, HMAC-SHA256 hex). */
export function verifyShopifyHmac(params: URLSearchParams, secret: string): boolean {
  const hmac = params.get("hmac");
  if (!hmac) return false;
  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const expected = createHmac("sha256", secret).update(message).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(hmac, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Constant-time string comparison (for OAuth state). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  scope: z.string(),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1),
  refresh_token_expires_in: z.number().int().positive(),
});

export type ShopifyTokens = {
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
};

export class ShopifyTokenError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ShopifyTokenError";
  }
}

export type FetchFn = typeof fetch;

async function postToken(
  shop: string,
  body: Record<string, string>,
  fetchFn: FetchFn,
  now: Date,
): Promise<ShopifyTokens> {
  const res = await fetchFn(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ShopifyTokenError(`Shopify token request failed (${res.status})`, res.status);

  const parsed = tokenResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new ShopifyTokenError("Unexpected Shopify token response", res.status);
  const t = parsed.data;
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    scopes: t.scope.split(",").map((s) => s.trim()).filter(Boolean),
    accessExpiresAt: new Date(now.getTime() + t.expires_in * 1000),
    refreshExpiresAt: new Date(now.getTime() + t.refresh_token_expires_in * 1000),
  };
}

/** Exchanges the OAuth code for an expiring offline token pair. */
export function exchangeCode(
  cfg: ShopifyAppConfig,
  shop: string,
  code: string,
  fetchFn: FetchFn = fetch,
  now: Date = new Date(),
): Promise<ShopifyTokens> {
  return postToken(shop, { client_id: cfg.apiKey, client_secret: cfg.apiSecret, code, expiring: "1" }, fetchFn, now);
}

/** Refreshes an expiring offline token. Shopify rotates the refresh token too. */
export function refreshAccessToken(
  cfg: ShopifyAppConfig,
  shop: string,
  refreshToken: string,
  fetchFn: FetchFn = fetch,
  now: Date = new Date(),
): Promise<ShopifyTokens> {
  return postToken(
    shop,
    { client_id: cfg.apiKey, client_secret: cfg.apiSecret, grant_type: "refresh_token", refresh_token: refreshToken },
    fetchFn,
    now,
  );
}

/** Required scopes not granted. A granted `write_x` also covers `read_x`. */
export function missingScopes(granted: string[], required: string[]): string[] {
  const have = new Set(granted);
  return required.filter((s) => !have.has(s) && !(s.startsWith("read_") && have.has(`write_${s.slice(5)}`)));
}
