import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

// Everything AstaDesk holds about one customer, for a Shopify data request.
// Built on demand through the signed-in member's RLS client; never stored.

type Db = SupabaseClient<Database>;

export async function buildCustomerExport(db: Db, shopId: string, requestId: string) {
  const { data: request } = await db
    .from("privacy_requests")
    .select("id, kind, shopify_customer_id, customer_email, created_at")
    .eq("id", requestId)
    .eq("shop_id", shopId)
    .eq("kind", "data_request")
    .maybeSingle();
  if (!request) return null;

  const ids = new Set<string>();
  const customers = [];
  for (const [column, value] of [
    ["shopify_customer_id", request.shopify_customer_id],
    ["email", request.customer_email],
  ] as const) {
    if (!value) continue;
    const { data } = await db.from("customers").select("id, email, name, shopify_customer_id").eq("shop_id", shopId).eq(column, value);
    for (const c of data ?? []) {
      if (ids.has(c.id)) continue;
      ids.add(c.id);
      customers.push(c);
    }
  }

  const { data: conversations } = ids.size
    ? await db
        .from("conversations")
        .select("channel, subject, status, created_at, messages(role, status, body, created_at), action_requests(type, status, payload, created_at, executed_at)")
        .eq("shop_id", shopId)
        .in("customer_id", [...ids])
        .order("created_at")
    : { data: [] };

  return {
    generated_at: new Date().toISOString(),
    request: { id: request.id, received_at: request.created_at, shopify_customer_id: request.shopify_customer_id, email: request.customer_email },
    customers: customers.map(({ email, name, shopify_customer_id }) => ({ email, name, shopify_customer_id })),
    conversations: conversations ?? [],
  };
}
