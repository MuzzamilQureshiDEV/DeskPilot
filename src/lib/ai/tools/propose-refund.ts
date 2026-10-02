import { proposeRefundSchema } from "@/lib/ai/schemas";
import { requireVerifiedOrder } from "@/lib/ai/tools/get-tracking";
import { defineTool, ToolError } from "@/lib/ai/tools/types";

const toCents = (amount: string) => Math.round(Number(amount) * 100);
const fromCents = (cents: number) => (cents / 100).toFixed(2);

export const proposeRefund = defineTool({
  schema: proposeRefundSchema,
  definition: {
    name: "propose_refund",
    description:
      "Propose a refund for the merchant to approve. This does NOT refund anything. A person reviews it first. Only use it when the customer asks for a refund and the store's policy allows it (check get_policy). Give the line items and quantities being refunded, or an amount for partial refunds that aren't tied to items (e.g. shipping). After calling it, tell the customer the request has been sent for review. Never say it's done.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "order_id from lookup_order." },
        line_items: {
          type: "array",
          description: "Items to refund, using line_item_id from lookup_order.",
          items: {
            type: "object",
            properties: {
              line_item_id: { type: "string" },
              quantity: { type: "integer" },
            },
            required: ["line_item_id", "quantity"],
            additionalProperties: false,
          },
        },
        amount: {
          type: "string",
          description: "Refund amount as a decimal string like \"12.50\". Only when not refunding specific items.",
        },
        reason: { type: "string", description: "Short reason, e.g. \"Returned, wrong size\"." },
      },
      required: ["order_id", "reason"],
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    const order = await requireVerifiedOrder(input.order_id, ctx);
    if (ctx.proposals.some((p) => p.type === "refund" && p.orderId === order.id)) {
      throw new ToolError("A refund for this order is already proposed in this conversation.");
    }

    const remainingCents = toCents(order.total.amount) - toCents(order.totalRefunded.amount);
    if (remainingCents <= 0) {
      throw new ToolError("This order has already been fully refunded. Nothing is left to refund.");
    }

    const items = (input.line_items ?? []).map((req) => {
      const li = order.lineItems.find((x) => x.id === req.line_item_id);
      if (!li) throw new ToolError(`Unknown line_item_id ${req.line_item_id} for this order.`);
      if (req.quantity > li.refundableQuantity) {
        throw new ToolError(
          `Only ${li.refundableQuantity} of "${li.title}" can still be refunded (requested ${req.quantity}).`,
        );
      }
      return { li, quantity: req.quantity };
    });

    const itemsCents = items.reduce((n, { li, quantity }) => n + toCents(li.price.amount) * quantity, 0);
    const requestedCents = input.amount !== undefined ? toCents(input.amount) : itemsCents;
    if (requestedCents <= 0) throw new ToolError("Refund amount must be more than zero.");
    if (requestedCents > remainingCents) {
      throw new ToolError(
        `Refund can't exceed the ${fromCents(remainingCents)} ${order.total.currency} not yet refunded on this order.`,
      );
    }

    const amount = fromCents(requestedCents);
    ctx.proposals.push({
      type: "refund",
      orderId: order.id,
      payload: {
        order_id: order.id,
        order_number: order.name,
        amount,
        currency: order.total.currency,
        line_items: items.map(({ li, quantity }) => ({
          line_item_id: li.id,
          title: li.title,
          size: li.variantTitle,
          quantity,
        })),
        reason: input.reason,
      },
    });

    return {
      status: "pending_merchant_approval",
      order_number: order.name,
      amount: `${amount} ${order.total.currency}`,
      note: "Not refunded yet. Tell the customer their refund request has been sent to the team for review.",
    };
  },
});
