import { proposeCancellationSchema } from "@/lib/ai/schemas";
import { requireVerifiedOrder } from "@/lib/ai/tools/get-tracking";
import { defineTool, ToolError } from "@/lib/ai/tools/types";

export const proposeCancellation = defineTool({
  schema: proposeCancellationSchema,
  definition: {
    name: "propose_cancellation",
    description:
      "Propose cancelling an order for the merchant to approve. This does NOT cancel anything. Only possible while nothing has shipped (lookup_order shows can_cancel_or_change_address). After calling it, tell the customer the cancellation request has been sent for review. Never say it's cancelled.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "order_id from lookup_order." },
        reason: { type: "string", description: "Short reason given by the customer." },
      },
      required: ["order_id", "reason"],
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    const order = await requireVerifiedOrder(input.order_id, ctx);
    if (order.cancelledAt) throw new ToolError("This order is already cancelled.");
    if (!order.cancellable) {
      throw new ToolError(
        "This order has already shipped (fully or partly), so it can't be cancelled. Explain the returns policy instead.",
      );
    }
    if (ctx.proposals.some((p) => p.type === "cancel" && p.orderId === order.id)) {
      throw new ToolError("A cancellation for this order is already proposed in this conversation.");
    }

    ctx.proposals.push({
      type: "cancel",
      orderId: order.id,
      payload: {
        order_id: order.id,
        order_number: order.name,
        refund_amount: order.total.amount,
        currency: order.total.currency,
        reason: input.reason,
      },
    });

    return {
      status: "pending_merchant_approval",
      order_number: order.name,
      note: "Not cancelled yet. Tell the customer their cancellation request has been sent to the team for review.",
    };
  },
});
