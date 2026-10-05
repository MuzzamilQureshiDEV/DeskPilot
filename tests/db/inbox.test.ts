import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  rejectDraft,
  sendDraft,
  sendHumanReply,
  setResolved,
  setTakeover,
  unansweredCustomerMessage,
} from "@/lib/inbox/mutations";

import { adminClient, createTestUser, deleteTestUser, hasDbEnv, type Db, type TestUser } from "./helpers";

describe.skipIf(!hasDbEnv)("inbox actions (live DB, RLS client)", () => {
  let admin: Db;
  let a: TestUser | undefined;
  let b: TestUser | undefined;
  let shopA = "";
  let shopB = "";

  beforeAll(async () => {
    admin = adminClient();
    a = await createTestUser(admin, { shopName: "Inbox A" });
    b = await createTestUser(admin, { shopName: "Inbox B" });
    const shopOf = async (u: TestUser) =>
      (await admin.from("shop_members").select("shop_id").eq("user_id", u.id).single()).data?.shop_id ?? "";
    shopA = await shopOf(a);
    shopB = await shopOf(b);
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("shops").delete().in("id", [shopA, shopB].filter(Boolean));
    await deleteTestUser(admin, a);
    await deleteTestUser(admin, b);
  });

  const db = () => {
    if (!a) throw new Error("not set up");
    return a.client;
  };

  /** A conversation with a customer message and an AI draft reply. */
  async function withDraft(status = "ai_drafted") {
    const { data: conv } = await admin
      .from("conversations")
      .insert({ shop_id: shopA, channel: "email", subject: "Help", status: status as "ai_drafted" })
      .select("id, last_message_at")
      .single();
    const conversationId = conv?.id ?? "";
    const { data: cust } = await admin
      .from("messages")
      .insert({ shop_id: shopA, conversation_id: conversationId, role: "customer", status: "received", body: "Where is it?" })
      .select("id")
      .single();
    const { data: draft } = await admin
      .from("messages")
      .insert({
        shop_id: shopA,
        conversation_id: conversationId,
        role: "ai",
        status: "draft",
        body: "It's on the way.",
        external_message_id: `ai:${cust?.id}`,
      })
      .select("id")
      .single();
    return { conversationId, draftId: draft?.id ?? "", customerMessageId: cust?.id ?? "" };
  }

  const conversation = async (id: string) =>
    (await admin.from("conversations").select("status, ai_paused, last_message_at").eq("id", id).single()).data;
  const message = async (id: string) => (await admin.from("messages").select("status, body").eq("id", id).single()).data;

  it("sends a draft once and reopens the conversation", async () => {
    const { conversationId, draftId } = await withDraft();
    expect(await sendDraft(db(), shopA, draftId)).toEqual({ ok: true });
    expect(await message(draftId)).toEqual({ status: "sent", body: "It's on the way." });
    expect((await conversation(conversationId))?.status).toBe("open");
    expect(await sendDraft(db(), shopA, draftId)).toMatchObject({ ok: false });
  });

  it("sends an edited draft and keeps pending approvals visible", async () => {
    const { conversationId, draftId } = await withDraft("awaiting_approval");
    expect(await sendDraft(db(), shopA, draftId, "  Edited reply  ")).toEqual({ ok: true });
    expect(await message(draftId)).toEqual({ status: "sent", body: "Edited reply" });
    expect((await conversation(conversationId))?.status).toBe("awaiting_approval");
    expect(await sendDraft(db(), shopA, (await withDraft()).draftId, "   ")).toMatchObject({ ok: false });
  });

  it("rejects a draft", async () => {
    const { conversationId, draftId } = await withDraft();
    expect(await rejectDraft(db(), shopA, draftId)).toEqual({ ok: true });
    expect((await message(draftId))?.status).toBe("rejected");
    expect((await conversation(conversationId))?.status).toBe("open");
  });

  it("records a merchant's own reply", async () => {
    const { conversationId } = await withDraft();
    expect(await sendHumanReply(db(), shopA, conversationId, "I'll check for you!")).toEqual({ ok: true });
    const { data } = await admin.from("messages").select("role, status, body").eq("conversation_id", conversationId).eq("role", "human");
    expect(data).toEqual([{ role: "human", status: "sent", body: "I'll check for you!" }]);
    expect(await sendHumanReply(db(), shopA, conversationId, "")).toMatchObject({ ok: false });
  });

  it("takes over, hands back, resolves and reopens", async () => {
    const { conversationId } = await withDraft();
    await setTakeover(db(), shopA, conversationId, true);
    expect(await conversation(conversationId)).toMatchObject({ ai_paused: true, status: "human" });
    await setResolved(db(), shopA, conversationId, true);
    expect((await conversation(conversationId))?.status).toBe("resolved");
    await setResolved(db(), shopA, conversationId, false);
    expect((await conversation(conversationId))?.status).toBe("human"); // still taken over
    await setTakeover(db(), shopA, conversationId, false);
    expect(await conversation(conversationId)).toMatchObject({ ai_paused: false, status: "open" });
  });

  it("finds the unanswered customer message", async () => {
    const { conversationId, customerMessageId } = await withDraft();
    // The draft is the AI's answer, so nothing is unanswered.
    expect(await unansweredCustomerMessage(db(), shopA, conversationId)).toBeNull();
    const { data: next } = await admin
      .from("messages")
      .insert({ shop_id: shopA, conversation_id: conversationId, role: "customer", status: "received", body: "Hello?", created_at: new Date(Date.now() + 1000).toISOString() })
      .select("id")
      .single();
    expect(await unansweredCustomerMessage(db(), shopA, conversationId)).toBe(next?.id);
    expect(customerMessageId).not.toBe(next?.id);
  });

  it("another shop can't touch these drafts or conversations", async () => {
    if (!b) throw new Error("not set up");
    const { conversationId, draftId } = await withDraft();
    // B passes its own shop id (the only one RLS lets it act as) …
    expect(await sendDraft(b.client, shopB, draftId)).toMatchObject({ ok: false });
    expect(await rejectDraft(b.client, shopB, draftId)).toMatchObject({ ok: false });
    expect(await sendHumanReply(b.client, shopB, conversationId, "hi")).toMatchObject({ ok: false });
    expect(await setTakeover(b.client, shopB, conversationId, true)).toMatchObject({ ok: false });
    // … and even naming A's shop id gets it nothing through RLS.
    expect(await sendDraft(b.client, shopA, draftId)).toMatchObject({ ok: false });
    expect(await setTakeover(b.client, shopA, conversationId, true)).toMatchObject({ ok: false });
    expect((await message(draftId))?.status).toBe("draft");
    expect((await conversation(conversationId))?.ai_paused).toBe(false);
  });
});
