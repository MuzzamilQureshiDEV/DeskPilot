import "server-only";

import { serverEnv } from "@/lib/env";

// PayPal REST (Subscriptions API v1). OAuth2 client-credentials token, cached
// until shortly before it expires. Never log tokens or response bodies (rule 4).

export type PayPalConfig = {
  base: string;
  clientId: string;
  secret: string;
  webhookId: string | null;
  plans: { starter: string; growth: string; scale: string };
};

export function paypalConfig(): PayPalConfig | null {
  const e = serverEnv();
  if (!e.PAYPAL_CLIENT_ID || !e.PAYPAL_CLIENT_SECRET || !e.PAYPAL_PLAN_STARTER || !e.PAYPAL_PLAN_GROWTH || !e.PAYPAL_PLAN_SCALE) return null;
  return {
    base: e.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com",
    clientId: e.PAYPAL_CLIENT_ID,
    secret: e.PAYPAL_CLIENT_SECRET,
    webhookId: e.PAYPAL_WEBHOOK_ID ?? null,
    plans: { starter: e.PAYPAL_PLAN_STARTER, growth: e.PAYPAL_PLAN_GROWTH, scale: e.PAYPAL_PLAN_SCALE },
  };
}

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PayPalError";
  }
}

let cached: { key: string; token: string; expiresAt: number } | null = null;

export async function paypalToken(cfg: PayPalConfig, fetchFn: typeof fetch = fetch, now = Date.now()): Promise<string> {
  const key = `${cfg.base}:${cfg.clientId}`;
  if (cached && cached.key === key && cached.expiresAt - 60_000 > now) return cached.token;
  const res = await fetchFn(`${cfg.base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new PayPalError("PayPal rejected the app credentials", res.status);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { key, token: json.access_token, expiresAt: now + json.expires_in * 1000 };
  return json.access_token;
}

/** Test hook: forget the cached token. */
export function resetPayPalToken() {
  cached = null;
}

export async function paypalFetch<T>(
  cfg: PayPalConfig,
  path: string,
  init: { method?: string; body?: unknown; requestId?: string } = {},
  fetchFn: typeof fetch = fetch,
): Promise<T> {
  const token = await paypalToken(cfg, fetchFn);
  const res = await fetchFn(`${cfg.base}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.requestId ? { "PayPal-Request-Id": init.requestId } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { message?: string; name?: string };
    throw new PayPalError(j.message ?? j.name ?? `PayPal error ${res.status}`, res.status);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export type PayPalSubscription = {
  id: string;
  status: "APPROVAL_PENDING" | "APPROVED" | "ACTIVE" | "SUSPENDED" | "CANCELLED" | "EXPIRED";
  plan_id: string;
  custom_id?: string;
  start_time?: string;
  billing_info?: { last_payment?: { time?: string }; next_billing_time?: string };
  links?: { href: string; rel: string }[];
};
