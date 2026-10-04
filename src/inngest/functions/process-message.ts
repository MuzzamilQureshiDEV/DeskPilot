import Anthropic from "@anthropic-ai/sdk";
import { NonRetriableError } from "inngest";

import { inngest } from "@/inngest/client";
import { MESSAGE_RECEIVED, messageReceivedSchema } from "@/inngest/events";
import { anthropicClient } from "@/lib/ai/client";
import { markFailed, prepareRun, runAndDecide, saveResult } from "@/lib/ai/process-message";
import { storeProviderForShop } from "@/lib/store/provider";
import { createAdminClient } from "@/lib/supabase/admin";

/** Anthropic errors that retrying won't fix (bad key, no credit, bad request). */
const PERMANENT_STATUSES = new Set([400, 401, 403, 404]);

/**
 * Handles one customer message (CLAUDE.md §7). Each step's result is memoised
 * by Inngest, so a retry of "save" never re-runs (or re-pays for) the agent,
 * and record_agent_result makes the save itself idempotent.
 */
export const processMessage = inngest.createFunction(
  {
    id: "process-message",
    name: "Process customer message",
    triggers: [{ event: MESSAGE_RECEIVED }],
    // One run per conversation at a time; newer messages queue behind it.
    concurrency: [{ key: "event.data.conversationId", limit: 1 }],
    retries: 3,
    onFailure: async ({ event, error }) => {
      const parsed = messageReceivedSchema.safeParse(event.data.event.data);
      if (!parsed.success) return;
      const reason = error.message.startsWith("AI request rejected") ? "the AI service rejected the request" : "an error";
      await markFailed(createAdminClient(), parsed.data, reason);
    },
  },
  async ({ event, step }) => {
    const parsed = messageReceivedSchema.safeParse(event.data);
    if (!parsed.success) throw new NonRetriableError("Invalid message.received event data");
    const ref = parsed.data;

    const prepared = await step.run("prepare", () => prepareRun(createAdminClient(), ref));
    if (prepared.skip !== null) return { skipped: prepared.skip };

    const result = await step.run("run-agent", async () => {
      try {
        return await runAndDecide(prepared.input, {
          client: anthropicClient(),
          provider: await storeProviderForShop(ref.shopId),
        });
      } catch (err) {
        // Busy/overloaded/network errors retry; a rejected key or no credit won't fix itself.
        if (err instanceof Anthropic.APIError && err.status !== undefined && PERMANENT_STATUSES.has(err.status)) {
          throw new NonRetriableError(`AI request rejected (${err.status})`, { cause: err });
        }
        throw err;
      }
    });

    const aiMessageId = await step.run("save", () => saveResult(createAdminClient(), ref, result));

    return {
      aiMessageId,
      status: result.conversation.status,
      actions: result.actions.length,
      fallback: result.meta.fallback,
    };
  },
);

export const functions = [processMessage];
