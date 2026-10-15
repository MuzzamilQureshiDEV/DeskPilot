import type { SupabaseClient } from "@supabase/supabase-js";

import { hasPlan } from "@/lib/billing/plans";
import { unansweredCustomerMessage } from "@/lib/inbox/mutations";
import type { Database } from "@/types/database";

// After a store subscribes, Ava answers the customer messages that arrived
// while it had no plan (they were skipped then, and nothing would retry them).
// Safe to call repeatedly: only messages with no AI reply at all are queued,
// and the agent job itself skips anything already answered or superseded.

type Db = SupabaseClient<Database>;

const LOOKBACK_DAYS = 7;
const MAX_MESSAGES = 50;

export async function queueUnansweredAfterSubscribe(
  db: Db,
  shopId: string,
  enqueue: (m: { shopId: string; conversationId: string; messageId: string }) => Promise<void>,
  now: Date = new Date(),
): Promise<number> {
  const { data: shop } = await db.from("shops").select("plan").eq("id", shopId).maybeSingle();
  if (!shop || !hasPlan(shop.plan)) return 0;

  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data: conversations } = await db
    .from("conversations")
    .select("id")
    .eq("shop_id", shopId)
    .eq("ai_paused", false)
    .not("status", "in", "(human,resolved)")
    .gte("last_message_at", since)
    .order("last_message_at", { ascending: false })
    .limit(MAX_MESSAGES);

  let queued = 0;
  for (const c of conversations ?? []) {
    const messageId = await unansweredCustomerMessage(db, shopId, c.id);
    if (!messageId) continue;
    await enqueue({ shopId, conversationId: c.id, messageId });
    queued++;
  }
  return queued;
}
