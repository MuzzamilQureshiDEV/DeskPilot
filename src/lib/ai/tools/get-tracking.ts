import type { OrderDetail } from "@/lib/store/types";
import { orderIdSchema } from "@/lib/ai/schemas";
import { trackingView } from "@/lib/ai/tools/views";
import { defineTool, type ToolContext, ToolError } from "@/lib/ai/tools/types";

/** Loads an order only if this customer was verified for it in this run. */
export async function requireVerifiedOrder(orderId: string, ctx: ToolContext): Promise<OrderDetail> {
  if (!ctx.verifiedOrderIds.has(orderId)) {
    throw new ToolError(
      "Unknown order_id for this customer. Call lookup_order first and use an order_id from its result.",
    );
  }
  const order = await ctx.provider.getOrder(orderId);
  if (!order) throw new ToolError("That order could not be found. Escalate rather than guessing.");
  return order;
}

export const getTracking = defineTool({
  schema: orderIdSchema,
  definition: {
    name: "get_tracking",
    description:
      "Get shipment details for an order: carrier, tracking number and link, shipped date, estimated or actual delivery date, whether it is delayed, and which items haven't shipped yet. Use the order_id returned by lookup_order.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "order_id from lookup_order." },
      },
      required: ["order_id"],
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    const order = await requireVerifiedOrder(input.order_id, ctx);
    return trackingView(order);
  },
});
