import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database, Json } from "@/types/database";

// Shopify app/uninstalled + mandatory privacy webhooks (CLAUDE.md §8, rule 5).
// Runs with the service role after HMAC verification; every query is pinned
// to the shop found by its verified domain. Logs ids only (rule 4).

type Db = SupabaseClient<Database>;

export const WEBHOOK_TOPICS = ["app/uninstalled", "customers/data_request", "customers/redact", "shop/redact"] as const;
export type WebhookTopic = (typeof WEBHOOK_TOPICS)[number];

export type ShopifyWebhookResult =
  | { status: "processed"; topic: WebhookTopic; shopId: string | null }
  | { status: "duplicate" }
  | { status: "ignored"; reason: "unknown_topic" | "unknown_shop" };

const idString = z.union([z.string(), z.number()]).transform(String);
const customerSchema = z.object({
  id: idString.nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
});
const customerPayload = z.object({
  customer: customerSchema,
  orders_to_redact: z.array(idString).optional().default([]),
  orders_requested: z.array(idString).optional().default([]),
  data_request: z.object({ id: idString }).nullish(),
});

const BATCH = 500;

async function shopByDomain(db: Db, domain: string) {
  const { data } = await db.from("shops").select("id, shopify_uninstalled_at").eq("shopify_domain", domain).maybeSingle();
  return data;
}

async function logRequest(
  db: Db,
  row: {
    shopId: string | null;
    domain: string;
    kind: "data_request" | "customer_redact" | "shop_redact";
    status: "received" | "completed" | "no_data";
    customerId?: string | null;
    email?: string | null;
    detail?: Record<string, Json>;
  },
) {
  const { error } = await db.from("privacy_requests").insert({
    shop_id: row.shopId,
    shop_domain: row.domain,
    kind: row.kind,
    status: row.status,
    shopify_customer_id: row.customerId ?? null,
    customer_email: row.email ?? null,
    detail: row.detail ?? {},
    completed_at: row.status === "received" ? null : new Date().toISOString(),
  });
  if (error) throw new Error("Could not log privacy request");
}

/** Delete conversations (cascade: messages, actions, feedback) in batches. Returns how many. */
async function deleteConversations(db: Db, shopId: string, ids: string[]): Promise<number> {
  for (let i = 0; i < ids.length; i += BATCH) {
    const { error } = await db.from("conversations").delete().eq("shop_id", shopId).in("id", ids.slice(i, i + BATCH));
    if (error) throw new Error("Could not delete conversations");
  }
  return ids.length;
}

/** Customer rows matching a Shopify customer (by Shopify id or email). */
async function matchingCustomers(db: Db, shopId: string, customer: z.infer<typeof customerSchema>) {
  const email = customer.email?.trim().toLowerCase() || null;
  const ids = new Set<string>();
  for (const [column, value] of [
    ["shopify_customer_id", customer.id ?? null],
    ["email", email],
  ] as const) {
    if (!value) continue;
    const { data, error } = await db.from("customers").select("id").eq("shop_id", shopId).eq(column, value);
    if (error) throw new Error("Could not look up customer");
    for (const c of data ?? []) ids.add(c.id);
  }
  return { ids: [...ids], email };
}

const orderGids = (ids: string[]) => ids.flatMap((id) => [id, `gid://shopify/Order/${id}`]);

async function onUninstalled(db: Db, shopId: string) {
  const { error } = await db
    .from("shops")
    .update({
      shopify_token_enc: null,
      shopify_refresh_token_enc: null,
      shopify_token_expires_at: null,
      shopify_refresh_expires_at: null,
      shopify_scopes: null,
      shopify_uninstalled_at: new Date().toISOString(),
    })
    .eq("id", shopId);
  if (error) throw new Error("Could not disconnect shop");
}

async function onCustomerRedact(db: Db, shopId: string, domain: string, body: unknown) {
  const payload = customerPayload.parse(body);
  const { ids, email } = await matchingCustomers(db, shopId, payload.customer);

  let conversations = 0;
  if (ids.length) {
    const { data } = await db.from("conversations").select("id").eq("shop_id", shopId).in("customer_id", ids);
    conversations = await deleteConversations(db, shopId, (data ?? []).map((c) => c.id));
    const { error } = await db.from("customers").delete().eq("shop_id", shopId).in("id", ids);
    if (error) throw new Error("Could not delete customer");
  }
  let filtered = 0;
  if (email) {
    const { count } = await db.from("filtered_emails").delete({ count: "exact" }).eq("shop_id", shopId).eq("from_email", email);
    filtered = count ?? 0;
  }
  let actions = 0;
  if (payload.orders_to_redact.length) {
    const { count } = await db
      .from("action_requests")
      .delete({ count: "exact" })
      .eq("shop_id", shopId)
      .in("payload->>order_id", orderGids(payload.orders_to_redact));
    actions = count ?? 0;
  }

  const found = ids.length + filtered + actions > 0;
  await logRequest(db, {
    shopId,
    domain,
    kind: "customer_redact",
    status: found ? "completed" : "no_data",
    customerId: payload.customer.id,
    // Once redacted, keep no email in the log either.
    email: null,
    detail: { customers: ids.length, conversations, filtered_emails: filtered, actions },
  });
}

async function onDataRequest(db: Db, shopId: string, domain: string, body: unknown) {
  const payload = customerPayload.parse(body);
  const { ids, email } = await matchingCustomers(db, shopId, payload.customer);
  let conversations = 0;
  if (ids.length) {
    const { count } = await db.from("conversations").select("id", { count: "exact", head: true }).eq("shop_id", shopId).in("customer_id", ids);
    conversations = count ?? 0;
  }
  await logRequest(db, {
    shopId,
    domain,
    kind: "data_request",
    status: ids.length ? "received" : "no_data",
    customerId: payload.customer.id,
    email,
    detail: { customers: ids.length, conversations, shopify_request_id: payload.data_request?.id ?? null },
  });
}

async function onShopRedact(db: Db, shop: { id: string; shopify_uninstalled_at: string | null }, domain: string) {
  // Reinstalled since (or never uninstalled): the merchant is using the store again.
  if (!shop.shopify_uninstalled_at) {
    await logRequest(db, { shopId: shop.id, domain, kind: "shop_redact", status: "no_data", detail: { skipped: "store_connected" } });
    return;
  }
  const { data } = await db.from("conversations").select("id").eq("shop_id", shop.id);
  const conversations = await deleteConversations(db, shop.id, (data ?? []).map((c) => c.id));
  const { count: customers, error: custErr } = await db.from("customers").delete({ count: "exact" }).eq("shop_id", shop.id);
  if (custErr) throw new Error("Could not delete customers");
  const { count: filtered } = await db.from("filtered_emails").delete({ count: "exact" }).eq("shop_id", shop.id);
  const { error } = await db.from("shops").update({ shopify_domain: null, shopify_connected_at: null }).eq("id", shop.id);
  if (error) throw new Error("Could not clear shop domain");
  // The merchant's own account, settings, knowledge and billing stay.
  await logRequest(db, {
    shopId: shop.id,
    domain,
    kind: "shop_redact",
    status: "completed",
    detail: { customers: customers ?? 0, conversations, filtered_emails: filtered ?? 0 },
  });
}

async function apply(db: Db, topic: string, domain: string, body: unknown): Promise<ShopifyWebhookResult> {
  if (!(WEBHOOK_TOPICS as readonly string[]).includes(topic)) return { status: "ignored", reason: "unknown_topic" };
  const t = topic as WebhookTopic;
  const shop = await shopByDomain(db, domain);

  if (!shop) {
    // Privacy requests for a store we don't (or no longer) know: nothing held, but log it.
    if (t !== "app/uninstalled") {
      const kind = t === "customers/data_request" ? "data_request" : t === "customers/redact" ? "customer_redact" : "shop_redact";
      await logRequest(db, { shopId: null, domain, kind, status: "no_data" });
      return { status: "processed", topic: t, shopId: null };
    }
    return { status: "ignored", reason: "unknown_shop" };
  }

  if (t === "app/uninstalled") await onUninstalled(db, shop.id);
  else if (t === "customers/redact") await onCustomerRedact(db, shop.id, domain, body);
  else if (t === "customers/data_request") await onDataRequest(db, shop.id, domain, body);
  else await onShopRedact(db, shop, domain);
  return { status: "processed", topic: t, shopId: shop.id };
}

/** Process a verified webhook once (deduped on X-Shopify-Webhook-Id). Throws so Shopify retries. */
export async function handleShopifyWebhook(
  db: Db,
  input: { webhookId: string; topic: string; domain: string; body: unknown },
): Promise<ShopifyWebhookResult> {
  const { error: claimError } = await db
    .from("shopify_webhook_events")
    .insert({ webhook_id: input.webhookId, topic: input.topic, shop_domain: input.domain });
  if (claimError) {
    if (claimError.code === "23505") return { status: "duplicate" };
    throw new Error("Could not record webhook");
  }
  try {
    return await apply(db, input.topic, input.domain, input.body);
  } catch (err) {
    await db.from("shopify_webhook_events").delete().eq("webhook_id", input.webhookId);
    throw err;
  }
}
