import { describe, expect, it } from "vitest";

import { confirmationText } from "@/lib/actions/confirmation";

describe("customer confirmation after an approved action", () => {
  it("refund: the amount Shopify actually refunded", () => {
    const text = confirmationText("refund", { order_number: "#1001", amount: "50.00", currency: "USD" }, { amount: "45.00", currency: "USD" });
    expect(text).toContain("your refund of 45.00 USD for order #1001 has been processed");
    expect(text).toContain("If anything looks wrong, just reply here.");
  });

  it("refund: falls back to the approved amount, and says nothing without one", () => {
    expect(confirmationText("refund", { order_number: "1001", amount: "20.00", currency: "EUR" }, {})).toContain("20.00 EUR for order #1001");
    expect(confirmationText("refund", { order_number: "1001" }, {})).toBeNull();
  });

  it("cancel and already cancelled", () => {
    expect(confirmationText("cancel", { order_number: "#D12" }, { job_id: "x" })).toMatch(/^Order #D12 has been cancelled. Any payment goes back/);
    expect(confirmationText("cancel", { order_number: "#D12" }, { already_cancelled: true })).toMatch(/^Order #D12 is cancelled./);
    expect(confirmationText("cancel", {}, {})).toMatch(/^Your order has been cancelled/);
  });

  it("address change: the new address from the approved request", () => {
    const text = confirmationText(
      "address_change",
      { order_number: "#1003", new_address: { name: "Maya Tan", address1: "22 Jalan Bukit Bintang", city: "Kuala Lumpur", zip: "55100", country_code: "MY" } },
      { ok: true },
    );
    expect(text).toContain("The shipping address for order #1003 has been updated to: Maya Tan, 22 Jalan Bukit Bintang, Kuala Lumpur, 55100, MY.");
    expect(confirmationText("address_change", { order_number: "#1003" }, {})).toBeNull();
  });
});
