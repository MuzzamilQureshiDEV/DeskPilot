import "server-only";

import { encrypt } from "@/lib/crypto";
import { DEFAULT_SHOPIFY_SCOPES, SHOPIFY_API_VERSION } from "@/lib/shopify/config";
import { normalizeShopDomain } from "@/lib/shopify/domain";
import { clientCredentialsToken, missingScopes, ShopifyTokenError, type FetchFn } from "@/lib/shopify/oauth";
import type { createAdminClient } from "@/lib/supabase/admin";

// Connecting a store through its own private Shopify app (created by the
// merchant in their Dev Dashboard): verify the credentials, check the app's
// permissions, then save the connection with the secret encrypted.

type Db = ReturnType<typeof createAdminClient>;

export type OwnAppInput = { domain: string; clientId: string; clientSecret: string };
export type OwnAppResult = { ok: true; storeName: string } | { ok: false; error: string };

const SCOPE_LABELS: Record<string, string> = {
  read_orders: "Read orders",
  write_orders: "Write orders",
  read_products: "Read products",
  read_customers: "Read customers",
  read_fulfillments: "Read fulfillments",
  read_merchant_managed_fulfillment_orders: "Read merchant-managed fulfillment orders",
};

export async function connectOwnApp(db: Db, shopId: string, input: OwnAppInput, fetchFn: FetchFn = fetch, now = new Date()): Promise<OwnAppResult> {
  const domain = normalizeShopDomain(input.domain);
  if (!domain) return { ok: false, error: "Enter your store address, like your-store.myshopify.com." };
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (!clientId || !clientSecret) return { ok: false, error: "Paste both the Client ID and the Client secret." };
  if (clientId.length > 200 || clientSecret.length > 500) return { ok: false, error: "Those credentials look too long. Copy them again." };

  const { data: taken } = await db.from("shops").select("id").eq("shopify_domain", domain).neq("id", shopId).maybeSingle();
  if (taken) return { ok: false, error: "This Shopify store is already connected to another AstaDesk account." };

  let token;
  try {
    token = await clientCredentialsToken(domain, clientId, clientSecret, fetchFn, now);
  } catch (err) {
    if (err instanceof ShopifyTokenError && (err.status === 400 || err.status === 401 || err.status === 403)) {
      return {
        ok: false,
        error: "Shopify didn't accept these credentials. Check the Client ID and secret, and that the app is installed on this store.",
      };
    }
    if (err instanceof ShopifyTokenError && err.status === 404) return { ok: false, error: `We couldn't find ${domain}. Check the store address.` };
    return { ok: false, error: "Couldn't reach Shopify. Please try again in a minute." };
  }

  // What the app may actually do, and the store's name.
  let storeName = domain;
  let granted = token.scopes;
  try {
    const res = await fetchFn(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token.accessToken },
      body: JSON.stringify({ query: "{ shop { name } currentAppInstallation { accessScopes { handle } } }" }),
    });
    const json = (await res.json()) as { data?: { shop?: { name?: string }; currentAppInstallation?: { accessScopes?: { handle: string }[] } } };
    storeName = json.data?.shop?.name ?? domain;
    const handles = json.data?.currentAppInstallation?.accessScopes?.map((s) => s.handle);
    if (handles?.length) granted = handles;
  } catch {
    // Fall back to the scopes from the token response.
  }
  const missing = missingScopes(granted, [...DEFAULT_SHOPIFY_SCOPES]);
  if (missing.length) {
    return {
      ok: false,
      error: `Your Shopify app is missing these permissions: ${missing.map((m) => SCOPE_LABELS[m] ?? m).join(", ")}. Add them in your app's Admin API access settings, release a new version, then connect again.`,
    };
  }

  const { error } = await db
    .from("shops")
    .update({
      shopify_domain: domain,
      shopify_auth: "own_app",
      shopify_client_id: clientId,
      shopify_client_secret_enc: encrypt(clientSecret),
      shopify_token_enc: encrypt(token.accessToken),
      shopify_refresh_token_enc: null,
      shopify_token_expires_at: token.accessExpiresAt.toISOString(),
      shopify_refresh_expires_at: token.refreshExpiresAt.toISOString(),
      shopify_scopes: granted.join(","),
      shopify_connected_at: now.toISOString(),
      shopify_uninstalled_at: null,
    })
    .eq("id", shopId);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "This Shopify store is already connected to another AstaDesk account." };
    return { ok: false, error: "Couldn't save the connection. Please try again." };
  }
  return { ok: true, storeName };
}
