// Pinned Admin GraphQL API version. Bump deliberately and re-test queries.
// 2026-10 was the latest stable version when checked on 2026-10-03.
export const SHOPIFY_API_VERSION = "2026-10";

export function adminGraphqlUrl(shopDomain: string): string {
  return `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
}

/** Scopes from CLAUDE.md §8, used when SHOPIFY_SCOPES isn't set. */
export const DEFAULT_SHOPIFY_SCOPES = [
  "read_orders",
  "write_orders",
  "read_products",
  "read_customers",
  "read_fulfillments",
  "read_merchant_managed_fulfillment_orders",
] as const;

/** OAuth callback path, registered as the app's redirect URL. */
export const SHOPIFY_CALLBACK_PATH = "/api/shopify/callback";
