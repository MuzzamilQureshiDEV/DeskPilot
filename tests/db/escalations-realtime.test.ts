import type { RealtimeChannel } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { markFailed, saveResult, type SaveData } from "@/lib/ai/process-message";

import { adminClient, createTestUser, deleteTestUser, hasDbEnv, type Db, type TestUser } from "./helpers";

const save = (status: string, reason: string | null): SaveData => ({
  reply: { status: "draft", body: "Holding reply", confidence: 0.3, reasoning: "test" },
  conversation: { status, sentiment: "neutral", tags: [], escalation_reason: reason },
  actions: [],
  usage: { model: "test", input_tokens: 1, output_tokens: 1 },
  meta: { fallback: null, tools: [] },
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!hasDbEnv)("escalations + realtime (live DB)", () => {
  let admin: Db;
  let userA: TestUser | undefined;
  let userB: TestUser | undefined;
  let shopA = "";
  let shopB = "";
  let customerA = "";

  async function conversationWithMessage(shopId: string, customerId: string | null) {
    const { data: conv } = await admin
      .from("conversations")
      .insert({ shop_id: shopId, customer_id: customerId, channel: "email", subject: "Where is my refund?" })
      .select("id")
      .single();
    const { data: msg } = await admin
      .from("messages")
      .insert({ shop_id: shopId, conversation_id: conv!.id, role: "customer", status: "received", body: "Hello" })
      .select("id")
      .single();
    return { shopId, conversationId: conv!.id, messageId: msg!.id };
  }

  const convRow = async (id: string) =>
    (await admin.from("conversations").select("status, escalation_reason, escalated_at").eq("id", id).single()).data;

  beforeAll(async () => {
    admin = adminClient();
    userA = await createTestUser(admin, { shopName: "Realtime A" });
    userB = await createTestUser(admin, { shopName: "Realtime B" });
    shopA = (await admin.from("shop_members").select("shop_id").eq("user_id", userA.id).single()).data?.shop_id ?? "";
    shopB = (await admin.from("shop_members").select("shop_id").eq("user_id", userB.id).single()).data?.shop_id ?? "";
    customerA = (await admin.from("customers").insert({ shop_id: shopA, email: "rt@example.com" }).select("id").single()).data?.id ?? "";
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of [shopA, shopB]) if (id) await admin.from("shops").delete().eq("id", id);
    await deleteTestUser(admin, userA);
    await deleteTestUser(admin, userB);
  });

  it("saves the AI's reason when it escalates, and keeps it as history afterwards", async () => {
    const ref = await conversationWithMessage(shopA, customerA);
    await saveResult(admin, ref, save("escalated", "Order not found in Shopify."));
    const row = await convRow(ref.conversationId);
    expect(row).toMatchObject({ status: "escalated", escalation_reason: "Order not found in Shopify." });
    expect(row?.escalated_at).not.toBeNull();

    // A later non-escalated run doesn't wipe the history.
    const { data: next } = await admin
      .from("messages")
      .insert({ shop_id: shopA, conversation_id: ref.conversationId, role: "customer", status: "received", body: "Any news?" })
      .select("id")
      .single();
    await saveResult(admin, { ...ref, messageId: next!.id }, save("ai_drafted", null));
    expect(await convRow(ref.conversationId)).toMatchObject({ status: "ai_drafted", escalation_reason: "Order not found in Shopify." });
  });

  it("uses a fallback reason when the AI gives none, and markFailed records why", async () => {
    const ref = await conversationWithMessage(shopA, customerA);
    await saveResult(admin, ref, save("escalated", ""));
    expect((await convRow(ref.conversationId))?.escalation_reason).toBe("Needs a person");

    const failed = await conversationWithMessage(shopA, customerA);
    await markFailed(admin, failed, "an error");
    expect(await convRow(failed.conversationId)).toMatchObject({
      status: "escalated",
      escalation_reason: "The AI couldn't reply automatically (an error).",
    });
  });

  it("sends live changes only to members of the shop", async () => {
    const ref = await conversationWithMessage(shopA, customerA);
    const seen = { a: 0, b: 0 };
    const channels: [Db, RealtimeChannel][] = [];

    // Shop B's user tries to listen to shop A's rows; RLS must block it.
    for (const [key, user] of [
      ["a", userA!],
      ["b", userB!],
    ] as const) {
      const ready = new Promise<void>((resolve, reject) => {
        const ch = user.client
          .channel(`test-${key}-${Date.now()}`)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations", filter: `shop_id=eq.${shopA}` }, () => {
            seen[key]++;
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") resolve();
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(`realtime ${status}`));
          });
        channels.push([user.client, ch]);
      });
      await ready;
    }
    await wait(3000); // Realtime needs a moment after SUBSCRIBED before changes flow

    // Change shop A's conversation (retrying, in case the first change lands before listening starts).
    for (let attempt = 0; attempt < 4 && seen.a === 0; attempt++) {
      await admin.from("conversations").update({ tags: [`live-${attempt}`] }).eq("id", ref.conversationId);
      for (let i = 0; i < 20 && seen.a === 0; i++) await wait(250);
    }
    await wait(1500); // give B every chance to (wrongly) receive it

    for (const [client, ch] of channels) await client.removeChannel(ch);
    expect(seen.a).toBeGreaterThan(0);
    expect(seen.b).toBe(0);
  }, 60_000);
});
