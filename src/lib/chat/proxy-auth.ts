import { createHmac } from "node:crypto";

import { safeEqual } from "@/lib/shopify/oauth";

// Shopify App Proxy signature: every forwarded storefront request carries
// `signature` = hex HMAC-SHA256 (app secret) of the other query params,
// each as `key=value` (repeated keys joined with ","), sorted, concatenated
// with no separator. https://shopify.dev/docs/apps/build/online-store/app-proxies

const MAX_AGE_SECONDS = 5 * 60;

export function proxyMessage(params: URLSearchParams): string {
  const grouped = new Map<string, string[]>();
  for (const [key, value] of params) {
    if (key === "signature") continue;
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  return [...grouped.entries()]
    .map(([key, values]) => `${key}=${values.join(",")}`)
    .sort()
    .join("");
}

export function signProxyParams(params: URLSearchParams, secret: string): string {
  return createHmac("sha256", secret).update(proxyMessage(params)).digest("hex");
}

/** True when the request really came through Shopify's app proxy, recently. */
export function verifyProxyRequest(params: URLSearchParams, secret: string, now: Date = new Date()): boolean {
  const signature = params.get("signature");
  const timestamp = Number(params.get("timestamp"));
  if (!signature || !secret || !Number.isFinite(timestamp)) return false;
  if (Math.abs(now.getTime() / 1000 - timestamp) > MAX_AGE_SECONDS) return false;
  return safeEqual(signProxyParams(params, secret), signature);
}
