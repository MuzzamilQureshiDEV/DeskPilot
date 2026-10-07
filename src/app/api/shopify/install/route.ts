import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { getAuthUser, getCurrentShop } from "@/lib/auth/session";
import { SHOPIFY_CALLBACK_PATH } from "@/lib/shopify/config";
import {
  buildAuthorizeUrl,
  normalizeShopDomain,
  shopifyAppConfig,
  verifyFreshShopifyRequest,
} from "@/lib/shopify/oauth";
import { createClient } from "@/lib/supabase/server";

const OAUTH_COOKIE = "shopify_oauth";

const toStore = (req: NextRequest, error: string) =>
  NextResponse.redirect(new URL(`/store?error=${error}`, req.url));

/**
 * Starts the Shopify OAuth flow. Two ways in:
 * - the Store page form (`?shop=…`), for a signed-in merchant, and
 * - Shopify's install link / App URL (`?shop=…&hmac=…&timestamp=…`), possibly
 *   before the merchant has a AstaDesk account.
 */
export async function GET(req: NextRequest) {
  const cfg = shopifyAppConfig();
  if (!cfg) return toStore(req, "not_configured");

  const params = req.nextUrl.searchParams;
  // Requests from Shopify are signed; a bad or stale signature is never trusted.
  if (params.has("hmac") && !verifyFreshShopifyRequest(params, cfg.apiSecret)) {
    return toStore(req, "invalid");
  }

  const domain = normalizeShopDomain(params.get("shop") ?? "");

  const user = await getAuthUser();
  if (!user) {
    // New merchants sign up first, then come straight back here to finish connecting.
    if (!domain) return NextResponse.redirect(new URL("/login?next=/store", req.url));
    const next = `/api/shopify/install?shop=${encodeURIComponent(domain)}`;
    const url = new URL("/signup", req.url);
    url.searchParams.set("shop", domain);
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  const shop = await getCurrentShop();
  if (!shop) return toStore(req, "no_shop");
  if (!domain) return toStore(req, "invalid_domain");

  const supabase = await createClient();
  const { data: status } = await supabase.rpc("shopify_connection_status", { p_shop_id: shop.id }).maybeSingle();
  if (status?.domain === domain && !status.needs_reconnect) {
    // Already connected to this store (e.g. opened the app from Shopify again).
    return NextResponse.redirect(new URL("/store", req.url));
  }
  // Reconnecting is allowed only for the same store when the connection expired.
  if (status?.domain && (!status.needs_reconnect || status.domain !== domain)) {
    return toStore(req, "already_connected");
  }

  const state = randomBytes(32).toString("base64url");
  const res = NextResponse.redirect(buildAuthorizeUrl(cfg, domain, state));
  res.cookies.set(OAUTH_COOKIE, `${state}.${shop.id}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: SHOPIFY_CALLBACK_PATH,
    maxAge: 10 * 60,
  });
  return res;
}
