import { z } from "zod";

import { shopifyGraphql } from "@/lib/shopify/client";
import { FIND_ORDERS, GET_ORDER, SEARCH_PRODUCTS } from "@/lib/shopify/queries";
import type {
  Address,
  FinancialStatus,
  Fulfillment,
  Money,
  OrderDetail,
  OrderQuery,
  OrderSummary,
  ProductSummary,
  ShipmentStatus,
  StoreProvider,
} from "@/lib/store/types";

// StoreProvider backed by the Shopify Admin GraphQL API. Every response is
// validated with Zod before use (Shopify data is external input).

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

const moneySet = z.object({ shopMoney: z.object({ amount: z.string(), currencyCode: z.string() }) });

const orderSummaryNode = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  createdAt: z.string(),
  cancelledAt: z.string().nullable(),
  displayFinancialStatus: z.string().nullable(),
  displayFulfillmentStatus: z.string(),
  customer: z.object({ displayName: z.string() }).nullable(),
  totalPriceSet: moneySet,
});

const orderDetailNode = orderSummaryNode.extend({
  subtotalPriceSet: moneySet.nullable(),
  totalShippingPriceSet: moneySet,
  totalRefundedSet: moneySet,
  shippingAddress: z
    .object({
      name: z.string().nullable(),
      address1: z.string().nullable(),
      address2: z.string().nullable(),
      city: z.string().nullable(),
      province: z.string().nullable(),
      zip: z.string().nullable(),
      country: z.string().nullable(),
      countryCodeV2: z.string().nullable(),
    })
    .nullable(),
  lineItems: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        variantTitle: z.string().nullable(),
        sku: z.string().nullable(),
        quantity: z.number(),
        refundableQuantity: z.number(),
        unfulfilledQuantity: z.number(),
        originalUnitPriceSet: moneySet,
      }),
    ),
  }),
  fulfillments: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      displayStatus: z.string().nullable(),
      createdAt: z.string(),
      inTransitAt: z.string().nullable(),
      estimatedDeliveryAt: z.string().nullable(),
      deliveredAt: z.string().nullable(),
      trackingInfo: z.array(
        z.object({ company: z.string().nullable(), number: z.string().nullable(), url: z.string().nullable() }),
      ),
      fulfillmentLineItems: z.object({
        nodes: z.array(z.object({ quantity: z.number(), lineItem: z.object({ id: z.string() }) })),
      }),
    }),
  ),
  refunds: z.array(
    z.object({ id: z.string(), createdAt: z.string(), note: z.string().nullable(), totalRefundedSet: moneySet }),
  ),
});

const productNode = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  productType: z.string(),
  tags: z.array(z.string()),
  tracksInventory: z.boolean(),
  totalInventory: z.number().nullable(),
  priceRangeV2: z.object({
    minVariantPrice: z.object({ amount: z.string(), currencyCode: z.string() }),
    maxVariantPrice: z.object({ amount: z.string(), currencyCode: z.string() }),
  }),
  variants: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        sku: z.string().nullable(),
        price: z.string(),
        inventoryQuantity: z.number().nullable(),
        availableForSale: z.boolean(),
      }),
    ),
  }),
});

const findOrdersResponse = z.object({ orders: z.object({ nodes: z.array(orderSummaryNode) }) });
const getOrderResponse = z.object({ order: orderDetailNode.nullable() });
const searchProductsResponse = z.object({ products: z.object({ nodes: z.array(productNode) }) });

type OrderSummaryNode = z.infer<typeof orderSummaryNode>;
type OrderDetailNode = z.infer<typeof orderDetailNode>;
type ProductNode = z.infer<typeof productNode>;

// ---------------------------------------------------------------------------
// Mapping (pure, exported for tests)
// ---------------------------------------------------------------------------

/** "600.0" → "600.00". */
export function money(amount: string, currency: string): Money {
  return { amount: (Math.round(Number(amount) * 100) / 100).toFixed(2), currency };
}
const fromSet = (s: z.infer<typeof moneySet>) => money(s.shopMoney.amount, s.shopMoney.currencyCode);

const FINANCIAL: Record<string, FinancialStatus> = {
  PENDING: "pending",
  AUTHORIZED: "authorized",
  PARTIALLY_PAID: "partially_paid",
  PAID: "paid",
  PARTIALLY_REFUNDED: "partially_refunded",
  REFUNDED: "refunded",
  VOIDED: "voided",
  EXPIRED: "expired",
};

const SHIPMENT: Record<string, ShipmentStatus | null> = {
  CONFIRMED: "label_created",
  LABEL_PRINTED: "label_created",
  LABEL_PURCHASED: "label_created",
  SUBMITTED: "label_created",
  CARRIER_PICKED_UP: "in_transit",
  IN_TRANSIT: "in_transit",
  DELAYED: "in_transit",
  OUT_FOR_DELIVERY: "out_for_delivery",
  ATTEMPTED_DELIVERY: "attempted_delivery",
  DELIVERED: "delivered",
  PICKED_UP: "delivered",
  READY_FOR_PICKUP: "shipped",
  FULFILLED: "shipped",
  MARKED_AS_FULFILLED: "shipped",
  FAILURE: "failure",
  NOT_DELIVERED: "failure",
  LABEL_VOIDED: "failure",
  CANCELED: null,
};

/** Fulfillment records that never shipped anything. */
const DEAD_FULFILLMENT = new Set(["CANCELLED", "ERROR", "FAILURE"]);

/** "#1001", "1001", "#HP-1001" → "1001"-style key for comparing order numbers. */
export function orderNumberKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
const digits = (value: string) => value.replace(/\D/g, "");

/** True if the customer's order number refers to this order name (handles store prefixes). */
export function matchesOrderNumber(orderName: string, input: string): boolean {
  const a = orderNumberKey(orderName);
  const b = orderNumberKey(input);
  if (!b) return false;
  return a === b || (digits(b).length > 0 && digits(a) === digits(b));
}

function toSummary(n: OrderSummaryNode): OrderSummary {
  return {
    id: n.id,
    name: n.name,
    email: n.email ?? "",
    customerName: n.customer?.displayName ?? "",
    createdAt: n.createdAt,
    financialStatus: FINANCIAL[n.displayFinancialStatus ?? ""] ?? "pending",
    // Detail views recompute this from line items.
    fulfillmentStatus:
      n.displayFulfillmentStatus === "FULFILLED"
        ? "fulfilled"
        : n.displayFulfillmentStatus === "PARTIALLY_FULFILLED"
          ? "partially_fulfilled"
          : "unfulfilled",
    cancelledAt: n.cancelledAt,
    total: fromSet(n.totalPriceSet),
  };
}

function toAddress(a: OrderDetailNode["shippingAddress"]): Address | null {
  if (!a?.address1) return null;
  return {
    name: a.name ?? "",
    address1: a.address1,
    ...(a.address2 ? { address2: a.address2 } : {}),
    city: a.city ?? "",
    province: a.province ?? "",
    zip: a.zip ?? "",
    country: a.country ?? "",
    countryCode: a.countryCodeV2 ?? "",
  };
}

export function toDetail(n: OrderDetailNode, now: Date): OrderDetail {
  const lineItems = n.lineItems.nodes.map((li) => ({
    id: li.id,
    title: li.title,
    variantTitle: li.variantTitle && li.variantTitle !== "Default Title" ? li.variantTitle : null,
    sku: li.sku ?? "",
    quantity: li.quantity,
    refundableQuantity: li.refundableQuantity,
    unfulfilledQuantity: li.unfulfilledQuantity,
    price: fromSet(li.originalUnitPriceSet),
  }));

  const fulfillments = n.fulfillments
    .filter((f) => !DEAD_FULFILLMENT.has(f.status) && SHIPMENT[f.displayStatus ?? ""] !== null)
    .map((f): Fulfillment => {
      const status = SHIPMENT[f.displayStatus ?? ""] ?? "shipped";
      const tracking = f.trackingInfo[0];
      const pending = status === "label_created" || status === "in_transit" || status === "shipped";
      const etaPassed = f.estimatedDeliveryAt !== null && new Date(f.estimatedDeliveryAt) < now;
      return {
        id: f.id,
        status,
        carrier: tracking?.company ?? null,
        trackingNumber: tracking?.number ?? null,
        trackingUrl: tracking?.url ?? null,
        shippedAt: f.inTransitAt ?? f.createdAt,
        estimatedDeliveryAt: f.estimatedDeliveryAt,
        deliveredAt: f.deliveredAt,
        delayed: f.displayStatus === "DELAYED" || (pending && etaPassed),
        lineItems: f.fulfillmentLineItems.nodes.map((x) => ({ lineItemId: x.lineItem.id, quantity: x.quantity })),
      };
    });

  const totalQty = lineItems.reduce((s, li) => s + li.quantity, 0);
  const unshipped = lineItems.reduce((s, li) => s + li.unfulfilledQuantity, 0);
  const shipped = Math.max(totalQty - unshipped, 0);
  const summary = toSummary(n);
  const currency = n.totalPriceSet.shopMoney.currencyCode;

  return {
    ...summary,
    fulfillmentStatus:
      fulfillments.length === 0 && shipped === 0 ? "unfulfilled" : unshipped === 0 ? "fulfilled" : "partially_fulfilled",
    lineItems,
    fulfillments,
    refunds: n.refunds.map((r) => ({ id: r.id, createdAt: r.createdAt, note: r.note, amount: fromSet(r.totalRefundedSet) })),
    shippingAddress: toAddress(n.shippingAddress),
    subtotal: n.subtotalPriceSet ? fromSet(n.subtotalPriceSet) : money("0", currency),
    shipping: fromSet(n.totalShippingPriceSet),
    totalRefunded: fromSet(n.totalRefundedSet),
    cancellable:
      n.cancelledAt === null &&
      fulfillments.length === 0 &&
      shipped === 0 &&
      summary.financialStatus !== "refunded" &&
      summary.financialStatus !== "voided",
  };
}

export function toProduct(p: ProductNode): ProductSummary {
  const currency = p.priceRangeV2.minVariantPrice.currencyCode;
  const variants = p.variants.nodes.map((v) => ({
    id: v.id,
    title: v.title === "Default Title" ? "One size" : v.title,
    sku: v.sku ?? "",
    price: money(v.price, currency),
    inventory: p.tracksInventory ? (v.inventoryQuantity ?? 0) : null,
    available: v.availableForSale,
  }));
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    productType: p.productType,
    tags: p.tags,
    priceRange: {
      min: money(p.priceRangeV2.minVariantPrice.amount, currency),
      max: money(p.priceRangeV2.maxVariantPrice.amount, p.priceRangeV2.maxVariantPrice.currencyCode),
    },
    variants,
    totalInventory: p.tracksInventory ? (p.totalInventory ?? 0) : null,
    available: variants.some((v) => v.available),
  };
}

/** Quotes a value for Shopify search syntax. */
function quoted(value: string): string {
  return `"${value.replace(/["\\]/g, "")}"`;
}

/** Filler words customers type that would otherwise have to match a product. */
const SEARCH_STOP_WORDS = new Set(
  ("a an and any are can could do does for from have hi hello hey i in is it me my of on or not please " +
    "show sell stock still that the there this to want what which with you your available looking need get buy got")
    .split(" "),
);

/**
 * Builds a Shopify product search from customer text: plain words only (so it
 * can't inject operators like "status:draft"), filler words dropped, plural
 * and singular forms, any word may match (results are sorted by relevance).
 */
export function productSearchQuery(text: string): string | null {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (w) => w.length > 1 && !SEARCH_STOP_WORDS.has(w),
  );
  const forms = new Set<string>();
  for (const w of words.slice(0, 6)) {
    forms.add(w);
    // Simple singular: boots → boot, but not glass/status/chassis.
    if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) forms.add(w.slice(0, -1));
  }
  return forms.size > 0 ? `status:active (${[...forms].join(" OR ")})` : null;
}

const SHOPIFY_ORDER_ID = /^gid:\/\/shopify\/Order\/\d+$/;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export type ShopifyProviderDeps = {
  /** Returns a valid token, refreshing if needed (see getShopifyAccessToken). */
  getToken: () => Promise<{ domain: string; accessToken: string }>;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
};

export class ShopifyProvider implements StoreProvider {
  readonly kind = "shopify" as const;

  constructor(private readonly deps: ShopifyProviderDeps) {}

  private async query<T>(query: string, variables: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    const { domain, accessToken } = await this.deps.getToken();
    const data = await shopifyGraphql<unknown>({
      domain,
      accessToken,
      query,
      variables,
      fetchFn: this.deps.fetchFn,
      sleep: this.deps.sleep,
    });
    return schema.parse(data);
  }

  async findOrders(q: OrderQuery): Promise<OrderSummary[]> {
    const email = q.email?.trim().toLowerCase() ?? "";
    const number = q.orderNumber?.trim() ?? "";
    if (!email && !number) return [];

    // Search by email when we have it (precise), otherwise by order name;
    // both filters are then re-checked here, so nothing slips through.
    const search = email ? `email:${quoted(email)}` : `name:${quoted(number.replace(/^#/, ""))}`;
    const data = await this.query(FIND_ORDERS, { query: search }, findOrdersResponse);

    return data.orders.nodes
      .filter((n) => !email || n.email?.toLowerCase() === email) // no email visible → no match
      .filter((n) => !number || matchesOrderNumber(n.name, number))
      .map(toSummary);
  }

  async getOrder(id: string): Promise<OrderDetail | null> {
    if (!SHOPIFY_ORDER_ID.test(id)) return null;
    const data = await this.query(GET_ORDER, { id }, getOrderResponse);
    return data.order ? toDetail(data.order, this.deps.now?.() ?? new Date()) : null;
  }

  async searchProducts(text: string): Promise<ProductSummary[]> {
    const search = productSearchQuery(text);
    if (!search) return [];
    const data = await this.query(SEARCH_PRODUCTS, { query: search }, searchProductsResponse);
    return data.products.nodes.map(toProduct);
  }
}
