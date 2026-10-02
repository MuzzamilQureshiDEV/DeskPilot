import { buildSandboxStore, type SandboxStore } from "@/lib/sandbox/data";
import type {
  OrderDetail,
  OrderQuery,
  OrderSummary,
  ProductSummary,
  StoreProvider,
} from "@/lib/store/types";

const MAX_PRODUCT_RESULTS = 5;

/** "#1001", "1001", " # 1001 " → "1001". */
export function normalizeOrderNumber(value: string): string {
  return value.replace(/[#\s]/g, "").toLowerCase();
}

const normalizeEmail = (value: string) => value.trim().toLowerCase();

function toSummary(order: OrderDetail): OrderSummary {
  const { id, name, email, customerName, createdAt, financialStatus, fulfillmentStatus, cancelledAt, total } =
    order;
  return { id, name, email, customerName, createdAt, financialStatus, fulfillmentStatus, cancelledAt, total };
}

const tokenize = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** Simple relevance: title hits weigh most, then type/tags, then description and sizes. */
function scoreProduct(product: ProductSummary, terms: string[]): number {
  const title = new Set(tokenize(product.title));
  const meta = new Set(tokenize(`${product.productType} ${product.tags.join(" ")}`));
  const body = new Set(tokenize(`${product.description} ${product.variants.map((v) => v.title).join(" ")}`));
  return terms.reduce((score, term) => {
    // Light stemming so "jackets" matches "jacket".
    const forms = term.endsWith("s") && term.length > 3 ? [term, term.slice(0, -1)] : [term];
    if (forms.some((f) => title.has(f))) return score + 3;
    if (forms.some((f) => meta.has(f))) return score + 2;
    if (forms.some((f) => body.has(f))) return score + 1;
    return score;
  }, 0);
}

/**
 * Read-only provider backed by the fictional Harbor & Pine store.
 * Used by the Test page and by shops that haven't connected Shopify.
 */
export class SandboxProvider implements StoreProvider {
  readonly kind = "sandbox" as const;
  private readonly store: SandboxStore;

  constructor(store: SandboxStore = buildSandboxStore()) {
    this.store = store;
  }

  async findOrders(query: OrderQuery): Promise<OrderSummary[]> {
    const number = query.orderNumber ? normalizeOrderNumber(query.orderNumber) : "";
    const email = query.email ? normalizeEmail(query.email) : "";
    if (!number && !email) return [];

    return this.store.orders
      .filter((o) => !number || normalizeOrderNumber(o.name) === number)
      .filter((o) => !email || normalizeEmail(o.email) === email)
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => structuredClone(toSummary(o)));
  }

  async getOrder(id: string): Promise<OrderDetail | null> {
    const order = this.store.orders.find((o) => o.id === id);
    return order ? structuredClone(order) : null;
  }

  async searchProducts(query: string): Promise<ProductSummary[]> {
    const terms = tokenize(query);
    if (terms.length === 0) return [];

    return this.store.products
      .map((product) => ({ product, score: scoreProduct(product, terms) }))
      .filter((r) => r.score > 0)
      .toSorted((a, b) => b.score - a.score)
      .slice(0, MAX_PRODUCT_RESULTS)
      .map((r) => structuredClone(r.product));
  }

  /** Policy/FAQ/brand entries for this store (the sandbox's "knowledge" table). */
  knowledge() {
    return structuredClone(this.store.knowledge);
  }
}
