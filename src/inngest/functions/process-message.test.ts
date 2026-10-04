import { describe, expect, it } from "vitest";

import { messageReceivedSchema, MESSAGE_RECEIVED } from "@/inngest/events";
import { processMessage } from "@/inngest/functions/process-message";

describe("process-message function", () => {
  it("is triggered by message.received, one run per conversation, with retries", () => {
    expect(processMessage.id()).toBe("process-message");
    expect(processMessage.opts.triggers).toEqual([{ event: MESSAGE_RECEIVED }]);
    expect(processMessage.opts.concurrency).toEqual([{ key: "event.data.conversationId", limit: 1 }]);
    expect(processMessage.opts.retries).toBe(3);
  });

  it("accepts only well-formed event data", () => {
    const ok = {
      shopId: "11111111-2222-4333-8444-555555555555",
      conversationId: "11111111-2222-4333-8444-555555555556",
      messageId: "11111111-2222-4333-8444-555555555557",
    };
    expect(messageReceivedSchema.safeParse(ok).success).toBe(true);
    expect(messageReceivedSchema.safeParse({ ...ok, shopId: "not-a-uuid" }).success).toBe(false);
    expect(messageReceivedSchema.safeParse({ shopId: ok.shopId }).success).toBe(false);
  });
});
