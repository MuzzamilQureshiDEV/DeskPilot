import { proposeAddressChangeSchema } from "@/lib/ai/schemas";
import { requireVerifiedOrder } from "@/lib/ai/tools/get-tracking";
import { defineTool, ToolError } from "@/lib/ai/tools/types";

export const proposeAddressChange = defineTool({
  schema: proposeAddressChangeSchema,
  definition: {
    name: "propose_address_change",
    description:
      "Propose changing an order's shipping address for the merchant to approve. This does NOT change anything. Only possible while nothing has shipped. Include the complete new address exactly as the customer gave it. If any part is missing or unclear, ask the customer instead of guessing. After calling it, tell the customer the change has been sent for review.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "order_id from lookup_order." },
        new_address: {
          type: "object",
          properties: {
            name: { type: "string", description: "Recipient name." },
            address1: { type: "string" },
            address2: { type: "string", description: "Apartment, suite, etc." },
            city: { type: "string" },
            province: { type: "string", description: "State or province." },
            zip: { type: "string", description: "ZIP or postal code." },
            country: { type: "string" },
          },
          required: ["name", "address1", "city", "zip", "country"],
          additionalProperties: false,
        },
        reason: { type: "string", description: "Short reason given by the customer." },
      },
      required: ["order_id", "new_address", "reason"],
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    const order = await requireVerifiedOrder(input.order_id, ctx);
    if (!order.cancellable) {
      throw new ToolError(
        "This order has already shipped or was cancelled, so its address can't be changed. Don't propose it. Explain this to the customer, or escalate.",
      );
    }
    if (ctx.proposals.some((p) => p.type === "address_change" && p.orderId === order.id)) {
      throw new ToolError("An address change for this order is already proposed in this conversation.");
    }

    const { address2, province, ...required } = input.new_address;
    ctx.proposals.push({
      type: "address_change",
      orderId: order.id,
      payload: {
        order_id: order.id,
        order_number: order.name,
        current_address: order.shippingAddress ? { ...order.shippingAddress } : null,
        new_address: {
          ...required,
          ...(address2 ? { address2 } : {}),
          ...(province ? { province } : {}),
        },
        reason: input.reason,
      },
    });

    return {
      status: "pending_merchant_approval",
      order_number: order.name,
      note: "Not changed yet. Tell the customer the address change has been sent to the team for review.",
    };
  },
});
