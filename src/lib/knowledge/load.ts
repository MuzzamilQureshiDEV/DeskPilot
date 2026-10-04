import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { KnowledgeEntry } from "@/lib/ai/tools/types";
import type { Database } from "@/types/database";

/**
 * A shop's knowledge for the agent, newest first (so the 5 most recent example
 * replies are the ones used). Works with the RLS client (user context) or the
 * admin client (jobs): either way it filters by shop id explicitly.
 */
export async function loadKnowledge(
  client: SupabaseClient<Database>,
  shopId: string,
  kinds?: KnowledgeEntry["kind"][],
): Promise<KnowledgeEntry[]> {
  let query = client
    .from("knowledge")
    .select("kind, title, content")
    .eq("shop_id", shopId)
    .order("updated_at", { ascending: false });
  if (kinds) query = query.in("kind", kinds);
  const { data, error } = await query;
  if (error) throw new Error("Could not load knowledge");
  return data;
}
