import { NonRetriableError } from "inngest";

import { inngest } from "@/inngest/client";
import { TEAM_ALERT, teamAlertSchema } from "@/inngest/events";
import { emailConfig, sendEmail } from "@/lib/email/outbound";
import { publicEnv } from "@/lib/env-public";
import { sendTeamAlert } from "@/lib/notifications/send-team-alert";
import { reportJobFailure } from "@/lib/observability/report";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Emails the store's owner when Ava escalates a conversation or prepares a
 * money action for approval. Idempotent (team_alerts), retried on temporary
 * email errors. Never contacts the customer.
 */
export const notifyTeam = inngest.createFunction(
  {
    id: "notify-team",
    name: "Email the team when Ava needs them",
    triggers: [{ event: TEAM_ALERT }],
    retries: 3,
    onFailure: async ({ event, error }) => {
      const parsed = teamAlertSchema.safeParse(event.data.event.data);
      reportJobFailure("notify-team", error, parsed.success ? { shopId: parsed.data.shopId, conversationId: parsed.data.conversationId } : {});
    },
  },
  async ({ event, step }) => {
    const parsed = teamAlertSchema.safeParse(event.data);
    if (!parsed.success) throw new NonRetriableError("Invalid team.alert event data");
    const config = emailConfig();
    if (!config) return { skipped: "email sending isn't set up" };

    return step.run("send", async () => {
      const db = createAdminClient();
      return sendTeamAlert(db, parsed.data, {
        appUrl: publicEnv().NEXT_PUBLIC_APP_URL,
        send: (email) => sendEmail({ ...email, fromName: "AstaDesk" }, config),
        userEmail: async (userId) => (await db.auth.admin.getUserById(userId)).data.user?.email ?? null,
      });
    });
  },
);
