import type { SupabaseClient } from "@supabase/supabase-js";

import { summarizeAction } from "@/lib/inbox/action-summary";
import { teamAlertEmail, type TeamAlertKind } from "@/lib/notifications/team-alert";
import type { Database } from "@/types/database";

// Sends the "Ava needs you" / "Approval needed" email to the store's owner(s).
// Service-role client, always filtered by shop_id. Idempotent: each
// (conversation, kind, key) is claimed in team_alerts before sending.

type Db = SupabaseClient<Database>;

export type TeamAlertRequest = { shopId: string; conversationId: string; kind: TeamAlertKind; key: string };

export type SendFn = (email: { to: string; subject: string; text: string; html: string }) => Promise<
  { ok: true } | { ok: false; error: string; transient?: true }
>;

export type TeamAlertDeps = {
  appUrl: string;
  send: SendFn;
  /** The login email of a user (service-role auth admin API). */
  userEmail: (userId: string) => Promise<string | null>;
};

export type TeamAlertResult =
  | { status: "sent"; recipients: number }
  | { status: "skipped"; reason: "switched_off" | "no_longer_needed" | "duplicate" | "no_recipients" | "not_found" }
  | { status: "failed"; error: string };

/** Thrown so the job retries a temporary email problem; the claim is released first. */
export class TransientAlertError extends Error {
  constructor(message: string) {
    super(`Team alert failed: ${message}`);
    this.name = "TransientAlertError";
  }
}

export async function sendTeamAlert(db: Db, req: TeamAlertRequest, deps: TeamAlertDeps): Promise<TeamAlertResult> {
  const { data: shop } = await db
    .from("shops")
    .select("name, notify_escalations, notify_approvals")
    .eq("id", req.shopId)
    .maybeSingle();
  if (!shop) return { status: "skipped", reason: "not_found" };
  if (req.kind === "escalated" ? !shop.notify_escalations : !shop.notify_approvals) return { status: "skipped", reason: "switched_off" };

  const { data: conv } = await db
    .from("conversations")
    .select("id, channel, status, subject, escalation_reason, customers(name, email)")
    .eq("id", req.conversationId)
    .eq("shop_id", req.shopId)
    .maybeSingle();
  if (!conv) return { status: "skipped", reason: "not_found" };

  // Already handled by the time the job runs: nothing to tell anyone.
  let actions: string[] = [];
  if (req.kind === "escalated") {
    if (conv.status !== "escalated") return { status: "skipped", reason: "no_longer_needed" };
  } else {
    const { data: pending } = await db
      .from("action_requests")
      .select("type, payload")
      .eq("shop_id", req.shopId)
      .eq("conversation_id", req.conversationId)
      .eq("status", "pending");
    actions = (pending ?? []).map((a) => {
      const s = summarizeAction(a.type, a.payload);
      return `${s.title}${s.orderNumber ? ` · order ${s.orderNumber}` : ""}`;
    });
    if (actions.length === 0) return { status: "skipped", reason: "no_longer_needed" };
  }

  const { data: last } = await db
    .from("messages")
    .select("body")
    .eq("shop_id", req.shopId)
    .eq("conversation_id", req.conversationId)
    .eq("role", "customer")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: owners } = await db.from("shop_members").select("user_id").eq("shop_id", req.shopId).eq("role", "owner");
  const recipients = [...new Set((await Promise.all((owners ?? []).map((o) => deps.userEmail(o.user_id)))).filter((e): e is string => !!e))];
  if (recipients.length === 0) return { status: "skipped", reason: "no_recipients" };

  // Claim before sending, so a retried job never emails twice.
  const { error: claimError } = await db
    .from("team_alerts")
    .insert({ shop_id: req.shopId, conversation_id: req.conversationId, kind: req.kind, key: req.key.slice(0, 200) });
  if (claimError) {
    if (claimError.code === "23505") return { status: "skipped", reason: "duplicate" };
    throw new Error("Could not record the team alert");
  }

  const customer = conv.customers;
  const email = teamAlertEmail({
    kind: req.kind,
    appUrl: deps.appUrl,
    storeName: shop.name,
    conversationId: conv.id,
    customerName: customer?.name ?? null,
    channel: conv.channel === "chat" ? "chat" : "email",
    subject: conv.subject,
    reason: conv.escalation_reason,
    lastMessage: last?.body ?? null,
    actions,
  });

  const results = await Promise.all(recipients.map((to) => deps.send({ to, ...email })));
  const transient = results.find((r) => !r.ok && r.transient);
  if (transient && !transient.ok) {
    await db
      .from("team_alerts")
      .delete()
      .eq("shop_id", req.shopId)
      .eq("conversation_id", req.conversationId)
      .eq("kind", req.kind)
      .eq("key", req.key.slice(0, 200));
    throw new TransientAlertError(transient.error);
  }
  const failed = results.find((r) => !r.ok);
  if (failed && !failed.ok) return { status: "failed", error: failed.error };
  return { status: "sent", recipients: recipients.length };
}
