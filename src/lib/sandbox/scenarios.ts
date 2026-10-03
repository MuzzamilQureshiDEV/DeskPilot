// Preset Test-page scenarios against the sample store. Pure data, safe for client code.

import { SANDBOX_CUSTOMERS } from "@/lib/sandbox/data";

export const SANDBOX_FREE_TEXT_DAILY_LIMIT = 3;

export const SCENARIO_IDS = [
  "where_is_my_order",
  "cancel_order",
  "refund_request",
  "return_question",
  "product_question",
] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export type Scenario = {
  id: ScenarioId;
  label: string;
  /** What a good agent should do, shown to the merchant. */
  expect: string;
  customerEmail: string;
  message: string;
};

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  where_is_my_order: {
    id: "where_is_my_order",
    label: "Where is my order?",
    expect: "Looks up #1003 and shares the UPS tracking link and delivery estimate.",
    customerEmail: "priya.nair@example.com",
    message: "Hi! I ordered some hiking pants a few days ago (order #1003). Any idea when they'll arrive?",
  },
  cancel_order: {
    id: "cancel_order",
    label: "Cancel my order",
    expect: "Order #1001 hasn't shipped, so it proposes a cancellation for your approval.",
    customerEmail: "emma.larsen@example.com",
    message: "Hello, I just placed order #1001 for the rain shell but ordered the wrong size. Can you cancel it please?",
  },
  refund_request: {
    id: "refund_request",
    label: "Refund request",
    expect: "#1006 was delivered 20 days ago, within the 30-day window, so it proposes a refund for the shirt.",
    customerEmail: "liam.chen@example.com",
    message: "The flannel shirt from order #1006 is way too big. I'd like to send it back for a refund.",
  },
  return_question: {
    id: "return_question",
    label: "Late return",
    expect: "#1007 was delivered 45 days ago, outside the window, so it explains the policy and proposes nothing.",
    customerEmail: "hannah.weber@example.com",
    message: "Can I still return the vest from order #1007? I haven't worn it.",
  },
  product_question: {
    id: "product_question",
    label: "Product question",
    expect: "Finds the Ridgeline Rain Shell and says size L is out of stock, with sizes that are available.",
    customerEmail: "sofia.martinez@example.com",
    message: "Do you have the Ridgeline Rain Shell in a large? Is it fully waterproof?",
  },
};

export function sandboxCustomer(email: string) {
  return SANDBOX_CUSTOMERS.find((c) => c.email === email) ?? null;
}
