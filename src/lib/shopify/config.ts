// Pinned Admin GraphQL API version. Bump deliberately and re-test queries.
export const SHOPIFY_API_VERSION = "2026-07";

export function adminGraphqlUrl(shopDomain: string): string {
  return `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
}
