import { describe, expect, it, vi } from "vitest";

import {
  ActionFailed,
  executeAddressChange,
  executeCancel,
  executeRefund,
  hasShipped,
  splitName,
  type ShopifyConn,
} from "@/lib/shopify/mutations";

const ORDER = "gid://shopify/Order/42";
const usd = (amount: string) => ({ shopMoney: { amount, currencyCode: "USD" } });

function orderState(over: Record<string, unknown> = {}) {
  return {
    order: {
      id: ORDER,
      name: "#1042",
      cancelledAt: null,
      displayFinancialStatus: "PAID",
      fulfillments: [],
      lineItems: { nodes: [{ id: "gid://shopify/LineItem/1", quantity: 2, unfulfilledQuantity: 2 }] },
      transactions: [{ id: "gid://shopify/OrderTransaction/9", kind: "SALE", status: "SUCCESS", gateway: "bogus", amountSet: usd("100.0") }],
      ...over,
    },
  };
}

/** Fake Shopify that answers by operation name and records every request. */
function fakeShopify(handlers: Record<string, (vars: Record<string, unknown>, query: string) => unknown>) {
  const calls: { op: string; vars: Record<string, unknown>; query: string }[] = [];
  const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
    const { query, variables } = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
    const op = query.match(/(?:query|mutation)\s+(\w+)/)?.[1] ?? "?";
    calls.push({ op, vars: variables, query });
    const handler = handlers[op];
    if (!handler) throw new Error(`unexpected ${op}`);
    return new Response(JSON.stringify({ data: handler(variables, query) }), { status: 200 });
  });
  const conn: ShopifyConn = { domain: "s.myshopify.com", accessToken: "tok", fetchFn, sleep: async () => {} };
  return { conn, calls };
}

const refundOk = { refundCreate: { refund: { id: "gid://shopify/Refund/7", totalRefundedSet: usd("74.5") }, userErrors: [] } };

describe("executeRefund", () => {
  const payload = {
    order_id: ORDER,
    amount: "69.00",
    currency: "USD",
    line_items: [{ line_item_id: "gid://shopify/LineItem/1", quantity: 1 }],
  };

  it("uses Shopify's suggested transactions for the approved items, with the idempotency key", async () => {
    const { conn, calls } = fakeShopify({
      OrderState: () => orderState(),
      SuggestedRefund: () => ({
        order: {
          suggestedRefund: {
            amountSet: usd("74.5"),
            maximumRefundableSet: usd("100.0"),
            suggestedTransactions: [
              { parentTransaction: { id: "gid://shopify/OrderTransaction/9" }, gateway: "bogus", kind: "SUGGESTED_REFUND", amountSet: usd("74.5") },
            ],
          },
        },
      }),
      RefundCreate: () => refundOk,
    });
    const res = await executeRefund(conn, payload, { notifyCustomer: true, restock: false, idempotencyKey: "act-1", note: "Approved" });

    expect(res).toEqual({ refund_id: "gid://shopify/Refund/7", amount: "74.50", currency: "USD" });
    const create = calls.find((c) => c.op === "RefundCreate");
    expect(create?.query).toContain("@idempotent(key: $key)");
    expect(create?.vars.key).toBe("act-1");
    expect(create?.vars.input).toMatchObject({
      orderId: ORDER,
      notify: true,
      refundLineItems: [{ lineItemId: "gid://shopify/LineItem/1", quantity: 1, restockType: "NO_RESTOCK" }],
      transactions: [{ orderId: ORDER, gateway: "bogus", kind: "REFUND", parentId: "gid://shopify/OrderTransaction/9", amount: "74.5" }],
    });
  });

  it("refunds an exact amount from the original payment, never more than refundable", async () => {
    const suggested = () => ({
      order: { suggestedRefund: { amountSet: usd("0"), maximumRefundableSet: usd("20.0"), suggestedTransactions: [] } },
    });
    const ok = fakeShopify({ OrderState: () => orderState(), SuggestedRefund: suggested, RefundCreate: () => refundOk });
    await executeRefund(ok.conn, { ...payload, amount: "8.00", line_items: [] }, { notifyCustomer: false, restock: false, idempotencyKey: "k", note: "x" });
    expect(ok.calls.find((c) => c.op === "RefundCreate")?.vars.input).toMatchObject({
      transactions: [{ parentId: "gid://shopify/OrderTransaction/9", amount: "8.00", kind: "REFUND" }],
    });
    expect(ok.calls.find((c) => c.op === "RefundCreate")?.vars.input).not.toHaveProperty("refundLineItems");

    const tooMuch = fakeShopify({ OrderState: () => orderState(), SuggestedRefund: suggested });
    await expect(
      executeRefund(tooMuch.conn, { ...payload, amount: "50.00", line_items: [] }, { notifyCustomer: false, restock: false, idempotencyKey: "k", note: "x" }),
    ).rejects.toThrow(/Only 20.00 USD/);
    expect(tooMuch.calls.some((c) => c.op === "RefundCreate")).toBe(false);
  });

  it("fails clearly when nothing is refundable or Shopify refuses", async () => {
    const empty = fakeShopify({
      OrderState: () => orderState(),
      SuggestedRefund: () => ({ order: { suggestedRefund: { amountSet: usd("0"), maximumRefundableSet: usd("0"), suggestedTransactions: [] } } }),
    });
    await expect(executeRefund(empty.conn, payload, { notifyCustomer: true, restock: false, idempotencyKey: "k", note: "x" })).rejects.toBeInstanceOf(ActionFailed);

    const refused = fakeShopify({
      OrderState: () => orderState(),
      SuggestedRefund: () => ({
        order: {
          suggestedRefund: {
            amountSet: usd("10"),
            maximumRefundableSet: usd("100"),
            suggestedTransactions: [{ parentTransaction: { id: "t" }, gateway: "bogus", kind: "SUGGESTED_REFUND", amountSet: usd("10") }],
          },
        },
      }),
      RefundCreate: () => ({ refundCreate: { refund: null, userErrors: [{ field: ["x"], message: "Gateway declined" }] } }),
    });
    await expect(executeRefund(refused.conn, payload, { notifyCustomer: true, restock: true, idempotencyKey: "k", note: "x" })).rejects.toThrow(
      /Gateway declined/,
    );
    expect(refused.calls.find((c) => c.op === "RefundCreate")?.vars.input).toMatchObject({ refundLineItems: [{ restockType: "RETURN" }] });
  });

  it("refuses non-Shopify orders without calling Shopify", async () => {
    const { conn, calls } = fakeShopify({});
    await expect(
      executeRefund(conn, { ...payload, order_id: "gid://sandbox/Order/1001" }, { notifyCustomer: true, restock: false, idempotencyKey: "k", note: "x" }),
    ).rejects.toThrow(/isn't a Shopify order/);
    expect(calls).toEqual([]);
  });
});

describe("executeCancel", () => {
  it("cancels an unshipped order with the chosen options", async () => {
    const { conn, calls } = fakeShopify({
      OrderState: () => orderState(),
      OrderCancel: () => ({ orderCancel: { job: { id: "gid://shopify/Job/1", done: false }, orderCancelUserErrors: [] } }),
    });
    expect(await executeCancel(conn, ORDER, { notifyCustomer: false, restock: true })).toEqual({ job_id: "gid://shopify/Job/1" });
    expect(calls.find((c) => c.op === "OrderCancel")?.vars).toMatchObject({ id: ORDER, restock: true, notify: false });
  });

  it("treats an already cancelled order as done and refuses shipped ones", async () => {
    const done = fakeShopify({ OrderState: () => orderState({ cancelledAt: "2026-10-01T00:00:00Z" }) });
    expect(await executeCancel(done.conn, ORDER, { notifyCustomer: true, restock: true })).toEqual({ already_cancelled: true });
    expect(done.calls.map((c) => c.op)).toEqual(["OrderState"]);

    const shipped = fakeShopify({ OrderState: () => orderState({ fulfillments: [{ status: "SUCCESS" }] }) });
    await expect(executeCancel(shipped.conn, ORDER, { notifyCustomer: true, restock: true })).rejects.toThrow(/already shipped/);
  });
});

describe("executeAddressChange", () => {
  const address = { name: "Jane van der Berg", address1: "9 Pine St", city: "Boulder", province_code: "CO", zip: "80302", country_code: "US" };

  it("sends a code-based Shopify address", async () => {
    const { conn, calls } = fakeShopify({
      OrderState: () => orderState(),
      OrderUpdate: () => ({ orderUpdate: { order: { id: ORDER }, userErrors: [] } }),
    });
    await executeAddressChange(conn, ORDER, address);
    expect(calls.find((c) => c.op === "OrderUpdate")?.vars.input).toEqual({
      id: ORDER,
      shippingAddress: { firstName: "Jane", lastName: "van der Berg", address1: "9 Pine St", city: "Boulder", provinceCode: "CO", zip: "80302", countryCode: "US" },
    });
  });

  it("refuses without a country code, after shipping, and on Shopify errors", async () => {
    await expect(executeAddressChange(fakeShopify({}).conn, ORDER, { ...address, country_code: undefined })).rejects.toThrow(/country code/);
    const shipped = fakeShopify({ OrderState: () => orderState({ lineItems: { nodes: [{ id: "a", quantity: 2, unfulfilledQuantity: 1 }] } }) });
    await expect(executeAddressChange(shipped.conn, ORDER, address)).rejects.toThrow(/already shipped/);
    const bad = fakeShopify({
      OrderState: () => orderState(),
      OrderUpdate: () => ({ orderUpdate: { order: null, userErrors: [{ field: ["zip"], message: "Zip is invalid" }] } }),
    });
    await expect(executeAddressChange(bad.conn, ORDER, address)).rejects.toThrow(/Zip is invalid/);
  });
});

describe("helpers", () => {
  it("splitName and hasShipped", () => {
    expect(splitName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
    expect(hasShipped(orderState().order)).toBe(false);
    expect(hasShipped(orderState({ fulfillments: [{ status: "CANCELLED" }] }).order)).toBe(false);
  });
});
