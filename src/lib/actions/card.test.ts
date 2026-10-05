import { describe, expect, it } from "vitest";

import { executeAction } from "@/inngest/functions/execute-action";
import { ACTION_APPROVED } from "@/inngest/events";
import { consequence, outcomeText } from "@/lib/actions/card";
import { summarizeAction } from "@/lib/inbox/action-summary";

describe("action card text", () => {
  it("says exactly what approving does", () => {
    const items = { order_number: "#1006", amount: "69.00", currency: "USD", line_items: [{ title: "Shirt", quantity: 1 }] };
    expect(consequence("refund", items, summarizeAction("refund", items))).toContain("original payment method");
    const amountOnly = { order_number: "#1006", amount: "8.00", currency: "USD", line_items: [] };
    expect(consequence("refund", amountOnly, summarizeAction("refund", amountOnly))).toBe(
      "Refund 8.00 USD to the customer's original payment method.",
    );
    const cancel = { order_number: "#1001" };
    expect(consequence("cancel", cancel, summarizeAction("cancel", cancel))).toBe(
      "Cancel order #1001 in Shopify and refund the customer's payment.",
    );
  });

  it("describes outcomes", () => {
    expect(outcomeText("refund", "executed", { amount: "74.50", currency: "USD" }, null)).toBe("Refunded 74.50 USD in Shopify.");
    expect(outcomeText("cancel", "executed", { already_cancelled: true }, null)).toContain("already cancelled");
    expect(outcomeText("cancel", "failed", null, "Already shipped")).toBe("Already shipped");
    expect(outcomeText("refund", "pending", null, null)).toBeNull();
  });
});

describe("execute-action function", () => {
  it("runs on action.approved, one run per action, with retries", () => {
    expect(executeAction.id()).toBe("execute-action");
    expect(executeAction.opts.triggers).toEqual([{ event: ACTION_APPROVED }]);
    expect(executeAction.opts.concurrency).toEqual([{ key: "event.data.actionId", limit: 1 }]);
    expect(executeAction.opts.retries).toBe(3);
  });
});
