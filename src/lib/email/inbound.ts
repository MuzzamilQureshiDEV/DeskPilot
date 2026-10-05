import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { normalizeSubject, parseMailboxHash } from "@/lib/email/addresses";
import {
  classifyInbound,
  extractForwardingConfirmation,
  htmlToText,
  RATE_LIMIT,
  type FilterReason,
} from "@/lib/email/filters";
import type { Database, Json } from "@/types/database";

// Postmark inbound email → customer + conversation + message (CLAUDE.md §9).
// Service-role client (verified webhook); every query filters by shop_id.
// Logs ids only, never addresses or bodies (rule 4).

type Db = SupabaseClient<Database>;

const MAX_BODY = 20_000;
const THREAD_WINDOW_DAYS = 14;

const headerSchema = z.object({ Name: z.string(), Value: z.string() });
export const postmarkInboundSchema = z.object({
  FromFull: z.object({ Email: z.string().min(3).max(320), Name: z.string().max(200).optional().default("") }),
  ToFull: z.array(z.object({ Email: z.string(), MailboxHash: z.string().optional().default("") })).optional().default([]),
  OriginalRecipient: z.string().optional().default(""),
  MailboxHash: z.string().optional().default(""),
  Subject: z.string().max(2000).optional().default(""),
  MessageID: z.string().min(1).max(200),
  TextBody: z.string().optional().default(""),
  HtmlBody: z.string().optional().default(""),
  StrippedTextReply: z.string().optional().default(""),
  Headers: z.array(headerSchema).optional().default([]),
});
export type PostmarkInbound = z.infer<typeof postmarkInboundSchema>;

export type InboundResult =
  | { status: "stored"; shopId: string; conversationId: string; messageId: string }
  | { status: "duplicate" }
  | { status: "filtered"; reason: FilterReason }
  | { status: "ignored"; reason: "unknown_shop" };

export type InboundDeps = {
  ownAddresses: string[];
  enqueue: (data: { shopId: string; conversationId: string; messageId: string }) => Promise<void>;
  now?: Date;
};

const header = (email: PostmarkInbound, name: string) =>
  email.Headers.find((h) => h.Name.toLowerCase() === name.toLowerCase())?.Value.trim() ?? null;

/** "<a@b> <c@d>" → ["a@b", "c@d"] */
export function messageIds(value: string | null): string[] {
  return (value?.match(/<[^<>\s]+>/g) ?? []).map((v) => v.slice(1, -1)).slice(0, 20);
}

/** The shop (and conversation reply token) this email was sent to. */
function mailboxHashes(email: PostmarkInbound): string[] {
  const fromRecipient = email.OriginalRecipient.match(/\+([^@]+)@/)?.[1];
  return [email.MailboxHash, ...email.ToFull.map((t) => t.MailboxHash), fromRecipient ?? ""].filter(Boolean);
}

function bodyOf(email: PostmarkInbound): string {
  const text = email.StrippedTextReply.trim() || email.TextBody.trim() || htmlToText(email.HtmlBody);
  return (text || "(empty message)").slice(0, MAX_BODY);
}

export async function handleInbound(db: Db, email: PostmarkInbound, deps: InboundDeps): Promise<InboundResult> {
  const now = deps.now ?? new Date();

  // 1. Which shop (and maybe which conversation)?
  let shop: { id: string; setup: Json } | null = null;
  let replyToken: string | null = null;
  for (const hash of mailboxHashes(email)) {
    const parsed = parseMailboxHash(hash);
    if (!parsed) continue;
    const { data } = await db.from("shops").select("id, setup").eq("inbound_hash", parsed.shopHash).maybeSingle();
    if (data) {
      shop = data;
      replyToken = parsed.replyToken;
      break;
    }
  }
  if (!shop) return { status: "ignored", reason: "unknown_shop" };
  const shopId = shop.id;
  const from = email.FromFull.Email.trim().toLowerCase();
  const externalId = `pm:${email.MessageID}`;

  // 2. Duplicate delivery (Postmark retries)?
  const { data: seen } = await db.from("messages").select("id").eq("shop_id", shopId).eq("external_message_id", externalId).maybeSingle();
  if (seen) return { status: "duplicate" };

  // 3. Loop protection.
  const { data: existingCustomer } = await db.from("customers").select("id").eq("shop_id", shopId).eq("email", from).maybeSingle();
  let recentFromSender = 0;
  if (existingCustomer) {
    const { data: convs } = await db.from("conversations").select("id").eq("shop_id", shopId).eq("customer_id", existingCustomer.id).limit(50);
    const ids = (convs ?? []).map((c) => c.id);
    if (ids.length) {
      const since = new Date(now.getTime() - RATE_LIMIT.minutes * 60_000).toISOString();
      const { count } = await db
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("role", "customer")
        .in("conversation_id", ids)
        .gte("created_at", since);
      recentFromSender = count ?? 0;
    }
  }
  const verdict = classifyInbound({ from, subject: email.Subject, headers: email.Headers, ownAddresses: deps.ownAddresses, recentFromSender });
  if (!verdict.accept) {
    await db.from("filtered_emails").insert({ shop_id: shopId, from_email: from, subject: email.Subject.slice(0, 300), reason: verdict.reason });
    if (verdict.reason === "forwarding_confirmation") {
      const setup = shop.setup && typeof shop.setup === "object" && !Array.isArray(shop.setup) ? shop.setup : {};
      const found = extractForwardingConfirmation(`${email.TextBody}\n${email.HtmlBody}`);
      await db
        .from("shops")
        .update({ setup: { ...setup, forwarding_confirmation: { ...found, received_at: now.toISOString() } } })
        .eq("id", shopId);
    }
    return { status: "filtered", reason: verdict.reason };
  }

  // 4. Customer.
  let customerId = existingCustomer?.id ?? null;
  if (!customerId) {
    const { data, error } = await db
      .from("customers")
      .upsert({ shop_id: shopId, email: from, name: email.FromFull.Name.trim() || null }, { onConflict: "shop_id,email" })
      .select("id")
      .single();
    if (error) throw new Error("Could not save customer");
    customerId = data.id;
  }

  // 5. Conversation: reply token → In-Reply-To/References → same subject recently → new.
  let conversation: { id: string; status: string; ai_paused: boolean } | null = null;
  const pick = "id, status, ai_paused";
  if (replyToken) {
    const { data } = await db.from("conversations").select(pick).eq("shop_id", shopId).eq("reply_token", replyToken).maybeSingle();
    conversation = data;
  }
  if (!conversation) {
    const refs = [...messageIds(header(email, "In-Reply-To")), ...messageIds(header(email, "References"))];
    if (refs.length) {
      const { data: hit } = await db
        .from("messages")
        .select("conversation_id")
        .eq("shop_id", shopId)
        .in("rfc_message_id", refs)
        .limit(1)
        .maybeSingle();
      if (hit) {
        const { data } = await db.from("conversations").select(pick).eq("shop_id", shopId).eq("id", hit.conversation_id).maybeSingle();
        conversation = data;
      }
    }
  }
  if (!conversation) {
    const since = new Date(now.getTime() - THREAD_WINDOW_DAYS * 86_400_000).toISOString();
    const { data: recent } = await db
      .from("conversations")
      .select(`${pick}, subject`)
      .eq("shop_id", shopId)
      .eq("customer_id", customerId)
      .eq("channel", "email")
      .neq("status", "resolved")
      .gte("last_message_at", since)
      .order("last_message_at", { ascending: false })
      .limit(20);
    const subject = normalizeSubject(email.Subject);
    conversation = (recent ?? []).find((c) => subject !== "" && normalizeSubject(c.subject) === subject) ?? null;
  }
  if (!conversation) {
    const { data, error } = await db
      .from("conversations")
      .insert({ shop_id: shopId, customer_id: customerId, channel: "email", subject: email.Subject.trim().slice(0, 200) || null })
      .select(pick)
      .single();
    if (error) throw new Error("Could not create conversation");
    conversation = data;
  }

  // 6. Message.
  const rfcId = messageIds(header(email, "Message-ID"))[0] ?? null;
  const { data: message, error: msgError } = await db
    .from("messages")
    .insert({
      shop_id: shopId,
      conversation_id: conversation.id,
      role: "customer",
      status: "received",
      body: bodyOf(email),
      external_message_id: externalId,
      rfc_message_id: rfcId,
    })
    .select("id")
    .single();
  if (msgError) {
    if (msgError.code === "23505") return { status: "duplicate" }; // concurrent retry
    throw new Error("Could not save message");
  }

  // A new message reopens the conversation, unless a person took it over or approval is pending.
  const status = conversation.ai_paused ? "human" : conversation.status === "awaiting_approval" ? "awaiting_approval" : "open";
  await db.from("conversations").update({ status, last_message_at: now.toISOString() }).eq("id", conversation.id).eq("shop_id", shopId);

  const setup = shop.setup && typeof shop.setup === "object" && !Array.isArray(shop.setup) ? shop.setup : {};
  if (setup.email_connected !== true) {
    await db.from("shops").update({ setup: { ...setup, email_connected: true } }).eq("id", shopId);
  }

  try {
    await deps.enqueue({ shopId, conversationId: conversation.id, messageId: message.id });
  } catch {
    // Stored safely; the merchant can still ask the AI for a draft from the Inbox.
    console.error("inbound email: could not queue message", message.id);
  }

  return { status: "stored", shopId, conversationId: conversation.id, messageId: message.id };
}
