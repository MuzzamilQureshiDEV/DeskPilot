import { lookupOrderSchema } from "@/lib/ai/schemas";
import { orderView } from "@/lib/ai/tools/views";
import { defineTool, ToolError } from "@/lib/ai/tools/types";

const MAX_ORDERS = 5;
const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const lookupOrder = defineTool({
  schema: lookupOrderSchema,
  definition: {
    name: "lookup_order",
    description:
      "Look up the customer's orders by order number and/or email. Returns items, totals, payment and fulfillment status, refunds, shipping address, and whether the order can still be cancelled or have its address changed. You must call this before discussing, tracking or proposing anything for an order. It only ever returns orders that belong to the verified customer.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        order_number: {
          type: "string",
          description: "Order number exactly as the customer wrote it, e.g. \"#1003\" or \"1003\".",
        },
        email: {
          type: "string",
          description:
            "Email address the customer used at checkout. Required on chat. On email it is the sender's address and is filled in automatically.",
        },
      },
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    let email: string;
    if (ctx.customerEmail) {
      // Email channel: only the sender's own orders, whatever address they mention.
      if (input.email && !sameEmail(input.email, ctx.customerEmail)) {
        throw new ToolError(
          "For privacy, orders can only be looked up for the sender's own email address. Ask the customer to write in from the email used at checkout, or escalate.",
        );
      }
      email = ctx.customerEmail;
    } else {
      if (!input.order_number || !input.email) {
        throw new ToolError(
          "To protect customer privacy, ask the customer for both their order number and the email address used at checkout before looking up an order.",
        );
      }
      email = input.email;
    }

    const summaries = await ctx.provider.findOrders({ orderNumber: input.order_number, email });
    if (summaries.length === 0) {
      return {
        orders: [],
        note: "No matching order for this customer. Don't guess. Ask them to double-check the order number and checkout email, or escalate.",
      };
    }

    const details = await Promise.all(
      summaries.slice(0, MAX_ORDERS).map((s) => ctx.provider.getOrder(s.id)),
    );
    const orders = details.filter((d) => d !== null);
    for (const o of orders) ctx.verifiedOrderIds.add(o.id);

    return {
      orders: orders.map(orderView),
      ...(summaries.length > MAX_ORDERS
        ? { note: `Showing the ${MAX_ORDERS} most recent of ${summaries.length} orders. Ask for an order number to see others.` }
        : {}),
    };
  },
});
