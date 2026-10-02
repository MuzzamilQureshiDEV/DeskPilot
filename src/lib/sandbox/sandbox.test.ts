import { describe, expect, it } from "vitest";

import {
  buildSandboxStore,
  SANDBOX_CUSTOMERS,
  SANDBOX_KNOWLEDGE,
  SANDBOX_SHIPPING_COUNTRIES,
} from "@/lib/sandbox/data";
import { normalizeOrderNumber, SandboxProvider } from "@/lib/sandbox/provider";
import type { OrderDetail } from "@/lib/store/types";

const NOW = new Date("2026-10-02T12:00:00Z");
const store = buildSandboxStore(NOW);
const provider = new SandboxProvider(store);
const cents = (amount: string) => Math.round(Number(amount) * 100);
const order = (n: number): OrderDetail => {
  const o = store.orders.find((x) => x.name === `#${n}`);
  if (!o) throw new Error(`order #${n} missing`);
  return o;
};

describe("sandbox data", () => {
  it("matches the spec's shape", () => {
    expect(store.name).toBe("Harbor & Pine Outfitters");
    expect(store.products).toHaveLength(12);
    expect(store.products.filter((p) => !p.available)).toHaveLength(2);
    expect(store.products.every((p) => p.variants.length > 0)).toBe(true);
    expect(SANDBOX_CUSTOMERS).toHaveLength(10);
    expect(store.orders).toHaveLength(15);
    expect(SANDBOX_SHIPPING_COUNTRIES).toHaveLength(20);
  });

  it("covers every support scenario", () => {
    const has = (pred: (o: OrderDetail) => boolean) => store.orders.some(pred);
    expect(has((o) => o.cancellable)).toBe(true);
    expect(has((o) => o.fulfillments.some((f) => f.status === "in_transit" && !f.delayed))).toBe(true);
    expect(has((o) => o.fulfillments.some((f) => f.status === "delivered"))).toBe(true);
    expect(has((o) => o.fulfillments.some((f) => f.delayed))).toBe(true);
    expect(has((o) => o.fulfillmentStatus === "partially_fulfilled")).toBe(true);
    expect(has((o) => o.financialStatus === "refunded" && o.cancelledAt === null)).toBe(true);
    expect(has((o) => o.financialStatus === "partially_refunded")).toBe(true);
    expect(has((o) => o.cancelledAt !== null)).toBe(true);
    expect(has((o) => o.shippingAddress.countryCode !== "US")).toBe(true);
  });

  it("has unique ids and order numbers, and only known customers", () => {
    const ids = store.orders.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    const emails = new Set(SANDBOX_CUSTOMERS.map((c) => c.email));
    expect(store.orders.every((o) => emails.has(o.email))).toBe(true);
    const skus = store.products.flatMap((p) => p.variants.map((v) => v.sku));
    expect(new Set(skus).size).toBe(skus.length);
  });

  it("keeps money consistent", () => {
    for (const o of store.orders) {
      const subtotal = o.lineItems.reduce((n, li) => n + cents(li.price.amount) * li.quantity, 0);
      expect(cents(o.subtotal.amount), o.name).toBe(subtotal);
      expect(cents(o.total.amount), o.name).toBe(subtotal + cents(o.shipping.amount));
      const refunded = o.refunds.reduce((n, r) => n + cents(r.amount.amount), 0);
      expect(cents(o.totalRefunded.amount), o.name).toBe(refunded);
      expect(refunded, o.name).toBeLessThanOrEqual(cents(o.total.amount));
    }
  });

  it("applies the shipping policy", () => {
    expect(order(1001).shipping.amount).toBe("0.00"); // $149, US
    expect(order(1014).shipping.amount).toBe("8.00"); // $60, US
    expect(order(1013).shipping.amount).toBe("25.00"); // Canada
  });

  it("only allows cancelling orders that haven't shipped", () => {
    for (const o of store.orders) {
      expect(o.cancellable, o.name).toBe(o.fulfillments.length === 0 && o.cancelledAt === null);
    }
    expect(order(1001).cancellable).toBe(true);
    expect(order(1003).cancellable).toBe(false);
    expect(order(1012).cancellable).toBe(false); // already cancelled
  });

  it("derives fulfillment details", () => {
    const partial = order(1009);
    expect(partial.fulfillmentStatus).toBe("partially_fulfilled");
    expect(partial.lineItems.map((li) => li.unfulfilledQuantity)).toEqual([0, 1]);

    const delayed = order(1008).fulfillments[0];
    expect(delayed?.delayed).toBe(true);
    expect(order(1003).fulfillments[0]?.delayed).toBe(false);

    expect(order(1011).lineItems.map((li) => li.refundableQuantity)).toEqual([0, 2]);
  });

  it("puts the 45-day-old order outside the 30-day return window", () => {
    const delivered = order(1007).fulfillments[0]?.deliveredAt;
    expect(delivered).toBeTruthy();
    const days = (NOW.getTime() - new Date(delivered ?? "").getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(30);
  });

  it("includes the spec's policies", () => {
    const text = SANDBOX_KNOWLEDGE.map((k) => k.content).join(" ");
    expect(text).toContain("30 days");
    expect(text).toContain("$75");
    expect(text).toContain("before they ship");
  });
});

describe("SandboxProvider.findOrders", () => {
  it("finds by order number with or without #", async () => {
    for (const q of ["#1003", "1003", " # 1003 "]) {
      const res = await provider.findOrders({ orderNumber: q });
      expect(res.map((o) => o.name), q).toEqual(["#1003"]);
    }
  });

  it("finds all of a customer's orders by email, newest first, ignoring case", async () => {
    const res = await provider.findOrders({ email: "  PRIYA.Nair@Example.com " });
    expect(res.map((o) => o.name)).toEqual(["#1003", "#1008"]);
  });

  it("requires number AND email to match when both are given", async () => {
    expect(await provider.findOrders({ orderNumber: "1003", email: "priya.nair@example.com" })).toHaveLength(1);
    // Someone else's order number: nothing is revealed.
    expect(await provider.findOrders({ orderNumber: "1003", email: "emma.larsen@example.com" })).toEqual([]);
  });

  it("returns nothing without filters or for unknown values", async () => {
    expect(await provider.findOrders({})).toEqual([]);
    expect(await provider.findOrders({ orderNumber: "9999" })).toEqual([]);
    expect(await provider.findOrders({ email: "nobody@example.com" })).toEqual([]);
  });

  it("returns summaries without line items or addresses", async () => {
    const [summary] = await provider.findOrders({ orderNumber: "1001" });
    expect(summary).toBeDefined();
    expect(summary).not.toHaveProperty("lineItems");
    expect(summary).not.toHaveProperty("shippingAddress");
  });
});

describe("SandboxProvider.getOrder", () => {
  it("returns full detail by id, or null", async () => {
    const detail = await provider.getOrder("gid://sandbox/Order/1003");
    expect(detail?.fulfillments[0]?.trackingNumber).toBe("1Z999AA10123456784");
    expect(await provider.getOrder("gid://sandbox/Order/404")).toBeNull();
  });

  it("returns copies, so callers can't change the store", async () => {
    const a = await provider.getOrder("gid://sandbox/Order/1001");
    if (!a) throw new Error("missing");
    a.total.amount = "0.00";
    const b = await provider.getOrder("gid://sandbox/Order/1001");
    expect(b?.total.amount).toBe("149.00");
  });
});

describe("SandboxProvider.searchProducts", () => {
  it("ranks title matches first", async () => {
    const res = await provider.searchProducts("rain jacket");
    expect(res[0]?.title).toBe("Ridgeline Rain Shell");
  });

  it("matches plurals and tags", async () => {
    const res = await provider.searchProducts("gloves");
    expect(res[0]?.title).toBe("Granite Insulated Gloves");
    expect(res[0]?.available).toBe(false);
  });

  it("reports per-size stock", async () => {
    const [shell] = await provider.searchProducts("Ridgeline");
    const large = shell?.variants.find((v) => v.title === "L");
    expect(large).toMatchObject({ inventory: 0, available: false });
    expect(shell?.available).toBe(true);
  });

  it("returns nothing for empty or unrelated queries, and at most 5 results", async () => {
    expect(await provider.searchProducts("   ")).toEqual([]);
    expect(await provider.searchProducts("kayak paddle")).toEqual([]);
    expect((await provider.searchProducts("merino wool hiking layer")).length).toBeLessThanOrEqual(5);
  });
});

describe("normalizeOrderNumber", () => {
  it("strips # and whitespace", () => {
    expect(normalizeOrderNumber(" #1001 ")).toBe("1001");
  });
});
