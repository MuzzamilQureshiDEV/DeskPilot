import { describe, expect, it, vi } from "vitest";

import {
  matchesOrderNumber,
  money,
  productSearchQuery,
  ShopifyProvider,
} from "@/lib/shopify/provider";

const NOW = new Date("2026-10-04T12:00:00Z");
const set = (amount: string) => ({ shopMoney: { amount, currencyCode: "USD" } });

const summaryNode = (over: Record<string, unknown> = {}) => ({
  id: "gid://shopify/Order/1",
  name: "#1001",
  email: "jane@example.com",
  createdAt: "2026-10-01T10:00:00Z",
  cancelledAt: null,
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: "UNFULFILLED",
  customer: { displayName: "Jane Doe" },
  totalPriceSet: set("120.0"),
  ...over,
});

const lineItem = (id: string, quantity: number, unfulfilled: number, refundable = quantity) => ({
  id,
  title: `Item ${id}`,
  variantTitle: "M",
  sku: `SKU-${id}`,
  quantity,
  refundableQuantity: refundable,
  unfulfilledQuantity: unfulfilled,
  originalUnitPriceSet: set("60.0"),
});

const fulfillment = (over: Record<string, unknown> = {}) => ({
  id: "gid://shopify/Fulfillment/9",
  status: "SUCCESS",
  displayStatus: "IN_TRANSIT",
  createdAt: "2026-10-02T09:00:00Z",
  inTransitAt: "2026-10-02T12:00:00Z",
  estimatedDeliveryAt: "2026-10-06T12:00:00Z",
  deliveredAt: null,
  trackingInfo: [{ company: "UPS", number: "1Z999", url: "https://ups.example/1Z999" }],
  fulfillmentLineItems: { nodes: [{ quantity: 1, lineItem: { id: "gid://shopify/LineItem/a" } }] },
  ...over,
});

const detailNode = (over: Record<string, unknown> = {}) => ({
  ...summaryNode(),
  subtotalPriceSet: set("120.0"),
  totalShippingPriceSet: set("0.0"),
  totalRefundedSet: set("0.0"),
  shippingAddress: {
    name: "Jane Doe",
    address1: "1 Main St",
    address2: null,
    city: "Austin",
    province: "TX",
    zip: "78701",
    country: "United States",
    countryCodeV2: "US",
  },
  lineItems: { nodes: [lineItem("gid://shopify/LineItem/a", 1, 0), lineItem("gid://shopify/LineItem/b", 1, 1)] },
  fulfillments: [fulfillment()],
  refunds: [],
  ...over,
});

/** Provider whose fetch replies with the given GraphQL `data` objects in order. */
function provider(...datas: unknown[]) {
  const fetchFn = vi.fn<typeof fetch>(async () => {
    const data = datas.shift();
    return new Response(JSON.stringify({ data }), { status: 200 });
  });
  const p = new ShopifyProvider({
    getToken: async () => ({ domain: "s.myshopify.com", accessToken: "tok" }),
    fetchFn,
    sleep: async () => {},
    now: () => NOW,
  });
  const variables = (i: number) => JSON.parse(String(fetchFn.mock.calls[i]?.[1]?.body)).variables;
  return { p, fetchFn, variables };
}

describe("findOrders", () => {
  it("searches by email and re-checks email and number in code", async () => {
    const { p, variables } = provider({
      orders: {
        nodes: [
          summaryNode(),
          summaryNode({ id: "gid://shopify/Order/2", name: "#1002" }),
          summaryNode({ id: "gid://shopify/Order/3", email: "someone-else@example.com" }),
        ],
      },
    });
    const res = await p.findOrders({ orderNumber: "1001", email: "Jane@Example.com" });
    expect(variables(0)).toEqual({ query: 'email:"jane@example.com"' });
    expect(res.map((o) => o.name)).toEqual(["#1001"]);
    expect(res[0]).toMatchObject({ customerName: "Jane Doe", total: { amount: "120.00", currency: "USD" } });
  });

  it("fails closed when Shopify hides the order email", async () => {
    const { p } = provider({ orders: { nodes: [summaryNode({ email: null })] } });
    expect(await p.findOrders({ email: "jane@example.com" })).toEqual([]);
  });

  it("returns nothing without filters, without calling Shopify", async () => {
    const { p, fetchFn } = provider();
    expect(await p.findOrders({})).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("strips quotes so customer text can't break out of the search value", async () => {
    const { p, variables } = provider({ orders: { nodes: [] } });
    await p.findOrders({ email: 'x@y.com" OR email:"victim@z.com' });
    expect(variables(0).query).toBe('email:"x@y.com or email:victim@z.com"');
  });
});

describe("getOrder", () => {
  it("maps a partially shipped, in-transit order", async () => {
    const { p } = provider({ order: detailNode() });
    const o = await p.getOrder("gid://shopify/Order/1");
    expect(o).toMatchObject({
      name: "#1001",
      financialStatus: "paid",
      fulfillmentStatus: "partially_fulfilled",
      cancellable: false,
      subtotal: { amount: "120.00" },
      shippingAddress: { city: "Austin", countryCode: "US" },
    });
    expect(o?.fulfillments[0]).toMatchObject({
      status: "in_transit",
      carrier: "UPS",
      trackingNumber: "1Z999",
      delayed: false,
      shippedAt: "2026-10-02T12:00:00Z",
    });
  });

  it("flags delays from Shopify's status or a passed estimate", async () => {
    const late = await provider({ order: detailNode({ fulfillments: [fulfillment({ estimatedDeliveryAt: "2026-10-03T00:00:00Z" })] }) })
      .p.getOrder("gid://shopify/Order/1");
    expect(late?.fulfillments[0]?.delayed).toBe(true);
    const flagged = await provider({ order: detailNode({ fulfillments: [fulfillment({ displayStatus: "DELAYED", estimatedDeliveryAt: null })] }) })
      .p.getOrder("gid://shopify/Order/1");
    expect(flagged?.fulfillments[0]).toMatchObject({ status: "in_transit", delayed: true });
  });

  it("is cancellable only before anything ships", async () => {
    const unshipped = detailNode({
      displayFulfillmentStatus: "UNFULFILLED",
      lineItems: { nodes: [lineItem("gid://shopify/LineItem/a", 2, 2)] },
      fulfillments: [],
    });
    expect((await provider({ order: unshipped }).p.getOrder("gid://shopify/Order/1"))?.cancellable).toBe(true);
    expect((await provider({ order: { ...unshipped, cancelledAt: "2026-10-03T00:00:00Z" } }).p.getOrder("gid://shopify/Order/1"))?.cancellable).toBe(false);
    expect((await provider({ order: { ...unshipped, displayFinancialStatus: "REFUNDED" } }).p.getOrder("gid://shopify/Order/1"))?.cancellable).toBe(false);
  });

  it("ignores cancelled shipments and handles missing tracking and address", async () => {
    const o = await provider({
      order: detailNode({
        shippingAddress: null,
        fulfillments: [
          fulfillment({ status: "CANCELLED" }),
          fulfillment({ id: "f2", displayStatus: "MARKED_AS_FULFILLED", trackingInfo: [], estimatedDeliveryAt: null }),
        ],
      }),
    }).p.getOrder("gid://shopify/Order/1");
    expect(o?.fulfillments).toHaveLength(1);
    expect(o?.fulfillments[0]).toMatchObject({ status: "shipped", carrier: null, trackingNumber: null, delayed: false });
    expect(o?.shippingAddress).toBeNull();
  });

  it("refuses ids that aren't Shopify order ids, without calling Shopify", async () => {
    const { p, fetchFn } = provider();
    expect(await p.getOrder("gid://sandbox/Order/1001")).toBeNull();
    expect(await p.getOrder("gid://shopify/Customer/5")).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns null for unknown orders and rejects malformed responses", async () => {
    expect(await provider({ order: null }).p.getOrder("gid://shopify/Order/404")).toBeNull();
    await expect(provider({ order: { id: 1 } }).p.getOrder("gid://shopify/Order/1")).rejects.toThrow();
  });
});

describe("searchProducts", () => {
  const product = {
    id: "gid://shopify/Product/1",
    title: "Trail Jacket",
    description: "Waterproof.",
    productType: "Jacket",
    tags: ["rain"],
    tracksInventory: true,
    totalInventory: 3,
    priceRangeV2: { minVariantPrice: { amount: "149.0", currencyCode: "USD" }, maxVariantPrice: { amount: "149.0", currencyCode: "USD" } },
    variants: {
      nodes: [
        { id: "v1", title: "M", sku: "TJ-M", price: "149.0", inventoryQuantity: 3, availableForSale: true },
        { id: "v2", title: "L", sku: null, price: "149.0", inventoryQuantity: 0, availableForSale: false },
      ],
    },
  };

  it("maps stock per size and only searches active products", async () => {
    const { p, variables } = provider({ products: { nodes: [product] } });
    const [res] = await p.searchProducts("rain jacket?");
    expect(variables(0)).toEqual({ query: "status:active (rain OR jacket)" });
    expect(res).toMatchObject({ title: "Trail Jacket", totalInventory: 3, available: true, priceRange: { min: { amount: "149.00" } } });
    expect(res?.variants.map((v) => [v.title, v.inventory, v.available])).toEqual([
      ["M", 3, true],
      ["L", 0, false],
    ]);
  });

  it("reports untracked stock as null rather than zero", async () => {
    const untracked = { ...product, tracksInventory: false, variants: { nodes: [{ ...product.variants.nodes[0], title: "Default Title" }] } };
    const [res] = await provider({ products: { nodes: [untracked] } }).p.searchProducts("jacket");
    expect(res?.totalInventory).toBeNull();
    expect(res?.variants[0]).toMatchObject({ title: "One size", inventory: null, available: true });
  });
});

describe("helpers", () => {
  it("productSearchQuery drops operators and filler words, and adds singulars", () => {
    // Operators can't survive: colons and quotes are stripped, "or" is filler.
    expect(productSearchQuery('status:draft OR vendor:"x"')).toBe("status:active (status OR draft OR vendor)");
    expect(productSearchQuery("Hi! Do you have any snowboards in stock?")).toBe("status:active (snowboards OR snowboard)");
    expect(productSearchQuery("  ??  ")).toBeNull();
    expect(productSearchQuery("do you have any?")).toBeNull();
  });

  it("matchesOrderNumber handles # and store prefixes", () => {
    expect(matchesOrderNumber("#1001", "1001")).toBe(true);
    expect(matchesOrderNumber("#HP1001", "1001")).toBe(true);
    expect(matchesOrderNumber("#1001", "#1002")).toBe(false);
    expect(matchesOrderNumber("#1001", "")).toBe(false);
  });

  it("money normalises Shopify decimals", () => {
    expect(money("600.0", "USD")).toEqual({ amount: "600.00", currency: "USD" });
    expect(money("12.345", "EUR").amount).toBe("12.35");
  });
});
