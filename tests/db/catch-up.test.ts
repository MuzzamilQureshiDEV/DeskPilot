import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { queueUnansweredAfterSubscribe } from "@/lib/billing/catch-up";

import { adminClient, createTestUser, deleteTestUser, hasDbEnv, type Db, type TestUser } from "./helpers";

describe.skipIf(!hasDbEnv)("catch-up after subscribing (live DB)", () => {
  let admin: Db;
  let a: TestUser | undefined;
  let shopId = "";

  beforeAll(async () => {
    admin = adminClient();
    a = await createTestUser(admin, { shopName: "Catch-up shop" });
    shopId = (await admin.from("shop_members").select("shop_id").eq("user_id", a.id).single()).data?.shop_id ?? "";
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("shops").delete().eq("id", shopId);
    await deleteTestUser(admin, a);
  });

  async function conversation(opts: { status?: "open" | "human" | "resolved"; answered?: boolean; daysAgo?: number } = {}) {
    const at = new Date(Date.now() - (opts.daysAgo ?? 0) * 86_400_000).toISOString();
    const { data: c } = await admin
      .from("conversations")
      .insert({ shop_id: shopId, channel: "chat", status: opts.status ?? "open", last_message_at: at })
      .select("id")
      .single();
    const { data: m } = await admin
      .from("messages")
      .insert({ shop_id: shopId, conversation_id: c!.id, role: "customer", status: "received", body: "Where's my order?", created_at: at })
      .select("id")
      .single();
    if (opts.answered) {
      await admin.from("messages").insert({ shop_id: shopId, conversation_id: c!.id, role: "ai", status: "draft", body: "Hi!", external_message_id: `ai:${m!.id}` });
    }
    return { conversationId: c!.id, messageId: m!.id };
  }

  it("does nothing while the shop has no plan", async () => {
    await conversation();
    const enqueue = vi.fn(async () => {});
    expect(await queueUnansweredAfterSubscribe(admin, shopId, enqueue)).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("after subscribing, queues only recent unanswered customer messages", async () => {
    await admin.from("conversations").delete().eq("shop_id", shopId);
    const fresh = await conversation();
    await conversation({ answered: true });
    await conversation({ status: "human" });
    await conversation({ status: "resolved" });
    await conversation({ daysAgo: 10 });
    await admin.from("shops").update({ plan: "starter", subscription_status: "active" }).eq("id", shopId);

    const enqueue = vi.fn(async () => {});
    expect(await queueUnansweredAfterSubscribe(admin, shopId, enqueue)).toBe(1);
    expect(enqueue).toHaveBeenCalledWith({ shopId, conversationId: fresh.conversationId, messageId: fresh.messageId });
  });
});
