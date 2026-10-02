import { describe, expect, it } from "vitest";

import { buildSandboxStore, SANDBOX_KNOWLEDGE } from "@/lib/sandbox/data";
import { SandboxProvider } from "@/lib/sandbox/provider";
import { getPolicy } from "@/lib/ai/tools/get-policy";
import { getTracking } from "@/lib/ai/tools/get-tracking";
import { lookupOrder } from "@/lib/ai/tools/lookup-order";
import { proposeAddressChange } from "@/lib/ai/tools/propose-address-change";
import { proposeCancellation } from "@/lib/ai/tools/propose-cancellation";
import { proposeRefund } from "@/lib/ai/tools/propose-refund";
import { searchProducts } from "@/lib/ai/tools/search-products";
import { type ToolContext, ToolError } from "@/lib/ai/tools/types";

const provider = new SandboxProvider(buildSandboxStore(new Date("2026-10-02T12:00:00Z")));
const id = (n: number) => `gid://sandbox/Order/${n}`;
const line = (n: number, sku: string) => `gid://sandbox/LineItem/${n}-${sku}`;

function ctx(customerEmail: string | null): ToolContext {
  return { provider, knowledge: SANDBOX_KNOWLEDGE, customerEmail, verifiedOrderIds: new Set(), proposals: [] };
}

/** Runs lookup_order so the order counts as verified for this customer. */
async function verified(n: number, email: string) {
  const c = ctx(email);
  await lookupOrder.run({ order_number: String(n) }, c);
  expect(c.verifiedOrderIds.has(id(n))).toBe(true);
  return c;
}

type OrdersResult = { orders: { order_number: string }[] };

describe("lookup_order", () => {
  it("email channel: pins lookups to the sender", async () => {
    const c = ctx("priya.nair@example.com");
    const own = (await lookupOrder.run({ order_number: "#1003" }, c)) as OrdersResult;
    expect(own.orders.map((o) => o.order_number)).toEqual(["#1003"]);

    // Emma's order number from Priya's inbox: nothing revealed, nothing verified.
    const other = (await lookupOrder.run({ order_number: "1001" }, c)) as OrdersResult;
    expect(other.orders).toEqual([]);
    expect(c.verifiedOrderIds.has(id(1001))).toBe(false);
  });

  it("email channel: refuses a different email than the sender's", async () => {
    await expect(
      lookupOrder.run({ order_number: "1001", email: "emma.larsen@example.com" }, ctx("priya.nair@example.com")),
    ).rejects.toBeInstanceOf(ToolError);
  });

  it("email channel: lists the sender's orders without an order number", async () => {
    const res = (await lookupOrder.run({}, ctx("priya.nair@example.com"))) as OrdersResult;
    expect(res.orders.map((o) => o.order_number)).toEqual(["#1003", "#1008"]);
  });

  it("chat: requires both order number and email, and both must match", async () => {
    await expect(lookupOrder.run({ order_number: "1003" }, ctx(null))).rejects.toBeInstanceOf(ToolError);
    await expect(lookupOrder.run({ email: "priya.nair@example.com" }, ctx(null))).rejects.toBeInstanceOf(ToolError);

    const ok = (await lookupOrder.run({ order_number: "1003", email: "Priya.Nair@example.com" }, ctx(null))) as OrdersResult;
    expect(ok.orders).toHaveLength(1);
    const mismatch = (await lookupOrder.run({ order_number: "1003", email: "emma.larsen@example.com" }, ctx(null))) as OrdersResult;
    expect(mismatch.orders).toEqual([]);
  });
});

describe("get_tracking", () => {
  it("refuses orders not verified in this run", async () => {
    await expect(getTracking.run({ order_id: id(1003) }, ctx("priya.nair@example.com"))).rejects.toBeInstanceOf(ToolError);
  });

  it("reports delays and unshipped items", async () => {
    const delayed = (await getTracking.run({ order_id: id(1008) }, await verified(1008, "priya.nair@example.com"))) as {
      shipments: { delayed: boolean }[];
    };
    expect(delayed.shipments[0]?.delayed).toBe(true);

    const partial = (await getTracking.run({ order_id: id(1009) }, await verified(1009, "noah.williams@example.com"))) as {
      not_yet_shipped: { title: string }[];
    };
    expect(partial.not_yet_shipped.map((i) => i.title)).toEqual(["Switchback Hiking Pants"]);
  });
});

describe("propose_refund", () => {
  it("records a pending proposal with the computed amount", async () => {
    const c = await verified(1006, "liam.chen@example.com");
    const res = await proposeRefund.run(
      { order_id: id(1006), line_items: [{ line_item_id: line(1006, "TFS-L"), quantity: 1 }], reason: "Too big" },
      c,
    );
    expect(res).toMatchObject({ status: "pending_merchant_approval", amount: "69.00 USD" });
    expect(c.proposals).toHaveLength(1);
    expect(c.proposals[0]).toMatchObject({ type: "refund", orderId: id(1006), payload: { amount: "69.00", order_number: "#1006" } });
  });

  it("rejects unverified orders, duplicates, over-refunds and fully refunded orders", async () => {
    const reason = "test";
    await expect(
      proposeRefund.run({ order_id: id(1006), amount: "10.00", reason }, ctx("liam.chen@example.com")),
    ).rejects.toBeInstanceOf(ToolError);

    const c = await verified(1006, "liam.chen@example.com");
    await expect(
      proposeRefund.run({ order_id: id(1006), line_items: [{ line_item_id: line(1006, "TFS-L"), quantity: 2 }], reason }, c),
    ).rejects.toThrow(/Only 1/);
    await expect(proposeRefund.run({ order_id: id(1006), amount: "500.00", reason }, c)).rejects.toThrow(/can't exceed/);
    await proposeRefund.run({ order_id: id(1006), amount: "5.00", reason }, c);
    await expect(proposeRefund.run({ order_id: id(1006), amount: "5.00", reason }, c)).rejects.toThrow(/already proposed/);

    const refunded = await verified(1010, "olivia.brown@example.com");
    await expect(proposeRefund.run({ order_id: id(1010), amount: "1.00", reason }, refunded)).rejects.toThrow(/fully refunded/);
  });

  it("won't re-refund an item already returned", async () => {
    const c = await verified(1011, "daniel.okafor@example.com");
    await expect(
      proposeRefund.run({ order_id: id(1011), line_items: [{ line_item_id: line(1011, "CTS-L"), quantity: 1 }], reason: "x" }, c),
    ).rejects.toThrow(/Only 0/);
  });
});

describe("propose_cancellation", () => {
  it("only allows unshipped, uncancelled orders", async () => {
    const ok = await verified(1001, "emma.larsen@example.com");
    await proposeCancellation.run({ order_id: id(1001), reason: "Changed my mind" }, ok);
    expect(ok.proposals[0]).toMatchObject({ type: "cancel", payload: { refund_amount: "149.00" } });

    const shipped = await verified(1003, "priya.nair@example.com");
    await expect(proposeCancellation.run({ order_id: id(1003), reason: "x" }, shipped)).rejects.toThrow(/shipped/);

    const cancelled = await verified(1012, "olivia.brown@example.com");
    await expect(proposeCancellation.run({ order_id: id(1012), reason: "x" }, cancelled)).rejects.toThrow(/already cancelled/);
  });
});

describe("propose_address_change", () => {
  const newAddress = { name: "Marcus Reid", address1: "9 Pine St", city: "Boulder", province: "CO", zip: "80302", country: "United States" };

  it("records old and new address for unshipped orders", async () => {
    const c = await verified(1002, "marcus.reid@example.com");
    await proposeAddressChange.run({ order_id: id(1002), new_address: newAddress, reason: "Moved" }, c);
    expect(c.proposals[0]).toMatchObject({
      type: "address_change",
      payload: { current_address: { city: "Denver" }, new_address: { city: "Boulder" } },
    });
  });

  it("refuses shipped orders", async () => {
    const c = await verified(1005, "sofia.martinez@example.com");
    await expect(
      proposeAddressChange.run({ order_id: id(1005), new_address: newAddress, reason: "x" }, c),
    ).rejects.toBeInstanceOf(ToolError);
  });
});

describe("get_policy and search_products", () => {
  it("finds the relevant policy", async () => {
    const res = (await getPolicy.run({ topic: "return window" }, ctx(null))) as { entries: { title: string }[] };
    expect(res.entries[0]?.title).toBe("Returns and exchanges");
  });

  it("lists topics when nothing matches, and flags missing policies", async () => {
    const none = (await getPolicy.run({ topic: "gift wrapping" }, ctx(null))) as { available_topics: string[] };
    expect(none.available_topics.length).toBeGreaterThan(0);
    const empty = await getPolicy.run({ topic: "returns" }, { ...ctx(null), knowledge: [] });
    expect(empty).toMatchObject({ entries: [] });
  });

  it("returns product stock per size", async () => {
    const res = (await searchProducts.run({ query: "rain jacket" }, ctx(null))) as {
      products: { title: string; sizes: { size: string; in_stock: boolean }[] }[];
    };
    expect(res.products[0]?.title).toBe("Ridgeline Rain Shell");
    expect(res.products[0]?.sizes.find((s) => s.size === "L")?.in_stock).toBe(false);
  });
});
