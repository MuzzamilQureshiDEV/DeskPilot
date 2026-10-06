import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { chatShop, postChat, readChat, type ChatDeps } from "@/lib/chat/handlers";
import { threadIdFor } from "@/lib/chat/session";

import { adminClient, createTestUser, deleteTestUser, hasDbEnv, type Db, type TestUser } from "./helpers";

const newToken = () => randomBytes(32).toString("base64url");

describe.skipIf(!hasDbEnv)("storefront chat (live DB)", () => {
  let admin: Db;
  let userA: TestUser | undefined;
  let userB: TestUser | undefined;
  let shopA = "";
  let shopB = "";
  const domainA = `chat-a-${randomUUID().slice(0, 8)}.myshopify.com`;
  const domainB = `chat-b-${randomUUID().slice(0, 8)}.myshopify.com`;
  const queued: string[] = [];
  const deps: ChatDeps = {
    enqueue: async (d) => {
      queued.push(d.messageId);
    },
  };

  beforeAll(async () => {
    admin = adminClient();
    userA = await createTestUser(admin, { shopName: "Chat A" });
    userB = await createTestUser(admin, { shopName: "Chat B" });
    shopA = (await admin.from("shop_members").select("shop_id").eq("user_id", userA.id).single()).data?.shop_id ?? "";
    shopB = (await admin.from("shop_members").select("shop_id").eq("user_id", userB.id).single()).data?.shop_id ?? "";
    await admin.from("shops").update({ shopify_domain: domainA }).eq("id", shopA);
    await admin.from("shops").update({ shopify_domain: domainB }).eq("id", shopB);
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of [shopA, shopB]) if (id) await admin.from("shops").delete().eq("id", id);
    await deleteTestUser(admin, userA);
    await deleteTestUser(admin, userB);
  });

  it("only serves installed stores", async () => {
    expect(await chatShop(admin, domainA)).toEqual({ id: shopA });
    expect(await chatShop(admin, "nobody.myshopify.com")).toMatchObject({ status: 404 });
    await admin.from("shops").update({ shopify_uninstalled_at: new Date().toISOString() }).eq("id", shopB);
    expect(await chatShop(admin, domainB)).toMatchObject({ status: 403 });
    await admin.from("shops").update({ shopify_uninstalled_at: null }).eq("id", shopB);
  });

  it("starts a chat conversation, links an optional email, and queues the AI", async () => {
    const token = newToken();
    const res = await postChat(admin, shopA, { token, text: "Do you have gift cards?", email: "shopper@example.com" }, deps);
    expect("messages" in res && res.messages.map((m) => [m.from, m.body])).toEqual([["you", "Do you have gift cards?"]]);

    const { data: conv } = await admin
      .from("conversations")
      .select("id, channel, status, subject, external_thread_id, customers(email)")
      .eq("shop_id", shopA)
      .eq("external_thread_id", threadIdFor(token))
      .single();
    expect(conv).toMatchObject({ channel: "chat", status: "open", subject: "Do you have gift cards?", customers: { email: "shopper@example.com" } });
    expect(conv?.external_thread_id).not.toContain(token);
    expect(queued).toHaveLength(1);
  });

  it("continues the same conversation for the same visitor, and shows only sent replies", async () => {
    const token = newToken();
    await postChat(admin, shopA, { token, text: "Hello" }, deps);
    await postChat(admin, shopA, { token, text: "Anyone there?" }, deps);
    const { data: convs } = await admin.from("conversations").select("id").eq("shop_id", shopA).eq("external_thread_id", threadIdFor(token));
    expect(convs).toHaveLength(1);
    const convId = convs![0]!.id;

    await admin.from("messages").insert([
      { shop_id: shopA, conversation_id: convId, role: "ai", status: "draft", body: "SECRET DRAFT", reasoning: "internal" },
      { shop_id: shopA, conversation_id: convId, role: "system", status: "received", body: "internal note" },
    ]);
    let read = await readChat(admin, shopA, token);
    expect(read.messages.map((m) => m.body)).toEqual(["Hello", "Anyone there?"]);

    const { data: sent } = await admin
      .from("messages")
      .insert({ shop_id: shopA, conversation_id: convId, role: "human", status: "sent", body: "Hi! Yes, we're here." })
      .select("id, created_at")
      .single();
    read = await readChat(admin, shopA, token);
    expect(read.messages.at(-1)).toMatchObject({ from: "agent", body: "Hi! Yes, we're here." });
    expect(JSON.stringify(read)).not.toMatch(/SECRET DRAFT|internal/);

    // `after` returns only newer messages.
    const later = await readChat(admin, shopA, token, sent!.created_at!);
    expect(later.messages).toEqual([]);
  });

  it("keeps visitors and stores apart", async () => {
    const token = newToken();
    await postChat(admin, shopA, { token, text: "Private question" }, deps);
    // Another visitor, or the same token on another store, sees nothing.
    expect((await readChat(admin, shopA, newToken())).messages).toEqual([]);
    expect((await readChat(admin, shopB, token)).messages).toEqual([]);
    // A message to store B with that token starts a separate conversation there.
    await postChat(admin, shopB, { token, text: "Hi B" }, deps);
    expect((await readChat(admin, shopB, token)).messages.map((m) => m.body)).toEqual(["Hi B"]);
    expect((await readChat(admin, shopA, token)).messages.map((m) => m.body)).toEqual(["Private question"]);
  });

  it("slows down a visitor sending too fast", async () => {
    const token = newToken();
    const statuses: (number | "ok")[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await postChat(admin, shopA, { token, text: `Message ${i}` }, deps);
      statuses.push("status" in res ? res.status : "ok");
    }
    expect(statuses.slice(0, 10).every((s) => s === "ok")).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
