import type { SupabaseClient } from "@supabase/supabase-js";

import { aiAccess, usagePeriodStart, type AiAccess, type BillingState } from "@/lib/billing/plans";
import type { Database } from "@/types/database";

/** AI replies generated this usage period. Filters by shop id explicitly (works with any client). */
export async function aiRepliesThisPeriod(
  db: SupabaseClient<Database>,
  shopId: string,
  now: Date,
  shop?: BillingState,
): Promise<number> {
  const { count, error } = await db
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("kind", "ai_reply")
    .gte("created_at", usagePeriodStart(now, shop).toISOString());
  if (error) throw new Error("Could not count usage");
  return count ?? 0;
}

/** Usage this period plus whether the AI may run. */
export async function loadAiAccess(
  db: SupabaseClient<Database>,
  shopId: string,
  shop: BillingState,
  now: Date,
): Promise<{ used: number; access: AiAccess }> {
  const used = await aiRepliesThisPeriod(db, shopId, now, shop);
  return { used, access: aiAccess(shop, used, now) };
}
