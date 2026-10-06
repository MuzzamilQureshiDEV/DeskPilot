import type { SupabaseClient } from "@supabase/supabase-js";

import { replyAddress } from "@/lib/email/addresses";
import { serverEnv } from "@/lib/env";
import type { Database } from "@/types/database";

// Outbound email via Postmark (CLAUDE.md §9). Replies come back through the
// per-conversation Reply-To address, so they thread into the same conversation.

type Db = SupabaseClient<Database>;

const POSTMARK_URL = "https://api.postmarkapp.com/email";

export type EmailConfig = { token: string; from: string; inboundAddress: string };

/** Sending config, or null in dev-outbox mode (no verified sender configured). */
export function emailConfig(): EmailConfig | null {
  const env = serverEnv();
  if (!env.POSTMARK_SERVER_TOKEN || !env.POSTMARK_FROM_EMAIL || !env.POSTMARK_INBOUND_ADDRESS) return null;
  return { token: env.POSTMARK_SERVER_TOKEN, from: env.POSTMARK_FROM_EMAIL, inboundAddress: env.POSTMARK_INBOUND_ADDRESS };
}

export const emailSendingEnabled = () => emailConfig() !== null;

export type OutgoingEmail = {
  to: string;
  fromName: string;
  subject: string;
  text: string;
  replyTo?: string;
  inReplyTo?: string | null;
};

const quoteName = (name: string) => `"${name.replace(/["\\\r\n]/g, "").slice(0, 100)}"`;

export function replySubject(subject: string | null): string {
  const s = (subject ?? "").trim() || "Your message";
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

/** Postmark request body (exported for tests). */
export function postmarkBody(email: OutgoingEmail, from: string) {
  return {
    From: `${quoteName(email.fromName)} <${from}>`,
    To: email.to,
    Subject: email.subject.slice(0, 500),
    TextBody: email.text,
    ...(email.replyTo ? { ReplyTo: email.replyTo } : {}),
    ...(email.inReplyTo
      ? { Headers: [{ Name: "In-Reply-To", Value: `<${email.inReplyTo}>` }, { Name: "References", Value: `<${email.inReplyTo}>` }] }
      : {}),
    MessageStream: "outbound",
  };
}

export async function sendEmail(
  email: OutgoingEmail,
  config: EmailConfig,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; providerId: string } | { ok: false; error: string; transient?: true }> {
  try {
    const res = await fetchFn(POSTMARK_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": config.token },
      body: JSON.stringify(postmarkBody(email, config.from)),
    });
    const json = (await res.json().catch(() => ({}))) as { ErrorCode?: number; Message?: string; MessageID?: string };
    if (!res.ok || (json.ErrorCode ?? 0) !== 0) {
      const error = json.Message ?? `Postmark error ${res.status}`;
      // Rate limits and server errors may pass; a rejected recipient won't.
      return res.status === 429 || res.status >= 500 ? { ok: false, error, transient: true } : { ok: false, error };
    }
    return { ok: true, providerId: json.MessageID ?? "" };
  } catch {
    return { ok: false, error: "Couldn't reach the email service.", transient: true };
  }
}

export type DeliveryResult =
  | { status: "delivered" }
  | { status: "dev_outbox" }
  | { status: "not_email" }
  | { status: "failed"; error: string; transient?: true };

/** Thrown by the background job so Inngest retries a temporary email failure. */
export class TransientDeliveryError extends Error {
  constructor(message: string) {
    super(`Email delivery failed: ${message}`);
    this.name = "TransientDeliveryError";
  }
}

/**
 * Emails a sent reply (AI or human) to the customer, once. Skips messages
 * already delivered, so retries never send twice. Filters by shop_id.
 */
export async function deliverMessage(
  db: Db,
  shopId: string,
  messageId: string,
  deps: { config?: EmailConfig | null; fetchFn?: typeof fetch } = {},
): Promise<DeliveryResult> {
  const { data: msg } = await db
    .from("messages")
    .select("id, role, status, body, delivered_at, conversation_id")
    .eq("id", messageId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (!msg || msg.status !== "sent" || (msg.role !== "ai" && msg.role !== "human")) return { status: "failed", error: "Nothing to send." };
  if (msg.delivered_at) return { status: "delivered" };

  const [{ data: conv }, { data: shop }, { data: lastCustomer }] = await Promise.all([
    db
      .from("conversations")
      .select("channel, subject, reply_token, customers(email)")
      .eq("id", msg.conversation_id)
      .eq("shop_id", shopId)
      .maybeSingle(),
    db.from("shops").select("name, agent_name, inbound_hash").eq("id", shopId).maybeSingle(),
    db
      .from("messages")
      .select("rfc_message_id")
      .eq("shop_id", shopId)
      .eq("conversation_id", msg.conversation_id)
      .eq("role", "customer")
      .not("rfc_message_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!conv || conv.channel !== "email") return { status: "not_email" };
  const to = conv.customers?.email;
  if (!to || !shop) return { status: "failed", error: "This conversation has no customer email address." };

  const config = deps.config === undefined ? emailConfig() : deps.config;
  if (!config) return { status: "dev_outbox" };

  const sent = await sendEmail(
    {
      to,
      fromName: `${shop.agent_name} at ${shop.name}`,
      subject: replySubject(conv.subject),
      text: msg.body,
      replyTo: replyAddress(config.inboundAddress, shop.inbound_hash, conv.reply_token),
      inReplyTo: lastCustomer?.rfc_message_id ?? null,
    },
    config,
    deps.fetchFn,
  );
  if (!sent.ok) {
    await db.from("messages").update({ delivery_error: sent.error.slice(0, 500) }).eq("id", msg.id).eq("shop_id", shopId);
    return sent.transient ? { status: "failed", error: sent.error, transient: true } : { status: "failed", error: sent.error };
  }
  await db
    .from("messages")
    .update({ delivered_at: new Date().toISOString(), delivery_error: null })
    .eq("id", msg.id)
    .eq("shop_id", shopId)
    .is("delivered_at", null);
  return { status: "delivered" };
}
