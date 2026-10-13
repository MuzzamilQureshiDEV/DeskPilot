import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { sendTeamAlert, TransientAlertError, type SendFn } from "@/lib/notifications/send-team-alert";

import { adminClient, createTestUser, deleteTestUser, hasDbEnv, type Db, type TestUser } from "./helpers";

describe.skipIf(!hasDbEnv)("team alerts (live DB)", () => {
  let admin: Db;
  let a: TestUser | undefined;
  let b: TestUser | undefined;
  let shopA = "";
  let shopB = "";

  beforeAll(async () => {
    admin = adminClient();
    a = await createTestUser(admin, { shopName: "Alerts A" });
    b = await createTestUser(admin, { shopName: "Alerts B" });
    const shopOf = async (u: TestUser) => (await admin.from("shop_members").select("shop_id").eq("user_id", u.id).single()).data?.shop_id ?? "";
    shopA = await shopOf(a);
    shopB = await shopOf(b);
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("shops").delete().in("id", [shopA, shopB].filter(Boolean));
    await deleteTestUser(admin, a);
    await deleteTestUser(admin, b);
  });

  async function conversation(status: "escalated" | "awaiting_approval") {
    const { data: cust } = await admin.from("customers").insert({ shop_id: shopA, email: `ayumu-${Math.random().toString(36).slice(2)}@example.com`, name: "Ayumu" }).select("id").single();
    const { data: conv } = await admin
      .from("conversations")
      .insert({ shop_id: shopA, customer_id: cust!.id, channel: "chat", status, subject: "order #1001", escalation_reason: status === "escalated" ? "Can't reach orders." : null })
      .select("id")
      .single();
    await admin.from("messages").insert({ shop_id: shopA, conversation_id: conv!.id, role: "customer", status: "received", body: "can you check my order #1001" });
    return conv!.id;
  }

  const deps = (send: SendFn) => ({
    appUrl: "https://www.astadesk.com",
    send,
    userEmail: async (id: string) => (await admin.auth.admin.getUserById(id)).data.user?.email ?? null,
  });

  it("escalation: one email to the owner, never twice for the same key", async () => {
    const conversationId = await conversation("escalated");
    const send = vi.fn<SendFn>(async () => ({ ok: true }));
    const req = { shopId: shopA, conversationId, kind: "escalated" as const, key: "msg-1" };
    expect(await sendTeamAlert(admin, req, deps(send))).toEqual({ status: "sent", recipients: 1 });
    expect(await sendTeamAlert(admin, req, deps(send))).toEqual({ status: "skipped", reason: "duplicate" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({ to: a!.email, subject: expect.stringContaining("Ava needs you: Ayumu") });
  });

  it("skips when switched off, or when the conversation was already handled", async () => {
    const conversationId = await conversation("escalated");
    const send = vi.fn<SendFn>(async () => ({ ok: true }));
    await admin.from("shops").update({ notify_escalations: false }).eq("id", shopA);
    expect(await sendTeamAlert(admin, { shopId: shopA, conversationId, kind: "escalated", key: "k" }, deps(send))).toEqual({ status: "skipped", reason: "switched_off" });
    await admin.from("shops").update({ notify_escalations: true }).eq("id", shopA);
    await admin.from("conversations").update({ status: "resolved" }).eq("id", conversationId);
    expect(await sendTeamAlert(admin, { shopId: shopA, conversationId, kind: "escalated", key: "k" }, deps(send))).toEqual({ status: "skipped", reason: "no_longer_needed" });
    expect(send).not.toHaveBeenCalled();
  });

  it("approval: lists the pending action, and a temporary email error releases the claim for a retry", async () => {
    const conversationId = await conversation("awaiting_approval");
    await admin.from("action_requests").insert({ shop_id: shopA, conversation_id: conversationId, type: "cancel", payload: { order_id: "gid://shopify/Order/1", order_number: "#1048" } });
    const req = { shopId: shopA, conversationId, kind: "approval" as const, key: "msg-2" };
    const flaky = vi.fn<SendFn>(async () => ({ ok: false, error: "Postmark busy", transient: true }));
    await expect(sendTeamAlert(admin, req, deps(flaky))).rejects.toBeInstanceOf(TransientAlertError);
    const ok = vi.fn<SendFn>(async () => ({ ok: true }));
    expect(await sendTeamAlert(admin, req, deps(ok))).toEqual({ status: "sent", recipients: 1 });
    expect(ok.mock.calls[0]![0].subject).toBe("Approval needed: Cancel order · order #1048");
  });

  it("owners change their own switches; nobody reads the alert log from the browser", async () => {
    const own = await a!.client.from("shops").update({ notify_approvals: false }).eq("id", shopA).select("notify_approvals");
    expect(own.data).toEqual([{ notify_approvals: false }]);
    const other = await a!.client.from("shops").update({ notify_approvals: false }).eq("id", shopB).select("id");
    expect(other.data ?? []).toEqual([]);
    expect((await admin.from("shops").select("notify_approvals").eq("id", shopB).single()).data?.notify_approvals).toBe(true);
    const log = await a!.client.from("team_alerts").select("*");
    expect(log.error).not.toBeNull();
  });
});
