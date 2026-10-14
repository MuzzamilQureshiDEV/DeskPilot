import { SHOPIFY_API_VERSION } from "@/lib/shopify/config";

// "Test Shopify connection" on the Store page: three read-only checks against
// the store, each turned into a plain-language result. Pure apart from fetch.

export type CheckId = "store" | "products" | "orders";
export type CheckResult = { id: CheckId; label: string; ok: boolean; detail: string };

const CHECKS: { id: CheckId; label: string; query: string; okDetail: string }[] = [
  { id: "store", label: "Reach your store", query: "{ shop { name } }", okDetail: "AstaDesk can reach your store." },
  { id: "products", label: "Read products and stock", query: "{ products(first: 1) { nodes { id } } }", okDetail: "Ava can look up products, prices and stock." },
  { id: "orders", label: "Read orders", query: "{ orders(first: 1) { nodes { id } } }", okDetail: "Ava can look up orders and tracking." },
];

type GraphqlError = { message?: string; extensions?: { code?: string } };

/** A Shopify error, explained for the merchant. */
export function explainShopifyError(id: CheckId, status: number, errors: GraphqlError[]): string {
  if (status === 401 || status === 403) return "Shopify rejected AstaDesk's access. Reconnect your store below.";
  if (status === 402) return "Your Shopify store is frozen or unpaid, so Shopify won't answer.";
  if (status === 404) return "Shopify couldn't find this store. Check the store address and reconnect.";
  if (status >= 500 || status === 429) return "Shopify is busy right now. Try the test again in a minute.";
  const denied = errors.find((e) => e.extensions?.code === "ACCESS_DENIED");
  if (denied) {
    if (id === "orders" && /protected-customer-data|not approved to access/i.test(denied.message ?? "")) {
      return 'Shopify hasn\'t approved "Protected customer data" access for AstaDesk yet, so Ava can\'t read orders. In the Shopify Partner Dashboard open AstaDesk → API access → Protected customer data access, and request it with the reason "Customer service".';
    }
    return "AstaDesk doesn't have permission for this yet. Reconnect your store and approve every permission.";
  }
  return "Shopify returned an unexpected error. Try again, or reconnect your store.";
}

export async function checkShopifyConnection(
  conn: { domain: string; accessToken: string },
  fetchFn: typeof fetch = fetch,
): Promise<CheckResult[]> {
  return Promise.all(
    CHECKS.map(async (c): Promise<CheckResult> => {
      try {
        const res = await fetchFn(`https://${conn.domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": conn.accessToken },
          body: JSON.stringify({ query: c.query }),
        });
        const json = (await res.json().catch(() => ({}))) as { errors?: GraphqlError[] | string };
        const errors = Array.isArray(json.errors) ? json.errors : json.errors ? [{ message: String(json.errors) }] : [];
        if (!res.ok || errors.length > 0) return { id: c.id, label: c.label, ok: false, detail: explainShopifyError(c.id, res.status, errors) };
        return { id: c.id, label: c.label, ok: true, detail: c.okDetail };
      } catch {
        return { id: c.id, label: c.label, ok: false, detail: "Couldn't reach Shopify. Check your internet connection and try again." };
      }
    }),
  );
}
