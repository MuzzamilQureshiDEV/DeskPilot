import type { SupabaseClient } from "@supabase/supabase-js";

import { usagePeriodStart } from "@/lib/billing/plans";
import type { Database } from "@/types/database";

/** AI replies generated this usage period. Filters by shop id explicitly (works with any client). */
export async function aiRepliesThisPeriod(
  db: SupabaseClient<Database>,
  shopId: string,
  now: Date,
): Promise<number> {
  const { count, error } = await db
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("kind", "ai_reply")
    .gte("created_at", usagePeriodStart(now).toISOString());
  if (error) throw new Error("Could not count usage");
  return count ?? 0;
}
