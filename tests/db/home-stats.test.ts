import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadHomeStats, loadTrends } from "@/lib/home/stats";

import { adminClient, createTestUser, deleteTestUser, hasDbEnv, type Db, type TestUser } from "./helpers";

describe.skipIf(!hasDbEnv)("home stats (live DB)", () => {
  let admin: Db;
  let a: TestUser | undefined;
  let b: TestUser | undefined;
  let shopA = "";
  let shopB = "";

  beforeAll(async () => {
    admin = adminClient();
    a = await createTestUser(admin, { shopName: "Stats A" });
    b = await createTestUser(admin, { shopName: "Stats B" });
    const shopOf = async (u: TestUser) =>
      (await admin.from("shop_members").select("shop_id").eq("user_id", u.id).single()).data?.shop_id ?? "";
    shopA = await shopOf(a);
    shopB = await shopOf(b);

    const conv = async (status: string) =>
      (await admin.from("conversations").insert({ shop_id: shopA, channel: "email", status: status as "open" }).select("id").single()).data?.id ?? "";
    const open = await conv("open");
    const escalated = await conv("escalated");
    await conv("resolved");
    await conv("resolved");
    await admin.from("messages").insert([
      { shop_id: shopA, conversation_id: open, role: "ai", status: "sent", body: "a", confidence: 0.9 },
      { shop_id: shopA, conversation_id: open, role: "ai", status: "draft", body: "b", confidence: 0.5 },
      { shop_id: shopA, conversation_id: escalated, role: "ai", status: "sent", body: "c", confidence: 0.7 },
    ]);
    // Old reply, outside the 30-day window. (Separate insert: in a bulk insert,
    // columns missing from some rows become null instead of their default.)
    await admin
      .from("messages")
      .insert({ shop_id: shopA, conversation_id: open, role: "ai", status: "sent", body: "d", confidence: 0.1, created_at: "2026-01-01T00:00:00Z" });
    await admin.from("action_requests").insert([
      { shop_id: shopA, conversation_id: open, type: "refund", payload: {}, status: "pending" },
      { shop_id: shopA, conversation_id: open, type: "cancel", payload: {}, status: "rejected" },
    ]);
    // Another shop's data must never be counted.
    const other = (await admin.from("conversations").insert({ shop_id: shopB, channel: "email", status: "escalated" }).select("id").single()).data?.id ?? "";
    await admin.from("messages").insert({ shop_id: shopB, conversation_id: other, role: "ai", status: "sent", body: "x", confidence: 0.01 });
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("shops").delete().in("id", [shopA, shopB].filter(Boolean));
    await deleteTestUser(admin, a);
    await deleteTestUser(admin, b);
  });

  it("counts this shop's conversations, replies and approvals", async () => {
    if (!a) throw new Error("not set up");
    const stats = await loadHomeStats(a.client, shopA);
    expect(stats).toMatchObject({
      openConversations: 2,
      aiRepliesSent: 2,
      escalated: 1,
      pendingApprovals: 1,
      resolved: 2,
    });
    expect(stats.avgConfidence).toBeCloseTo((0.9 + 0.5 + 0.7) / 3, 5);
  });

  it("shows nothing of another shop's data", async () => {
    if (!b) throw new Error("not set up");
    // B asking about A's shop gets zeros through RLS.
    expect(await loadHomeStats(b.client, shopA)).toEqual({
      openConversations: 0,
      aiRepliesSent: 0,
      escalated: 0,
      pendingApprovals: 0,
      draftsToReview: 0,
      resolved: 0,
      avgConfidence: null,
    });
    const trends = await loadTrends(b.client, shopA);
    expect(trends.aiReplies.every((n) => n === 0) && trends.conversations.every((n) => n === 0)).toBe(true);
  });
});
