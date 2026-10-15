import "server-only";

import { decrypt, encrypt } from "@/lib/crypto";
import {
  clientCredentialsToken,
  refreshAccessToken,
  shopifyAppConfig,
  ShopifyTokenError,
  type FetchFn,
  type ShopifyAppConfig,
  type ShopifyTokens,
} from "@/lib/shopify/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

// Access to a shop's Shopify token for background jobs and providers.
// Uses the service-role client and always filters by shop id.

/** Refresh when the access token has less than this left. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export class ShopifyNotConnected extends Error {
  constructor() {
    super("Shopify is not connected for this shop");
    this.name = "ShopifyNotConnected";
  }
}

/** The refresh token expired or was revoked: the merchant must reconnect on the Store page. */
export class ShopifyReauthRequired extends Error {
  constructor() {
    super("Shopify connection expired; reconnect required");
    this.name = "ShopifyReauthRequired";
  }
}

export type StoredTokens = {
  domain: string;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  /** "own_app": the store's own private app (client credentials), no refresh token. */
  auth?: "oauth" | "own_app";
  clientId?: string | null;
  clientSecretEnc?: string | null;
};

/** Persistence for tokens. The default uses Supabase; tests pass a fake. */
export type TokenStore = {
  load(shopId: string): Promise<StoredTokens | null>;
  save(shopId: string, tokens: ShopifyTokens): Promise<void>;
  /** Own-app credentials stopped working: show "needs reconnecting". */
  markBroken?(shopId: string): Promise<void>;
};

export const supabaseTokenStore: TokenStore = {
  async load(shopId) {
    const { data, error } = await createAdminClient()
      .from("shops")
      .select("shopify_domain, shopify_token_enc, shopify_refresh_token_enc, shopify_token_expires_at, shopify_refresh_expires_at, shopify_auth, shopify_client_id, shopify_client_secret_enc")
      .eq("id", shopId)
      .maybeSingle();
    if (error) throw new Error("Could not load Shopify connection");
    if (!data?.shopify_domain || !data.shopify_token_enc || !data.shopify_token_expires_at || !data.shopify_refresh_expires_at) return null;
    const ownApp = data.shopify_auth === "own_app";
    if (ownApp ? !data.shopify_client_id || !data.shopify_client_secret_enc : !data.shopify_refresh_token_enc) return null;
    return {
      domain: data.shopify_domain,
      accessTokenEnc: data.shopify_token_enc,
      refreshTokenEnc: data.shopify_refresh_token_enc ?? "",
      accessExpiresAt: new Date(data.shopify_token_expires_at),
      refreshExpiresAt: new Date(data.shopify_refresh_expires_at),
      auth: ownApp ? "own_app" : "oauth",
      clientId: data.shopify_client_id,
      clientSecretEnc: data.shopify_client_secret_enc,
    };
  },
  async save(shopId, t) {
    const { error } = await createAdminClient()
      .from("shops")
      .update({
        shopify_token_enc: encrypt(t.accessToken),
        shopify_refresh_token_enc: t.refreshToken ? encrypt(t.refreshToken) : null,
        shopify_token_expires_at: t.accessExpiresAt.toISOString(),
        shopify_refresh_expires_at: t.refreshExpiresAt.toISOString(),
        shopify_scopes: t.scopes.join(","),
      })
      .eq("id", shopId);
    if (error) throw new Error("Could not save refreshed Shopify token");
  },
  async markBroken(shopId) {
    await createAdminClient().from("shops").update({ shopify_refresh_expires_at: new Date().toISOString() }).eq("id", shopId);
  },
};

export type TokenDeps = {
  store: TokenStore;
  config: ShopifyAppConfig | null;
  decrypt: (blob: string) => string;
  fetchFn: FetchFn;
  now: () => Date;
};

const defaultDeps = (): TokenDeps => ({
  store: supabaseTokenStore,
  config: shopifyAppConfig(),
  decrypt,
  fetchFn: fetch,
  now: () => new Date(),
});

// One refresh per shop at a time within this process.
const inflight = new Map<string, Promise<{ domain: string; accessToken: string }>>();

/**
 * Returns a valid access token for the shop, refreshing (and saving the
 * rotated pair) when it's about to expire.
 */
export async function getShopifyAccessToken(
  shopId: string,
  deps: TokenDeps = defaultDeps(),
): Promise<{ domain: string; accessToken: string }> {
  const stored = await deps.store.load(shopId);
  if (!stored) throw new ShopifyNotConnected();

  const now = deps.now();
  if (stored.accessExpiresAt.getTime() - now.getTime() > REFRESH_MARGIN_MS) {
    return { domain: stored.domain, accessToken: deps.decrypt(stored.accessTokenEnc) };
  }
  if (stored.refreshExpiresAt.getTime() <= now.getTime()) throw new ShopifyReauthRequired();

  const pending = inflight.get(shopId);
  if (pending) return pending;

  const run = (async () => {
    let fresh: ShopifyTokens;
    try {
      if (stored.auth === "own_app") {
        // The store's own private app: a new 24-hour token from its client credentials.
        fresh = await clientCredentialsToken(stored.domain, stored.clientId ?? "", deps.decrypt(stored.clientSecretEnc ?? ""), deps.fetchFn, now);
      } else {
        if (!deps.config) throw new Error("Shopify app credentials are not configured");
        fresh = await refreshAccessToken(deps.config, stored.domain, deps.decrypt(stored.refreshTokenEnc), deps.fetchFn, now);
      }
    } catch (err) {
      // 400/401: refresh token or app credentials rejected (revoked, rotated away, app uninstalled).
      if (err instanceof ShopifyTokenError && (err.status === 400 || err.status === 401)) {
        if (stored.auth === "own_app") await deps.store.markBroken?.(shopId);
        throw new ShopifyReauthRequired();
      }
      throw err;
    }
    await deps.store.save(shopId, fresh);
    return { domain: stored.domain, accessToken: fresh.accessToken };
  })();

  inflight.set(shopId, run);
  try {
    return await run;
  } finally {
    inflight.delete(shopId);
  }
}
