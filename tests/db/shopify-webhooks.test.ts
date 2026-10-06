import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildCustomerExport } from "@/lib/privacy/export";
import { handleShopifyWebhook } from "@/lib/shopify/webhooks";

import { adminClient, createTestUser, deleteTestUser, hasDbEnv, type Db, type TestUser } from "./helpers";

const tag = () => randomUUID().slice(0, 8);

describe.skipIf(!hasDbEnv)("Shopify webhooks (live DB)", () => {
  let admin: Db;
  let userA: TestUser | undefined;
  let userB: TestUser | undefined;
  let shopA = "";
  let shopB = "";
  const domainA = `wh-a-${tag()}.myshopify.com`;
  const domainB = `wh-b-${tag()}.myshopify.com`;

  const send = (topic: string, domain: string, body: unknown, webhookId = randomUUID()) =>
    handleShopifyWebhook(admin, { webhookId, topic, domain, body });

  /** A customer with one conversation (message + action) and one filtered email. */
  async function seedCustomer(shopId: string, email: string, shopifyId: string | null, orderId = `gid://shopify/Order/${Date.now()}`) {
    const { data: c } = await admin.from("customers").insert({ shop_id: shopId, email, name: "Pat", shopify_customer_id: shopifyId }).select("id").single();
    const { data: conv } = await admin.from("conversations").insert({ shop_id: shopId, customer_id: c!.id, channel: "email", subject: "Help" }).select("id").single();
    await admin.from("messages").insert({ shop_id: shopId, conversation_id: conv!.id, role: "customer", status: "received", body: "My address is 1 Main St" });
    await admin.from("action_requests").insert({ shop_id: shopId, conversation_id: conv!.id, type: "cancel", payload: { order_id: orderId } });
    await admin.from("filtered_emails").insert({ shop_id: shopId, from_email: email, subject: "ooo", reason: "auto_submitted" });
    return { customerId: c!.id, conversationId: conv!.id };
  }

  const count = async (table: "customers" | "conversations" | "messages" | "action_requests" | "filtered_emails", shopId: string) =>
    (await admin.from(table).select("*", { count: "exact", head: true }).eq("shop_id", shopId)).count ?? 0;

  beforeAll(async () => {
    admin = adminClient();
    userA = await createTestUser(admin, { shopName: "Webhook A" });
    userB = await createTestUser(admin, { shopName: "Webhook B" });
    shopA = (await admin.from("shop_members").select("shop_id").eq("user_id", userA.id).single()).data?.shop_id ?? "";
    shopB = (await admin.from("shop_members").select("shop_id").eq("user_id", userB.id).single()).data?.shop_id ?? "";
    const connected = { shopify_token_enc: "v1.x", shopify_refresh_token_enc: "v1.y", shopify_scopes: "read_orders", shopify_connected_at: new Date().toISOString() };
    await admin.from("shops").update({ ...connected, shopify_domain: domainA }).eq("id", shopA);
    await admin.from("shops").update({ ...connected, shopify_domain: domainB }).eq("id", shopB);
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of [shopA, shopB]) if (id) await admin.from("shops").delete().eq("id", id);
    await admin.from("privacy_requests").delete().in("shop_domain", [domainA, domainB, "unknown-shop.myshopify.com"]);
    await admin.from("shopify_webhook_events").delete().in("shop_domain", [domainA, domainB, "unknown-shop.myshopify.com"]);
    await deleteTestUser(admin, userA);
    await deleteTestUser(admin, userB);
  });

  it("deletes one customer's data (by Shopify id or email) and nothing else", async () => {
    const pat = await seedCustomer(shopA, "pat@example.com", "1001", "gid://shopify/Order/555");
    await seedCustomer(shopA, "sam@example.com", "1002");
    await seedCustomer(shopB, "pat@example.com", "1001"); // same person, other store

    const res = await send("customers/redact", domainA, {
      shop_domain: domainA,
      customer: { id: 1001, email: "PAT@example.com", phone: null },
      orders_to_redact: [555],
    });
    expect(res).toMatchObject({ status: "processed", shopId: shopA });

    expect((await admin.from("customers").select("id").eq("id", pat.customerId)).data).toEqual([]);
    expect((await admin.from("conversations").select("id").eq("id", pat.conversationId)).data).toEqual([]);
    expect((await admin.from("messages").select("id").eq("conversation_id", pat.conversationId)).data).toEqual([]);
    expect((await admin.from("filtered_emails").select("id").eq("shop_id", shopA).eq("from_email", "pat@example.com")).data).toEqual([]);
    // Sam (same store) and Pat at store B are untouched.
    expect(await count("customers", shopA)).toBe(1);
    expect(await count("conversations", shopA)).toBe(1);
    expect(await count("customers", shopB)).toBe(1);
    expect(await count("messages", shopB)).toBe(1);

    const { data: log } = await admin.from("privacy_requests").select("kind, status, customer_email, detail").eq("shop_id", shopA).eq("kind", "customer_redact");
    expect(log).toEqual([{ kind: "customer_redact", status: "completed", customer_email: null, detail: { customers: 1, conversations: 1, filtered_emails: 1, actions: 0 } }]);
  });

  it("logs 'no data' for a customer we never saw", async () => {
    await send("customers/redact", domainA, { customer: { id: 999999, email: "nobody@example.com" }, orders_to_redact: [] });
    const { data } = await admin.from("privacy_requests").select("status").eq("shop_id", shopA).eq("shopify_customer_id", "999999");
    expect(data).toEqual([{ status: "no_data" }]);
  });

  it("logs a data request and exports only that customer's data, only for that store's members", async () => {
    await send("customers/data_request", domainA, { customer: { id: 1002, email: "sam@example.com" }, orders_requested: [], data_request: { id: 42 } });
    const { data: req } = await admin.from("privacy_requests").select("id, status, detail").eq("shop_id", shopA).eq("kind", "data_request").single();
    expect(req).toMatchObject({ status: "received", detail: { customers: 1, conversations: 1, shopify_request_id: "42" } });

    const exported = await buildCustomerExport(userA!.client, shopA, req!.id);
    expect(exported?.customers).toEqual([{ email: "sam@example.com", name: "Pat", shopify_customer_id: "1002" }]);
    expect(exported?.conversations).toHaveLength(1);
    expect(JSON.stringify(exported)).not.toContain("pat@example.com");
    // Store B's member can't read store A's request.
    expect(await buildCustomerExport(userB!.client, shopA, req!.id)).toBeNull();

    // Marking it done is a member-only RPC.
    expect((await userB!.client.rpc("complete_privacy_request", { p_id: req!.id })).error).not.toBeNull();
    expect((await userA!.client.rpc("complete_privacy_request", { p_id: req!.id })).error).toBeNull();
  });

  it("processes a repeated webhook once", async () => {
    const id = randomUUID();
    const first = await send("customers/data_request", domainA, { customer: { id: 1, email: "x@example.com" } }, id);
    expect(first.status).toBe("processed");
    expect(await send("customers/data_request", domainA, { customer: { id: 1, email: "x@example.com" } }, id)).toEqual({ status: "duplicate" });
  });

  it("disconnects on uninstall but keeps the store's data", async () => {
    await send("app/uninstalled", domainA, { id: 1, domain: domainA });
    const { data } = await admin
      .from("shops")
      .select("shopify_domain, shopify_token_enc, shopify_refresh_token_enc, shopify_scopes, shopify_uninstalled_at")
      .eq("id", shopA)
      .single();
    expect(data).toMatchObject({ shopify_domain: domainA, shopify_token_enc: null, shopify_refresh_token_enc: null, shopify_scopes: null });
    expect(data?.shopify_uninstalled_at).not.toBeNull();
    expect(await count("customers", shopA)).toBe(1);
    // Store B is still connected.
    expect((await admin.from("shops").select("shopify_token_enc").eq("id", shopB).single()).data?.shopify_token_enc).toBe("v1.x");
  });

  it("skips shop redact when the store is still connected", async () => {
    await send("shop/redact", domainB, { shop_domain: domainB });
    expect(await count("customers", shopB)).toBe(1);
    const { data } = await admin.from("privacy_requests").select("status").eq("shop_id", shopB).eq("kind", "shop_redact");
    expect(data).toEqual([{ status: "no_data" }]);
  });

  it("after uninstall, shop redact deletes customer data but keeps the merchant's account", async () => {
    await admin.from("knowledge").insert({ shop_id: shopA, kind: "policy", title: "Returns", content: "30 days" });
    await send("shop/redact", domainA, { shop_domain: domainA });

    for (const table of ["customers", "conversations", "messages", "action_requests", "filtered_emails"] as const) {
      expect(await count(table, shopA)).toBe(0);
    }
    const { data: shop } = await admin.from("shops").select("id, name, shopify_domain").eq("id", shopA).single();
    expect(shop).toMatchObject({ id: shopA, name: "Webhook A", shopify_domain: null });
    expect((await admin.from("knowledge").select("id").eq("shop_id", shopA)).data).toHaveLength(1);
    expect((await admin.from("shop_members").select("user_id").eq("shop_id", shopA)).data).toHaveLength(1);
    // Store B untouched.
    expect(await count("customers", shopB)).toBe(1);
  });

  it("logs privacy requests for stores we don't know, and ignores unknown topics", async () => {
    expect(await send("customers/redact", "unknown-shop.myshopify.com", { customer: { id: 1 } })).toMatchObject({ status: "processed", shopId: null });
    expect(await send("orders/create", domainB, {})).toEqual({ status: "ignored", reason: "unknown_topic" });
  });
});
