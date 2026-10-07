import { describe, expect, it } from "vitest";

import { buildSandboxStore, SANDBOX_KNOWLEDGE } from "@/lib/sandbox/data";
import { explainRun } from "@/lib/sandbox/explain";

const store = buildSandboxStore(new Date("2026-10-08T12:00:00Z"));
const base = { proposals: [], escalate: false, escalateReason: null, outcomeText: "Draft saved.", fallback: false, store, knowledge: SANDBOX_KNOWLEDGE };

describe("explainRun (Test page steps)", () => {
  it("walks through a cancellation: order, policy, eligibility, approval, draft", () => {
    const order = store.orders.find((o) => o.cancellable)!;
    const { steps, data } = explainRun({
      ...base,
      category: "cancel",
      toolCalls: [
        { name: "lookup_order", ok: true, input: { order_number: order.name } },
        { name: "get_policy", ok: true, input: { topic: "cancellation" } },
        { name: "propose_cancellation", ok: true, input: { order_id: order.id } },
        { name: "respond", ok: true },
      ],
      proposals: [{ title: "Cancel order", orderNumber: order.name, details: ["Refund the full amount"] }],
    });
    expect(steps.map((s) => s.label)).toEqual([
      "Understood request",
      "Found order & customer",
      "Checked policy",
      "Determined eligibility",
      "Action requires approval",
      "Drafted response",
    ]);
    expect(steps[0]?.detail).toBe("Customer wants to cancel an order.");
    expect(steps[1]?.detail).toContain(order.name);
    expect(steps.find((s) => s.label === "Action requires approval")?.status).toBe("attention");
    expect(data.orders[0]).toMatchObject({ number: order.name, customer: order.customerName });
    expect(data.policies.length).toBeGreaterThan(0);
  });

  it("shows failed lookups, escalation and products honestly", () => {
    const { steps, data } = explainRun({
      ...base,
      category: "product",
      escalate: true,
      escalateReason: "Not sure about sizing.",
      toolCalls: [
        { name: "lookup_order", ok: false, error: "No order #9999 for this customer.", input: { order_number: "#9999" } },
        { name: "search_products", ok: true, input: { query: "rain shell" } },
      ],
    });
    expect(steps.find((s) => s.label === "Looked up the order")).toMatchObject({ status: "failed", detail: "No order #9999 for this customer." });
    expect(steps.find((s) => s.label === "Escalated to your team")?.detail).toBe("Not sure about sizing.");
    expect(data.products.some((p) => /rain shell/i.test(p.title))).toBe(true);
    expect(data.orders).toEqual([]);
  });
});
