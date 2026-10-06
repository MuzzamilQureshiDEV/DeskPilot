import { NextResponse, type NextRequest } from "next/server";

import { getAuthUser } from "@/lib/auth/session";
import { encrypt } from "@/lib/crypto";
import { SHOPIFY_CALLBACK_PATH } from "@/lib/shopify/config";
import {
  exchangeCode,
  missingScopes,
  normalizeShopDomain,
  safeEqual,
  shopifyAppConfig,
  verifyShopifyHmac,
} from "@/lib/shopify/oauth";
import { registerUninstallWebhook } from "@/lib/shopify/register";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const OAUTH_COOKIE = "shopify_oauth";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function finish(req: NextRequest, query: string) {
  const res = NextResponse.redirect(new URL(`/store?${query}`, req.url));
  res.cookies.set(OAUTH_COOKIE, "", { path: SHOPIFY_CALLBACK_PATH, maxAge: 0 });
  return res;
}
const fail = (req: NextRequest, code: string) => finish(req, `error=${code}`);

/**
 * Shopify redirects here after the merchant approves the app. Every check runs
 * before any token is requested, and tokens are stored encrypted.
 */
export async function GET(req: NextRequest) {
  const cfg = shopifyAppConfig();
  if (!cfg) return fail(req, "not_configured");

  const params = req.nextUrl.searchParams;

  // 1. Request really came from Shopify.
  if (!verifyShopifyHmac(params, cfg.apiSecret)) return fail(req, "invalid");

  // 2. Shop is a real *.myshopify.com domain, given in canonical form.
  const rawShop = params.get("shop") ?? "";
  const domain = normalizeShopDomain(rawShop);
  if (!domain || domain !== rawShop) return fail(req, "invalid");

  // 3. State matches the cookie set by /api/shopify/install (CSRF).
  const [cookieState, shopId] = (req.cookies.get(OAUTH_COOKIE)?.value ?? "").split(".");
  const state = params.get("state") ?? "";
  if (!cookieState || !shopId || !UUID.test(shopId) || !safeEqual(cookieState, state)) {
    return fail(req, "invalid");
  }

  // 4. The signed-in user still belongs to that shop (RLS shows only their own memberships).
  const user = await getAuthUser();
  if (!user) return fail(req, "session");
  const supabase = await createClient();
  const { data: member } = await supabase
    .from("shop_members")
    .select("shop_id")
    .eq("shop_id", shopId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return fail(req, "invalid");

  const code = params.get("code");
  if (!code) return fail(req, "denied");

  // 5. Exchange the code for an expiring offline token pair.
  let tokens;
  try {
    tokens = await exchangeCode(cfg, domain, code);
  } catch (err) {
    console.error("shopify callback: token exchange failed", err instanceof Error ? err.name : "unknown");
    return fail(req, "failed");
  }

  // 6. Merchant granted everything we need.
  if (missingScopes(tokens.scopes, cfg.scopes).length > 0) return fail(req, "scopes");

  // 7. Save encrypted. Service role is used because browsers can never write
  //    token columns; this request is Shopify-signed (checked above) and the
  //    write is pinned to the verified shop id.
  const admin = createAdminClient();
  const { data: taken } = await admin
    .from("shops")
    .select("id")
    .eq("shopify_domain", domain)
    .neq("id", shopId)
    .maybeSingle();
  if (taken) return fail(req, "domain_taken");

  const { error } = await admin
    .from("shops")
    .update({
      shopify_domain: domain,
      shopify_token_enc: encrypt(tokens.accessToken),
      shopify_refresh_token_enc: encrypt(tokens.refreshToken),
      shopify_token_expires_at: tokens.accessExpiresAt.toISOString(),
      shopify_refresh_expires_at: tokens.refreshExpiresAt.toISOString(),
      shopify_scopes: tokens.scopes.join(","),
      shopify_connected_at: new Date().toISOString(),
      shopify_uninstalled_at: null,
    })
    .eq("id", shopId);
  if (error) return fail(req, error.code === "23505" ? "domain_taken" : "failed");

  // So an uninstall in Shopify disconnects the store here. Never blocks connecting.
  try {
    await registerUninstallWebhook({ domain, accessToken: tokens.accessToken }, cfg.appUrl);
  } catch {
    console.error("shopify callback: webhook registration failed", shopId);
  }

  return finish(req, "connected=1");
}
