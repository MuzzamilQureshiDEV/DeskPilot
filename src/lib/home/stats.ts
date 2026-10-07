import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

// Home page numbers, read through the RLS client and filtered by shop_id.

type Db = SupabaseClient<Database>;

export const STATS_WINDOW_DAYS = 30;

export type HomeStats = {
  openConversations: number;
  aiRepliesSent: number;
  escalated: number;
  pendingApprovals: number;
  draftsToReview: number;
  resolved: number;
  /** 0–1, or null when there are no AI replies in the window. */
  avgConfidence: number | null;
};

export function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;
}

export async function loadHomeStats(db: Db, shopId: string, now: Date = new Date()): Promise<HomeStats> {
  const since = new Date(now.getTime() - STATS_WINDOW_DAYS * 86_400_000).toISOString();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

  const [openConversations, aiRepliesSent, escalated, pendingApprovals, draftsToReview, resolved, confidences] = await Promise.all([
    count(db.from("conversations").select("id", { count: "exact", head: true }).eq("shop_id", shopId).neq("status", "resolved")),
    count(
      db
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("role", "ai")
        .eq("status", "sent")
        .gte("created_at", since),
    ),
    count(db.from("conversations").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("status", "escalated")),
    count(db.from("action_requests").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("status", "pending")),
    count(db.from("conversations").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("status", "ai_drafted")),
    count(
      db
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("status", "resolved")
        .gte("last_message_at", since),
    ),
    db
      .from("messages")
      .select("confidence")
      .eq("shop_id", shopId)
      .eq("role", "ai")
      .not("confidence", "is", null)
      .gte("created_at", since)
      .limit(1000),
  ]);

  return {
    openConversations,
    aiRepliesSent,
    escalated,
    pendingApprovals,
    draftsToReview,
    resolved,
    avgConfidence: average((confidences.data ?? []).map((m) => Number(m.confidence))),
  };
}

export const TREND_DAYS = 14;

/** Counts per UTC day for the last `days` days (oldest first), from ISO timestamps. */
export function dailyBuckets(timestamps: (string | null)[], now: Date, days = TREND_DAYS): number[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const buckets = new Array<number>(days).fill(0);
  for (const t of timestamps) {
    if (!t) continue;
    const d = new Date(t);
    const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const index = days - 1 - Math.round((today - day) / 86_400_000);
    if (index >= 0 && index < days) buckets[index]!++;
  }
  return buckets;
}

export type Trends = { aiReplies: number[]; conversations: number[] };

/** Daily AI replies (drafted or sent) and new conversations, for the Home sparklines. */
export async function loadTrends(db: Db, shopId: string, now: Date = new Date()): Promise<Trends> {
  const since = new Date(now.getTime() - TREND_DAYS * 86_400_000).toISOString();
  const [{ data: ai }, { data: convs }] = await Promise.all([
    db.from("messages").select("created_at").eq("shop_id", shopId).eq("role", "ai").gte("created_at", since).limit(5000),
    db.from("conversations").select("created_at").eq("shop_id", shopId).neq("channel", "sandbox").gte("created_at", since).limit(5000),
  ]);
  return {
    aiReplies: dailyBuckets((ai ?? []).map((m) => m.created_at), now),
    conversations: dailyBuckets((convs ?? []).map((c) => c.created_at), now),
  };
}
