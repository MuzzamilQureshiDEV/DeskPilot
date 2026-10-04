import "server-only";

import { ShopifyProvider } from "@/lib/shopify/provider";
import { getShopifyAccessToken } from "@/lib/shopify/tokens";
import type { StoreProvider } from "@/lib/store/types";
import { createAdminClient } from "@/lib/supabase/admin";

/** Thrown by every call when a shop has no store connected. The agent escalates. */
export class StoreNotConnectedError extends Error {
  constructor() {
    super("No store is connected for this shop");
    this.name = "StoreNotConnectedError";
  }
}

const notConnected = (): Promise<never> => Promise.reject(new StoreNotConnectedError());

/**
 * Used for real conversations when Shopify isn't connected. It never falls
 * back to the sample store: real customers must never get made-up data.
 */
export const notConnectedProvider: StoreProvider = {
  kind: "not_connected",
  findOrders: notConnected,
  getOrder: notConnected,
  searchProducts: notConnected,
};

/**
 * The store provider for a real (non-sandbox) conversation. For background
 * jobs: uses the service role and filters by shop id.
 */
export async function storeProviderForShop(shopId: string): Promise<StoreProvider> {
  const { data, error } = await createAdminClient()
    .from("shops")
    .select("shopify_domain")
    .eq("id", shopId)
    .maybeSingle();
  if (error) throw new Error("Could not load store connection");
  if (!data?.shopify_domain) return notConnectedProvider;
  return new ShopifyProvider({ getToken: () => getShopifyAccessToken(shopId) });
}
