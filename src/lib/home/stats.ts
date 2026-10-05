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

  const [openConversations, aiRepliesSent, escalated, pendingApprovals, resolved, confidences] = await Promise.all([
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
    resolved,
    avgConfidence: average((confidences.data ?? []).map((m) => Number(m.confidence))),
  };
}
