import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";

// Inbox actions as plain functions on a Supabase client (the RLS client in
// user context), so they can be tested directly. Every query also filters by
// shop_id, and state changes are guarded by the expected current state
// (e.g. only a draft can be sent), so double clicks are harmless.

type Db = SupabaseClient<Database>;
export type InboxResult = { ok: true } | { ok: false; error: string };

export const replyBodySchema = z.string().trim().min(1, "Write a reply first").max(5000, "Keep replies under 5,000 characters");
export const idSchema = z.uuid();

const fail = (error: string): InboxResult => ({ ok: false, error });

async function conversationOf(db: Db, shopId: string, conversationId: string) {
  const { data } = await db
    .from("conversations")
    .select("id, status, ai_paused")
    .eq("id", conversationId)
    .eq("shop_id", shopId)
    .maybeSingle();
  return data;
}

/** Status after a reply goes out: keep "you're handling" and pending approvals, otherwise open. */
function statusAfterReply(c: { status: string; ai_paused: boolean }) {
  if (c.ai_paused) return "human" as const;
  if (c.status === "awaiting_approval") return "awaiting_approval" as const;
  return "open" as const;
}

/** Send an AI draft as-is or with edits. */
export async function sendDraft(db: Db, shopId: string, messageId: string, editedBody?: string | null): Promise<InboxResult> {
  const id = idSchema.safeParse(messageId);
  if (!id.success) return fail("Unknown draft.");
  const body = editedBody == null ? null : replyBodySchema.safeParse(editedBody);
  if (body && !body.success) return fail(body.error.issues[0]?.message ?? "Invalid reply.");

  const { data: sent } = await db
    .from("messages")
    .update({ status: "sent", ...(body?.success ? { body: body.data } : {}) })
    .eq("id", id.data)
    .eq("shop_id", shopId)
    .eq("role", "ai")
    .eq("status", "draft")
    .select("conversation_id");
  const conversationId = sent?.[0]?.conversation_id;
  if (!conversationId) return fail("This draft was already sent or rejected.");

  const conv = await conversationOf(db, shopId, conversationId);
  if (conv) {
    await db
      .from("conversations")
      .update({ status: statusAfterReply(conv), last_message_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("shop_id", shopId);
  }
  return { ok: true };
}

export async function rejectDraft(db: Db, shopId: string, messageId: string): Promise<InboxResult> {
  const id = idSchema.safeParse(messageId);
  if (!id.success) return fail("Unknown draft.");
  const { data } = await db
    .from("messages")
    .update({ status: "rejected" })
    .eq("id", id.data)
    .eq("shop_id", shopId)
    .eq("role", "ai")
    .eq("status", "draft")
    .select("conversation_id");
  const conversationId = data?.[0]?.conversation_id;
  if (!conversationId) return fail("This draft was already sent or rejected.");
  await db
    .from("conversations")
    .update({ status: "open" })
    .eq("id", conversationId)
    .eq("shop_id", shopId)
    .eq("status", "ai_drafted");
  return { ok: true };
}

/** A reply written by the merchant. */
export async function sendHumanReply(db: Db, shopId: string, conversationId: string, text: string): Promise<InboxResult> {
  const id = idSchema.safeParse(conversationId);
  const body = replyBodySchema.safeParse(text);
  if (!id.success) return fail("Unknown conversation.");
  if (!body.success) return fail(body.error.issues[0]?.message ?? "Invalid reply.");
  const conv = await conversationOf(db, shopId, id.data);
  if (!conv) return fail("Unknown conversation.");

  const { error } = await db
    .from("messages")
    .insert({ shop_id: shopId, conversation_id: id.data, role: "human", status: "sent", body: body.data });
  if (error) return fail("Couldn't send your reply. Please try again.");
  await db
    .from("conversations")
    .update({ status: statusAfterReply(conv), last_message_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("shop_id", shopId);
  return { ok: true };
}

/** Take over (AI stops replying) or hand the conversation back to the AI. */
export async function setTakeover(db: Db, shopId: string, conversationId: string, takeOver: boolean): Promise<InboxResult> {
  const id = idSchema.safeParse(conversationId);
  if (!id.success) return fail("Unknown conversation.");
  const { data } = await db
    .from("conversations")
    .update({ ai_paused: takeOver, status: takeOver ? "human" : "open" })
    .eq("id", id.data)
    .eq("shop_id", shopId)
    .select("id");
  return data?.length ? { ok: true } : fail("Unknown conversation.");
}

export async function setResolved(db: Db, shopId: string, conversationId: string, resolved: boolean): Promise<InboxResult> {
  const id = idSchema.safeParse(conversationId);
  if (!id.success) return fail("Unknown conversation.");
  const conv = await conversationOf(db, shopId, id.data);
  if (!conv) return fail("Unknown conversation.");
  const { error } = await db
    .from("conversations")
    .update({ status: resolved ? "resolved" : conv.ai_paused ? "human" : "open" })
    .eq("id", id.data)
    .eq("shop_id", shopId);
  return error ? fail("Couldn't update the conversation.") : { ok: true };
}

/** The latest customer message, if it has no AI reply yet (to ask the AI for a draft). */
export async function unansweredCustomerMessage(db: Db, shopId: string, conversationId: string): Promise<string | null> {
  const { data: latest } = await db
    .from("messages")
    .select("id, role")
    .eq("shop_id", shopId)
    .eq("conversation_id", conversationId)
    .in("role", ["customer", "ai", "human"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest || latest.role !== "customer") return null;
  const { data: answered } = await db
    .from("messages")
    .select("id")
    .eq("shop_id", shopId)
    .eq("external_message_id", `ai:${latest.id}`)
    .maybeSingle();
  return answered ? null : latest.id;
}
