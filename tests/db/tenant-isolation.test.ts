import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  adminClient,
  anonClient,
  createTestUser,
  deleteTestUser,
  hasDbEnv,
  type Db,
  type TestUser,
} from "./helpers";

type Seeded = {
  shopId: string;
  customerId: string;
  conversationId: string;
  messageId: string;
  knowledgeId: string;
  actionId: string;
};

function must<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error;
  if (res.data === null || res.data === undefined) throw new Error("no data");
  return res.data;
}

/** Seeds one shop owned by `userId` with one row in each tenant table. */
async function seedShop(admin: Db, userId: string, label: string): Promise<Seeded> {
  const shop = must(
    await admin
      .from("shops")
      .insert({ name: `Test shop ${label}`, shopify_token_enc: `secret-${label}` })
      .select("id")
      .single(),
  );
  must(
    await admin
      .from("shop_members")
      .insert({ shop_id: shop.id, user_id: userId })
      .select()
      .single(),
  );
  const customer = must(
    await admin
      .from("customers")
      .insert({ shop_id: shop.id, email: `cust-${label}@example.test` })
      .select("id")
      .single(),
  );
  const conversation = must(
    await admin
      .from("conversations")
      .insert({
        shop_id: shop.id,
        customer_id: customer.id,
        channel: "email",
        subject: `Where is my order? (${label})`,
      })
      .select("id")
      .single(),
  );
  const message = must(
    await admin
      .from("messages")
      .insert({
        shop_id: shop.id,
        conversation_id: conversation.id,
        role: "customer",
        status: "received",
        body: `Hello from ${label}`,
      })
      .select("id")
      .single(),
  );
  const knowledge = must(
    await admin
      .from("knowledge")
      .insert({ shop_id: shop.id, kind: "policy", title: "Returns", content: "30 days" })
      .select("id")
      .single(),
  );
  const action = must(
    await admin
      .from("action_requests")
      .insert({
        shop_id: shop.id,
        conversation_id: conversation.id,
        type: "refund",
        payload: { order_id: "1001", amount: "10.00" },
      })
      .select("id")
      .single(),
  );
  return {
    shopId: shop.id,
    customerId: customer.id,
    conversationId: conversation.id,
    messageId: message.id,
    knowledgeId: knowledge.id,
    actionId: action.id,
  };
}

describe.skipIf(!hasDbEnv)("tenant isolation (RLS, live DB)", () => {
  let admin: Db;
  let a: TestUser | undefined;
  let b: TestUser | undefined;
  let shopA: Seeded;
  let shopB: Seeded;

  beforeAll(async () => {
    admin = adminClient();
    a = await createTestUser(admin);
    b = await createTestUser(admin);
    shopA = await seedShop(admin, a.id, "A");
    shopB = await seedShop(admin, b.id, "B");
  });

  afterAll(async () => {
    if (!admin) return;
    const ids = [shopA?.shopId, shopB?.shopId].filter((id): id is string => !!id);
    if (ids.length) await admin.from("shops").delete().in("id", ids);
    await deleteTestUser(admin, a);
    await deleteTestUser(admin, b);
  });

  function userA(): Db {
    if (!a) throw new Error("user A not set up");
    return a.client;
  }

  it("a member sees only their own shop's rows", async () => {
    const tables = ["conversations", "messages", "knowledge", "action_requests", "customers"] as const;
    for (const table of tables) {
      const rows = must(await userA().from(table).select("shop_id"));
      expect(rows.length, table).toBeGreaterThan(0);
      expect(rows.every((r) => r.shop_id === shopA.shopId), table).toBe(true);
    }

    const shops = must(await userA().from("shops").select("id"));
    expect(shops.map((s) => s.id)).toEqual([shopA.shopId]);

    const members = must(await userA().from("shop_members").select("shop_id"));
    expect(members.map((m) => m.shop_id)).toEqual([shopA.shopId]);
  });

  it("another shop's rows are invisible even when queried by id", async () => {
    const conv = must(await userA().from("conversations").select("id").eq("id", shopB.conversationId));
    const msg = must(await userA().from("messages").select("id").eq("id", shopB.messageId));
    const act = must(await userA().from("action_requests").select("id").eq("id", shopB.actionId));
    const shop = must(await userA().from("shops").select("id").eq("id", shopB.shopId));
    expect([conv, msg, act, shop].map((r) => r.length)).toEqual([0, 0, 0, 0]);
  });

  it("cannot insert rows into another shop", async () => {
    const res = await userA()
      .from("conversations")
      .insert({ shop_id: shopB.shopId, channel: "email", subject: "sneaky" });
    expect(res.error).not.toBeNull();
  });

  it("cannot attach a message to another shop's conversation (composite FK)", async () => {
    const res = await userA().from("messages").insert({
      shop_id: shopA.shopId,
      conversation_id: shopB.conversationId,
      role: "human",
      status: "sent",
      body: "cross-tenant",
    });
    expect(res.error?.code).toBe("23503");
  });

  it("cannot update or delete another shop's rows", async () => {
    const upd = must(
      await userA()
        .from("conversations")
        .update({ subject: "hacked" })
        .eq("id", shopB.conversationId)
        .select("id"),
    );
    const del = must(
      await userA().from("knowledge").delete().eq("id", shopB.knowledgeId).select("id"),
    );
    expect(upd).toHaveLength(0);
    expect(del).toHaveLength(0);

    const conv = must(
      await admin.from("conversations").select("subject").eq("id", shopB.conversationId).single(),
    );
    expect(conv.subject).toBe("Where is my order? (B)");
    const kn = must(await admin.from("knowledge").select("id").eq("id", shopB.knowledgeId));
    expect(kn).toHaveLength(1);
  });

  it("can never read or write shopify_token_enc", async () => {
    const read = await userA().from("shops").select("shopify_token_enc");
    expect(read.error).not.toBeNull();

    const write = await userA()
      .from("shops")
      .update({ shopify_token_enc: "overwritten" })
      .eq("id", shopA.shopId);
    expect(write.error).not.toBeNull();

    // Safe columns still work for members.
    const ok = must(
      await userA().from("shops").update({ agent_name: "Nova" }).eq("id", shopA.shopId).select("agent_name"),
    );
    expect(ok).toEqual([{ agent_name: "Nova" }]);
  });

  it("members cannot create or decide action requests, or write usage", async () => {
    const insert = await userA().from("action_requests").insert({
      shop_id: shopA.shopId,
      conversation_id: shopA.conversationId,
      type: "refund",
      payload: {},
    });
    expect(insert.error).not.toBeNull();

    const approve = await userA()
      .from("action_requests")
      .update({ status: "approved", decided_by: a?.id })
      .eq("id", shopA.actionId);
    expect(approve.error).not.toBeNull();

    const usage = await userA()
      .from("usage_events")
      .insert({ shop_id: shopA.shopId, kind: "ai_reply" });
    expect(usage.error).not.toBeNull();

    const action = must(
      await admin.from("action_requests").select("status").eq("id", shopA.actionId).single(),
    );
    expect(action.status).toBe("pending");
  });

  it("the DB rejects an approved action without a human decision", async () => {
    for (const status of ["approved", "executing", "executed"] as const) {
      const res = await admin
        .from("action_requests")
        .update({ status })
        .eq("id", shopA.actionId);
      expect(res.error?.code, status).toBe("23514");
    }
  });

  it("the DB rejects autopilot for money categories", async () => {
    for (const category of ["refund", "cancel", "address_change"] as const) {
      const res = await admin
        .from("automation_settings")
        .insert({ shop_id: shopA.shopId, category, mode: "autopilot" });
      expect(res.error?.code, category).toBe("23514");
    }
    const ok = await userA()
      .from("automation_settings")
      .insert({ shop_id: shopA.shopId, category: "order_status", mode: "autopilot" });
    expect(ok.error).toBeNull();
  });

  it("anonymous visitors can read nothing", async () => {
    const anon = anonClient();
    for (const table of ["shops", "conversations", "messages", "action_requests"] as const) {
      const res = await anon.from(table).select("id");
      expect(res.data ?? [], table).toHaveLength(0);
    }
  });
});
