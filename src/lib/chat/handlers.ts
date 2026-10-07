import type { SupabaseClient } from "@supabase/supabase-js";

import { checkLimits, CHAT_LIMITS, threadIdFor, visibleMessages, type ChatPost, type VisibleMessage } from "@/lib/chat/session";
import type { Database } from "@/types/database";

// Storefront chat over Shopify's app proxy. Runs with the service role after
// the proxy signature is verified (the shop is trustworthy, the visitor is not).
// Every query is pinned to the verified shop and the visitor's token hash.

type Db = SupabaseClient<Database>;

export type ChatError = { error: string; status: 400 | 403 | 404 | 429 };
export type ChatDeps = {
  enqueue: (data: { shopId: string; conversationId: string; messageId: string }) => Promise<void>;
  now?: Date;
};

/** The shop behind a verified proxy request, if DeskPilot is installed there. */
export async function chatShop(db: Db, domain: string): Promise<{ id: string } | ChatError> {
  const { data } = await db.from("shops").select("id, shopify_uninstalled_at").eq("shopify_domain", domain).maybeSingle();
  if (!data) return { error: "This store isn't set up for chat.", status: 404 };
  if (data.shopify_uninstalled_at) return { error: "Chat is turned off for this store.", status: 403 };
  return { id: data.id };
}

async function conversationFor(db: Db, shopId: string, visitorToken: string) {
  const { data } = await db
    .from("conversations")
    .select("id, status, ai_paused, customer_id")
    .eq("shop_id", shopId)
    .eq("external_thread_id", threadIdFor(visitorToken))
    .maybeSingle();
  return data;
}

async function messagesFor(db: Db, shopId: string, conversationId: string, after?: string): Promise<VisibleMessage[]> {
  let q = db
    .from("messages")
    .select("id, role, status, body, created_at")
    .eq("shop_id", shopId)
    .eq("conversation_id", conversationId)
    .in("role", ["customer", "ai", "human"])
    .order("created_at", { ascending: true })
    .limit(100);
  if (after) q = q.gt("created_at", after);
  const { data } = await q;
  return visibleMessages(data ?? []);
}

export async function readChat(db: Db, shopId: string, visitorToken: string, after?: string): Promise<{ messages: VisibleMessage[] }> {
  const conv = await conversationFor(db, shopId, visitorToken);
  return { messages: conv ? await messagesFor(db, shopId, conv.id, after) : [] };
}

/** Link the chat to a customer when the shopper leaves an email (not treated as verified). */
async function customerFor(db: Db, shopId: string, post: ChatPost): Promise<string | null> {
  if (!post.email) return null;
  const { data, error } = await db
    .from("customers")
    .upsert({ shop_id: shopId, email: post.email, ...(post.name ? { name: post.name } : {}) }, { onConflict: "shop_id,email" })
    .select("id")
    .single();
  if (error) throw new Error("Could not save chat customer");
  return data.id;
}

export async function postChat(db: Db, shopId: string, post: ChatPost, deps: ChatDeps): Promise<{ messages: VisibleMessage[] } | ChatError> {
  const now = deps.now ?? new Date();
  let conv = await conversationFor(db, shopId, post.token);

  // Rate limits (AI cost + abuse).
  let recentVisitorMessages = 0;
  if (conv) {
    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("conversation_id", conv.id)
      .eq("role", "customer")
      .gte("created_at", new Date(now.getTime() - CHAT_LIMITS.visitorWindowMinutes * 60_000).toISOString());
    recentVisitorMessages = count ?? 0;
  }
  let newChatsLastHour = 0;
  if (!conv) {
    const { count } = await db
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("channel", "chat")
      .gte("created_at", new Date(now.getTime() - 3_600_000).toISOString());
    newChatsLastHour = count ?? 0;
  }
  const verdict = checkLimits({ recentVisitorMessages, isNewChat: !conv, newChatsLastHour });
  if (!verdict.ok) {
    return {
      error: verdict.reason === "visitor" ? "You're sending messages quickly. Please wait a few minutes." : "Chat is busy right now. Please try again shortly.",
      status: 429,
    };
  }

  const customerId = await customerFor(db, shopId, post);
  if (!conv) {
    const { data, error } = await db
      .from("conversations")
      .insert({
        shop_id: shopId,
        channel: "chat",
        customer_id: customerId,
        subject: post.text.slice(0, 80),
        external_thread_id: threadIdFor(post.token),
      })
      .select("id, status, ai_paused, customer_id")
      .single();
    if (error) {
      // Two first messages at once from the same visitor: use the one that won.
      conv = error.code === "23505" ? await conversationFor(db, shopId, post.token) : null;
      if (!conv) throw new Error("Could not start chat");
    } else {
      conv = data;
    }
  } else if (customerId && !conv.customer_id) {
    await db.from("conversations").update({ customer_id: customerId }).eq("id", conv.id).eq("shop_id", shopId);
  }

  const { data: message, error: msgError } = await db
    .from("messages")
    .insert({ shop_id: shopId, conversation_id: conv.id, role: "customer", status: "received", body: post.text })
    .select("id")
    .single();
  if (msgError) throw new Error("Could not save chat message");

  const status = conv.ai_paused ? "human" : conv.status === "awaiting_approval" ? "awaiting_approval" : "open";
  const conversationId = conv.id;
  // Independent steps run together so the shopper's message is confirmed quickly.
  const [, , messages] = await Promise.all([
    db.from("conversations").update({ status, last_message_at: now.toISOString() }).eq("id", conversationId).eq("shop_id", shopId),
    deps.enqueue({ shopId, conversationId, messageId: message.id }).catch(() => {
      console.error("chat: could not queue message", message.id);
    }),
    messagesFor(db, shopId, conversationId),
  ]);
  return { messages };
}
