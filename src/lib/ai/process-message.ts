import type { SupabaseClient } from "@supabase/supabase-js";

import { runAgent, type MessagesClient } from "@/lib/ai/agent";
import { decideOutcome, type AutomationMode, type AutomationSetting } from "@/lib/ai/outcome";
import type { Channel, HistoryMessage } from "@/lib/ai/prompts";
import type { KnowledgeEntry } from "@/lib/ai/tools/types";
import { aiAccess, PLANS, planOf } from "@/lib/billing/plans";
import { aiRepliesThisPeriod } from "@/lib/billing/usage";
import { loadKnowledge } from "@/lib/knowledge/load";
import type { StoreProvider } from "@/lib/store/types";
import type { Database, Json } from "@/types/database";

// The steps of the process-message job (CLAUDE.md §7), as plain functions so
// they can be tested without Inngest. All DB access uses the service-role
// client and filters by shop_id explicitly.

type Db = SupabaseClient<Database>;

export const HISTORY_LIMIT = 20;

/** Outbound sending arrives with email in task 3.3. Until then nothing is auto-sent. */
export const CHANNEL_CAN_SEND = false;

const DEFAULT_SETTING: AutomationSetting = { mode: "copilot", confidenceThreshold: 0.85 };

export type MessageRef = { shopId: string; conversationId: string; messageId: string };

export type SkipReason =
  | "not_found"
  | "not_customer_message"
  | "ai_paused"
  | "handled_by_human"
  | "already_answered"
  | "newer_message"
  | "usage_limit"
  | "trial_ended";

/** Everything the agent step needs, as plain JSON (Inngest memoises step results). */
export type RunInput = {
  ref: MessageRef;
  shop: { agentName: string; agentTone: string; shopName: string };
  history: HistoryMessage[];
  channel: Channel;
  customerEmail: string | null;
  customerName: string | null;
  knowledge: KnowledgeEntry[];
  settings: Record<string, AutomationSetting>;
  autopilotAllowedByPlan: boolean;
};

export type Prepared = { skip: SkipReason } | { skip: null; input: RunInput };

export async function prepareRun(db: Db, ref: MessageRef, now: Date = new Date()): Promise<Prepared> {
  const { shopId, conversationId, messageId } = ref;

  const [{ data: shop }, { data: conversation }, { data: message }] = await Promise.all([
    db.from("shops").select("id, name, agent_name, agent_tone, plan, trial_ends_at").eq("id", shopId).maybeSingle(),
    db
      .from("conversations")
      .select("id, channel, status, ai_paused, customer_id")
      .eq("id", conversationId)
      .eq("shop_id", shopId)
      .maybeSingle(),
    db
      .from("messages")
      .select("id, role, created_at")
      .eq("id", messageId)
      .eq("shop_id", shopId)
      .eq("conversation_id", conversationId)
      .maybeSingle(),
  ]);
  if (!shop || !conversation || !message?.created_at) return { skip: "not_found" };
  if (message.role !== "customer") return { skip: "not_customer_message" };
  if (conversation.ai_paused) return { skip: "ai_paused" };
  if (conversation.status === "human") return { skip: "handled_by_human" };

  const [{ data: answered }, { data: newer }] = await Promise.all([
    db.from("messages").select("id").eq("shop_id", shopId).eq("external_message_id", `ai:${messageId}`).maybeSingle(),
    db
      .from("messages")
      .select("id")
      .eq("shop_id", shopId)
      .eq("conversation_id", conversationId)
      .eq("role", "customer")
      .gt("created_at", message.created_at)
      .limit(1),
  ]);
  if (answered) return { skip: "already_answered" };
  if (newer && newer.length > 0) return { skip: "newer_message" };

  const access = aiAccess(
    { plan: shop.plan, trialEndsAt: shop.trial_ends_at },
    await aiRepliesThisPeriod(db, shopId, now),
    now,
  );
  if (!access.allowed) return { skip: access.reason };

  const [{ data: rows }, { data: customer }, knowledge, { data: settingRows }] = await Promise.all([
    db
      .from("messages")
      .select("role, status, body, created_at")
      .eq("shop_id", shopId)
      .eq("conversation_id", conversationId)
      .lte("created_at", message.created_at)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT * 2),
    conversation.customer_id
      ? db.from("customers").select("email, name").eq("id", conversation.customer_id).eq("shop_id", shopId).maybeSingle()
      : Promise.resolve({ data: null }),
    loadKnowledge(db, shopId),
    db.from("automation_settings").select("category, mode, confidence_threshold").eq("shop_id", shopId),
  ]);

  // Ava sees what the customer saw: their messages plus replies that were actually sent.
  const history: HistoryMessage[] = (rows ?? [])
    .filter((m) => m.role === "customer" || ((m.role === "ai" || m.role === "human") && m.status === "sent"))
    .slice(0, HISTORY_LIMIT)
    .reverse()
    .map((m) => ({ role: m.role as HistoryMessage["role"], body: m.body }));

  const channel = conversation.channel as Channel;
  const settings: Record<string, AutomationSetting> = Object.fromEntries(
    (settingRows ?? []).map((s) => [
      s.category,
      { mode: s.mode as AutomationMode, confidenceThreshold: Number(s.confidence_threshold) },
    ]),
  );

  return {
    skip: null,
    input: {
      ref,
      shop: { agentName: shop.agent_name, agentTone: shop.agent_tone, shopName: shop.name },
      history,
      channel,
      // Only an email sender is verified; chat customers must prove who they are.
      customerEmail: channel === "email" ? (customer?.email ?? null) : null,
      customerName: customer?.name ?? null,
      knowledge,
      settings,
      autopilotAllowedByPlan: PLANS[planOf(shop.plan)].autopilot,
    },
  };
}

/** What gets saved for one run (plain JSON for the record_agent_result RPC). */
export type SaveData = {
  reply: { status: "draft" | "sent"; body: string; confidence: number; reasoning: string };
  conversation: { status: string; sentiment: string; tags: string[] };
  actions: { type: string; payload: Json; ai_reasoning: string }[];
  usage: { model: string; input_tokens: number; output_tokens: number };
  /** For logs only. */
  meta: { fallback: string | null; tools: string[] };
};

export async function runAndDecide(
  input: RunInput,
  deps: { client: MessagesClient; provider: StoreProvider; now?: Date },
): Promise<SaveData> {
  const result = await runAgent({
    client: deps.client,
    shop: input.shop,
    knowledge: input.knowledge,
    provider: deps.provider,
    history: input.history,
    channel: input.channel,
    customerEmail: input.customerEmail,
    customerName: input.customerName,
    now: deps.now,
  });

  const r = result.response;
  const setting = input.settings[r.category] ?? DEFAULT_SETTING;
  const outcome = decideOutcome(result, setting, {
    // Nothing is auto-sent until a channel can actually send (task 3.3).
    autopilotAllowedByPlan: input.autopilotAllowedByPlan && CHANNEL_CAN_SEND,
  });

  return {
    reply: { status: outcome.messageStatus, body: r.reply, confidence: r.confidence, reasoning: r.reasoning },
    conversation: { status: outcome.conversationStatus, sentiment: r.sentiment, tags: r.tags },
    actions: outcome.createActionRequests
      ? result.proposals.map((p) => ({ type: p.type, payload: p.payload, ai_reasoning: r.reasoning }))
      : [],
    usage: {
      model: result.model,
      input_tokens: result.usage.inputTokens + result.usage.cacheReadTokens + result.usage.cacheWriteTokens,
      output_tokens: result.usage.outputTokens,
    },
    meta: { fallback: result.fallback, tools: result.toolCalls.map((t) => `${t.name}${t.ok ? "" : "!"}`) },
  };
}

/**
 * After all retries failed: leave a note in the conversation and escalate it,
 * so a customer is never left unanswered without anyone noticing. Idempotent.
 */
export async function markFailed(db: Db, ref: MessageRef, reason: string): Promise<void> {
  await db.from("messages").upsert(
    {
      shop_id: ref.shopId,
      conversation_id: ref.conversationId,
      role: "system",
      status: "received",
      body: `The AI couldn't reply to this message automatically (${reason}). Please reply yourself.`,
      external_message_id: `fail:${ref.messageId}`,
    },
    { onConflict: "shop_id,external_message_id", ignoreDuplicates: true },
  );
  await db
    .from("conversations")
    .update({ status: "escalated" })
    .eq("id", ref.conversationId)
    .eq("shop_id", ref.shopId)
    .eq("status", "open");
}

/** Saves the run atomically and idempotently. Returns the AI message id. */
export async function saveResult(db: Db, ref: MessageRef, data: SaveData): Promise<string> {
  const { data: messageId, error } = await db.rpc("record_agent_result", {
    p_shop_id: ref.shopId,
    p_conversation_id: ref.conversationId,
    p_source_message_id: ref.messageId,
    p_reply: data.reply,
    p_conversation: data.conversation,
    p_actions: data.actions,
    p_usage: data.usage,
  });
  if (error || !messageId) throw new Error(`Could not save agent result (${error?.code ?? "no id"})`);
  return messageId;
}
