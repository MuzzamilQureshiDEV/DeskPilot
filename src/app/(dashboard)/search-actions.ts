"use server";

import { getCurrentShop } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type ConversationHit = { id: string; subject: string; who: string; status: string; channel: string };

/** Characters safe inside a PostgREST filter value. */
const clean = (q: string) => q.replace(/[^\p{L}\p{N}@.\-_ ]/gu, "").trim().slice(0, 80);

/** Conversations matching a customer name/email or subject, for the command palette (RLS client). */
export async function searchConversations(query: string): Promise<ConversationHit[]> {
  const q = clean(query);
  const shop = await getCurrentShop();
  if (!shop) return [];
  const db = await createClient();

  let request = db
    .from("conversations")
    .select("id, subject, status, channel, last_message_at, customers(name, email)")
    .eq("shop_id", shop.id)
    .order("last_message_at", { ascending: false })
    .limit(8);

  if (q.length >= 2) {
    const { data: people } = await db
      .from("customers")
      .select("id")
      .eq("shop_id", shop.id)
      .or(`email.ilike.%${q}%,name.ilike.%${q}%`)
      .limit(50);
    const ids = (people ?? []).map((c) => c.id);
    request = request.or(ids.length ? `subject.ilike.%${q}%,customer_id.in.(${ids.join(",")})` : `subject.ilike.%${q}%`);
  }

  const { data } = await request;
  return (data ?? []).map((c) => ({
    id: c.id,
    subject: c.subject ?? "(no subject)",
    who: c.customers?.name || c.customers?.email || "Customer",
    status: c.status,
    channel: c.channel,
  }));
}
