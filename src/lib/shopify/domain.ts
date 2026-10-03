// Pure Shopify store-address helpers, safe for client code (live preview on the
// Store page). The server re-validates everything.

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/**
 * Accepts "my-store", "my-store.myshopify.com", "https://my-store.myshopify.com/admin"
 * or "https://admin.shopify.com/store/my-store". Returns the canonical
 * "my-store.myshopify.com", or null if it isn't a valid Shopify store domain.
 */
export function normalizeShopDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value || value.length > 255) return null;

  if (/^https?:\/\//.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    const adminHandle = url.hostname === "admin.shopify.com" ? url.pathname.match(/^\/store\/([a-z0-9-]+)/)?.[1] : null;
    value = adminHandle ?? url.hostname;
  } else if (value.startsWith("admin.shopify.com/store/")) {
    value = value.slice("admin.shopify.com/store/".length).split(/[/?#]/)[0] ?? "";
  }

  if (!value.includes(".")) value = `${value}.myshopify.com`;
  return SHOP_DOMAIN.test(value) ? value : null;
}

/** "my-cool-store.myshopify.com" → "My Cool Store" (signup prefill). */
export function storeNameFromDomain(domain: string): string {
  return (domain.split(".")[0] ?? "")
    .split("-")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}
