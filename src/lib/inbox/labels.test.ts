import { describe, expect, it } from "vitest";

import { asStatus, NEEDS_ATTENTION, parseFilter, timeAgo } from "@/lib/inbox/labels";
import { summarizeAction } from "@/lib/inbox/action-summary";

const NOW = new Date("2026-10-05T12:00:00Z");

describe("inbox labels", () => {
  it("parses filters and statuses safely", () => {
    expect(parseFilter("escalated")).toBe("escalated");
    expect(parseFilter("all")).toBe("all");
    expect(parseFilter("<script>")).toBe("attention");
    expect(asStatus("weird")).toBe("open");
    expect(NEEDS_ATTENTION).not.toContain("resolved");
  });

  it("formats relative times", () => {
    expect(timeAgo("2026-10-05T11:59:40Z", NOW)).toBe("just now");
    expect(timeAgo("2026-10-05T11:55:00Z", NOW)).toBe("5 minutes ago");
    expect(timeAgo("2026-10-04T12:00:00Z", NOW)).toBe("yesterday");
    expect(timeAgo("2026-09-01T12:00:00Z", NOW)).toBe("Sep 1");
    expect(timeAgo(null, NOW)).toBe("");
  });
});

describe("summarizeAction", () => {
  it("describes refunds, cancellations and address changes", () => {
    expect(
      summarizeAction("refund", {
        order_number: "#1006",
        amount: "69.00",
        currency: "USD",
        line_items: [{ quantity: 1, title: "Flannel Shirt", size: "L" }],
        reason: "Too big",
      }),
    ).toEqual({ type: "refund", orderNumber: "#1006", title: "Refund 69.00 USD", details: ["1 × Flannel Shirt (L)", "Reason: Too big"] });
    expect(summarizeAction("cancel", { order_number: "#1001", refund_amount: "149.00", currency: "USD" }).details[1]).toBe(
      "Reason: not given",
    );
    const addr = summarizeAction("address_change", {
      order_number: "#1002",
      current_address: null,
      new_address: { address1: "9 Pine St", city: "Boulder", country: "US" },
    });
    expect(addr.details.slice(0, 2)).toEqual(["From: no address on file", "To: 9 Pine St, Boulder, US"]);
  });
});
