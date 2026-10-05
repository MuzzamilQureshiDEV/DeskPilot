import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { claimAction, finishAction, markActionFailed, runAction } from "@/lib/actions/execute";
import type { ShopifyConn } from "@/lib/shopify/mutations";

import { adminClient, createTestUser, deleteTestUser, hasDbEnv, type Db, type TestUser } from "./helpers";

describe.skipIf(!hasDbEnv)("action approvals and execution (live DB)", () => {
  let admin: Db;
  let a: TestUser | undefined;
  let b: TestUser | undefined;
  let shopA = "";
  let shopB = "";

  beforeAll(async () => {
    admin = adminClient();
    a = await createTestUser(admin, { shopName: "Actions A" });
    b = await createTestUser(admin, { shopName: "Actions B" });
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

  const user = (u: TestUser | undefined) => {
    if (!u) throw new Error("not set up");
    return u;
  };

  async function pendingCancel() {
    const { data: conv } = await admin
      .from("conversations")
      .insert({ shop_id: shopA, channel: "email", status: "awaiting_approval" })
      .select("id")
      .single();
    const { data: action } = await admin
      .from("action_requests")
      .insert({
        shop_id: shopA,
        conversation_id: conv?.id ?? "",
        type: "cancel",
        payload: { order_id: "gid://shopify/Order/42", order_number: "#1042", refund_amount: "100.00", currency: "USD" },
      })
      .select("id")
      .single();
    return { conversationId: conv?.id ?? "", actionId: action?.id ?? "" };
  }

  const actionRow = async (id: string) =>
    (await admin.from("action_requests").select("status, decided_by, options, result, error").eq("id", id).single()).data;

  describe("deciding", () => {
    it("a member approves: decided_by is recorded and options sanitised", async () => {
      const { actionId } = await pendingCancel();
      const res = await user(a).client.rpc("approve_action_request", {
        p_id: actionId,
        p_options: { notify_customer: false, restock: "yes", evil: "x" },
      });
      expect(res.error).toBeNull();
      expect(res.data).toHaveLength(1);
      expect(await actionRow(actionId)).toMatchObject({
        status: "approved",
        decided_by: user(a).id,
        options: { notify_customer: false, restock: false },
      });
      // A second click is a no-op.
      const again = await user(a).client.rpc("approve_action_request", { p_id: actionId, p_options: {} });
      expect(again.data).toEqual([]);
    });

    it("a member rejects", async () => {
      const { actionId } = await pendingCancel();
      await user(a).client.rpc("reject_action_request", { p_id: actionId });
      expect(await actionRow(actionId)).toMatchObject({ status: "rejected", decided_by: user(a).id });
    });

    it("another shop can't decide, and browsers can't edit actions directly", async () => {
      const { actionId } = await pendingCancel();
      const other = await user(b).client.rpc("approve_action_request", { p_id: actionId, p_options: {} });
      expect(other.error).not.toBeNull();
      const direct = await user(a).client
        .from("action_requests")
        .update({ status: "approved", decided_by: user(a).id })
        .eq("id", actionId);
      expect(direct.error).not.toBeNull();
      expect((await actionRow(actionId))?.status).toBe("pending");
    });
  });

  describe("executing", () => {
    /** Fake Shopify: order exists, unshipped; cancel succeeds. */
    const conn = (): ShopifyConn => ({
      domain: "s.myshopify.com",
      accessToken: "tok",
      sleep: async () => {},
      fetchFn: vi.fn<typeof fetch>(async (_u, init) => {
        const q = String(JSON.parse(String(init?.body)).query);
        const data = q.includes("OrderState")
          ? {
              order: {
                id: "gid://shopify/Order/42",
                name: "#1042",
                cancelledAt: null,
                displayFinancialStatus: "PAID",
                fulfillments: [],
                lineItems: { nodes: [{ id: "li", quantity: 1, unfulfilledQuantity: 1 }] },
                transactions: [],
              },
            }
          : { orderCancel: { job: { id: "gid://shopify/Job/5", done: false }, orderCancelUserErrors: [] } };
        return new Response(JSON.stringify({ data }), { status: 200 });
      }),
    });

    it("only approved actions can be claimed, and only once", async () => {
      const { actionId } = await pendingCancel();
      expect(await claimAction(admin, shopA, actionId)).toBeNull(); // still pending
      await user(a).client.rpc("approve_action_request", { p_id: actionId, p_options: { restock: true } });
      expect(await claimAction(admin, shopB, actionId)).toBeNull(); // wrong shop
      const claimed = await claimAction(admin, shopA, actionId);
      expect(claimed).toMatchObject({ id: actionId, type: "cancel", options: { notifyCustomer: true, restock: true } });
      expect(await claimAction(admin, shopA, actionId)).toBeNull(); // already executing
    });

    it("success: executed with result, a note, and the conversation reopened", async () => {
      const { actionId, conversationId } = await pendingCancel();
      await user(a).client.rpc("approve_action_request", { p_id: actionId, p_options: {} });
      const claimed = await claimAction(admin, shopA, actionId);
      if (!claimed) throw new Error("not claimed");
      const result = await runAction(conn(), claimed);
      await finishAction(admin, claimed, { ok: true, result });
      await finishAction(admin, claimed, { ok: true, result }); // idempotent

      expect(await actionRow(actionId)).toMatchObject({ status: "executed", result: { job_id: "gid://shopify/Job/5" }, error: null });
      const { data: notes } = await admin.from("messages").select("body").eq("conversation_id", conversationId).eq("role", "system");
      expect(notes).toEqual([{ body: "Order #1042 is being cancelled in Shopify." }]);
      expect((await admin.from("conversations").select("status").eq("id", conversationId).single()).data?.status).toBe("open");
    });

    it("failure: failed with the reason, and stuck actions are released", async () => {
      const { actionId, conversationId } = await pendingCancel();
      await user(a).client.rpc("approve_action_request", { p_id: actionId, p_options: {} });
      const claimed = await claimAction(admin, shopA, actionId);
      if (!claimed) throw new Error("not claimed");
      await finishAction(admin, claimed, { ok: false, error: "This order has already shipped, so it can't be cancelled." });
      expect(await actionRow(actionId)).toMatchObject({ status: "failed", error: "This order has already shipped, so it can't be cancelled." });
      const { data: notes } = await admin.from("messages").select("body").eq("conversation_id", conversationId).eq("role", "system");
      expect(notes?.[0]?.body).toContain("Couldn't complete");

      const stuck = await pendingCancel();
      await user(a).client.rpc("approve_action_request", { p_id: stuck.actionId, p_options: {} });
      await markActionFailed(admin, shopA, stuck.actionId, "Shopify didn't respond.");
      expect((await actionRow(stuck.actionId))?.status).toBe("failed");
    });
  });
});
