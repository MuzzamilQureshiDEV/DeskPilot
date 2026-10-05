import { z } from "zod";

import { inngest } from "@/inngest/client";

/** A customer message was stored and should be handled by the agent. */
export const MESSAGE_RECEIVED = "deskpilot/message.received";

export const messageReceivedSchema = z.object({
  shopId: z.uuid(),
  conversationId: z.uuid(),
  messageId: z.uuid(),
});
export type MessageReceived = z.infer<typeof messageReceivedSchema>;

/** Queue a stored customer message for the agent (used by email inbound and chat). */
export async function enqueueMessage(data: MessageReceived): Promise<void> {
  await inngest.send({ name: MESSAGE_RECEIVED, data: messageReceivedSchema.parse(data) });
}

/** A merchant approved an action request; run it in Shopify. */
export const ACTION_APPROVED = "deskpilot/action.approved";

export const actionApprovedSchema = z.object({ shopId: z.uuid(), actionId: z.uuid() });
export type ActionApproved = z.infer<typeof actionApprovedSchema>;

export async function enqueueAction(data: ActionApproved): Promise<void> {
  await inngest.send({ name: ACTION_APPROVED, data: actionApprovedSchema.parse(data) });
}
