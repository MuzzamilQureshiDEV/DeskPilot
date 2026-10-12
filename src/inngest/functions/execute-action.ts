import { NonRetriableError } from "inngest";

import { inngest } from "@/inngest/client";
import { ACTION_APPROVED, actionApprovedSchema } from "@/inngest/events";
import { claimAction, confirmCustomer, finishAction, markActionFailed, runAction, type Outcome } from "@/lib/actions/execute";
import { deliverMessage, TransientDeliveryError } from "@/lib/email/outbound";
import { ActionFailed } from "@/lib/shopify/mutations";
import { getShopifyAccessToken, ShopifyNotConnected, ShopifyReauthRequired } from "@/lib/shopify/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportJobFailure } from "@/lib/observability/report";

/**
 * Runs an APPROVED action request in Shopify (CLAUDE.md rule 2: only after a
 * person approved it). claim → execute → finish, each memoised by Inngest.
 * Retrying "execute" is safe: refunds carry an idempotency key (the action id)
 * and cancel/address re-check the order first.
 */
export const executeAction = inngest.createFunction(
  {
    id: "execute-action",
    name: "Execute approved action",
    triggers: [{ event: ACTION_APPROVED }],
    concurrency: [{ key: "event.data.actionId", limit: 1 }],
    retries: 3,
    onFailure: async ({ event, error }) => {
      const parsed = actionApprovedSchema.safeParse(event.data.event.data);
      reportJobFailure("execute-action", error, parsed.success ? { shopId: parsed.data.shopId, actionId: parsed.data.actionId } : {});
      if (!parsed.success) return;
      await markActionFailed(
        createAdminClient(),
        parsed.data.shopId,
        parsed.data.actionId,
        "Shopify didn't respond after several tries. Check the order in Shopify before trying again.",
      );
    },
  },
  async ({ event, step }) => {
    const parsed = actionApprovedSchema.safeParse(event.data);
    if (!parsed.success) throw new NonRetriableError("Invalid action.approved event data");
    const { shopId, actionId } = parsed.data;

    const action = await step.run("claim", () => claimAction(createAdminClient(), shopId, actionId));
    if (!action) return { skipped: "not approved or already running" };

    const outcome: Outcome = await step.run("execute", async (): Promise<Outcome> => {
      try {
        const { domain, accessToken } = await getShopifyAccessToken(shopId);
        return { ok: true, result: await runAction({ domain, accessToken }, action) };
      } catch (err) {
        if (err instanceof ActionFailed) return { ok: false, error: err.message };
        if (err instanceof ShopifyReauthRequired || err instanceof ShopifyNotConnected) {
          return { ok: false, error: "Shopify isn't connected (or access expired). Reconnect on the Store page." };
        }
        throw err; // transient: retried
      }
    });

    await step.run("finish", () => finishAction(createAdminClient(), action, outcome));

    // Done in Shopify: Ava tells the customer in the same conversation. Chat shows it
    // on the next poll; email is delivered here (never re-sent once delivered).
    const confirmationId = await step.run("confirm", () => confirmCustomer(createAdminClient(), action, outcome));
    if (confirmationId) {
      await step.run("deliver-confirmation", async () => {
        const res = await deliverMessage(createAdminClient(), shopId, confirmationId);
        if (res.status === "failed" && res.transient) throw new TransientDeliveryError(res.error);
        return res;
      });
    }
    return outcome.ok ? { executed: actionId, confirmed: !!confirmationId } : { failed: actionId, error: outcome.error };
  },
);
