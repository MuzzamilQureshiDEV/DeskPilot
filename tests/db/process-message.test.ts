import type Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { MessagesClient } from "@/lib/ai/agent";
import { MODELS } from "@/lib/ai/models";
import { markFailed, prepareRun, runAndDecide, saveResult, type MessageRef } from "@/lib/ai/process-message";
import { buildSandboxStore } from "@/lib/sandbox/data";
import { SandboxProvider } from "@/lib/sandbox/provider";

import { adminClient, createTestUser, deleteTestUser, hasDbEnv, type Db, type TestUser } from "./helpers";

const provider = new SandboxProvider(buildSandboxStore());
let blockId = 0;

function scripted(...turns: { name: string; input: unknown }[][]): MessagesClient {
  let i = 0;
  return {
    messages: {
      async create() {
        const calls = turns[Math.min(i++, turns.length - 1)] ?? [];
        return {
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: MODELS.agent,
          content: calls.map((c) => ({ type: "tool_use", id: `toolu_${++blockId}`, name: c.name, input: c.input, caller: { type: "direct" } })),
          stop_reason: "tool_use",
          stop_sequence: null,
          stop_details: null,
          container: null,
          diagnostics: null,
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 50,
            cache_creation: null,
            inference_geo: null,
            output_tokens_details: null,
            server_tool_use: null,
            service_tier: "standard",
          },
        } satisfies Anthropic.Message;
      },
    },
  };
}

const respond = (over: Record<string, unknown> = {}) => ({
  name: "respond",
  input: {
    reply: "Hi Emma,\n\nThanks for reaching out.\n\nAva",
    confidence: 0.9,
    category: "general",
    sentiment: "neutral",
    tags: ["test"],
    escalate: false,
    escalate_reason: "",
    reasoning: "Test reply.",
    ...over,
  },
});

describe.skipIf(!hasDbEnv)("process-message pipeline (live DB, fake model)", () => {
  let admin: Db;
  let user: TestUser | undefined;
  let shopId = "";
  let customerId = "";

  beforeAll(async () => {
    admin = adminClient();
    user = await createTestUser(admin, { shopName: "Pipeline Test" });
    shopId = (await admin.from("shop_members").select("shop_id").eq("user_id", user.id).single()).data?.shop_id ?? "";
    customerId =
      (await admin.from("customers").insert({ shop_id: shopId, email: "emma.larsen@example.com", name: "Emma Larsen" }).select("id").single())
        .data?.id ?? "";
  });

  afterAll(async () => {
    if (!admin) return;
    if (shopId) await admin.from("shops").delete().eq("id", shopId);
    await deleteTestUser(admin, user);
  });

  beforeEach(async () => {
    await admin.from("usage_events").delete().eq("shop_id", shopId);
    await admin.from("shops").update({ plan: "trial", trial_ends_at: new Date(Date.now() + 7 * 86_400_000).toISOString() }).eq("id", shopId);
  });

  async function newConversation(body: string): Promise<MessageRef> {
    const { data: conv } = await admin
      .from("conversations")
      .insert({ shop_id: shopId, customer_id: customerId, channel: "email", subject: "Test" })
      .select("id")
      .single();
    const { data: msg } = await admin
      .from("messages")
      .insert({ shop_id: shopId, conversation_id: conv?.id ?? "", role: "customer", status: "received", body })
      .select("id")
      .single();
    return { shopId, conversationId: conv?.id ?? "", messageId: msg?.id ?? "" };
  }

  async function run(ref: MessageRef, client: MessagesClient) {
    const prepared = await prepareRun(admin, ref);
    if (prepared.skip !== null) throw new Error(`skipped: ${prepared.skip}`);
    return runAndDecide(prepared.input, { client, provider });
  }

  it("saves a draft reply, updates the conversation and records usage", async () => {
    const ref = await newConversation("Hi, do you have gift cards?");
    const prepared = await prepareRun(admin, ref);
    expect(prepared.skip).toBeNull();
    if (prepared.skip === null) {
      expect(prepared.input.customerEmail).toBe("emma.larsen@example.com");
      expect(prepared.input.history).toEqual([{ role: "customer", body: "Hi, do you have gift cards?" }]);
      expect(Object.keys(prepared.input.settings)).toHaveLength(8);
    }

    const data = await run(ref, scripted([respond({ category: "product" })]));
    const id = await saveResult(admin, ref, data);

    const { data: msg } = await admin.from("messages").select("role, status, body, confidence").eq("id", id).single();
    expect(msg).toMatchObject({ role: "ai", status: "draft", confidence: 0.9 });
    const { data: conv } = await admin.from("conversations").select("status, sentiment, tags").eq("id", ref.conversationId).single();
    expect(conv).toEqual({ status: "ai_drafted", sentiment: "neutral", tags: ["test"] });
    const { data: usage } = await admin.from("usage_events").select("kind, model, input_tokens, output_tokens").eq("shop_id", shopId);
    expect(usage).toEqual([{ kind: "ai_reply", model: MODELS.agent, input_tokens: 150, output_tokens: 20 }]);
  });

  it("turns a proposed cancellation into a pending action awaiting approval", async () => {
    const ref = await newConversation("Please cancel order #1001");
    const data = await run(
      ref,
      scripted(
        [{ name: "lookup_order", input: { order_number: "1001" } }],
        [{ name: "propose_cancellation", input: { order_id: "gid://sandbox/Order/1001", reason: "Wrong size" } }],
        [respond({ category: "cancel" })],
      ),
    );
    await saveResult(admin, ref, data);

    const { data: actions } = await admin.from("action_requests").select("type, status, decided_by, payload").eq("conversation_id", ref.conversationId);
    expect(actions).toHaveLength(1);
    expect(actions?.[0]).toMatchObject({ type: "cancel", status: "pending", decided_by: null, payload: { order_number: "#1001" } });
    const { data: conv } = await admin.from("conversations").select("status").eq("id", ref.conversationId).single();
    expect(conv?.status).toBe("awaiting_approval");
  });

  it("saving the same run twice changes nothing the second time", async () => {
    const ref = await newConversation("Cancel #1001 please");
    const data = await run(
      ref,
      scripted(
        [{ name: "lookup_order", input: { order_number: "1001" } }],
        [{ name: "propose_cancellation", input: { order_id: "gid://sandbox/Order/1001", reason: "x" } }],
        [respond({ category: "cancel" })],
      ),
    );
    const first = await saveResult(admin, ref, data);
    const second = await saveResult(admin, ref, data);
    expect(second).toBe(first);

    const count = async (table: "messages" | "action_requests" | "usage_events", col = "conversation_id") =>
      (await admin.from(table).select("id", { count: "exact", head: true }).eq(col, ref.conversationId)).count;
    expect(await count("messages")).toBe(2); // customer + one AI reply
    expect(await count("action_requests")).toBe(1);
    expect(await count("usage_events")).toBe(1);
    expect((await prepareRun(admin, ref)).skip).toBe("already_answered");
  });

  it("skips paused, taken-over and superseded conversations", async () => {
    const paused = await newConversation("Hello?");
    await admin.from("conversations").update({ ai_paused: true }).eq("id", paused.conversationId);
    expect((await prepareRun(admin, paused)).skip).toBe("ai_paused");

    const human = await newConversation("Hello?");
    await admin.from("conversations").update({ status: "human" }).eq("id", human.conversationId);
    expect((await prepareRun(admin, human)).skip).toBe("handled_by_human");

    const older = await newConversation("First message");
    await admin
      .from("messages")
      .insert({ shop_id: shopId, conversation_id: older.conversationId, role: "customer", status: "received", body: "Second message", created_at: new Date(Date.now() + 1000).toISOString() });
    expect((await prepareRun(admin, older)).skip).toBe("newer_message");
  });

  it("stops at the plan limit and when the trial has ended", async () => {
    const ref = await newConversation("Any news?");
    await admin.from("usage_events").insert(Array.from({ length: 25 }, () => ({ shop_id: shopId, kind: "ai_reply" })));
    expect((await prepareRun(admin, ref)).skip).toBe("usage_limit");

    await admin.from("usage_events").delete().eq("shop_id", shopId);
    await admin.from("shops").update({ trial_ends_at: new Date(Date.now() - 86_400_000).toISOString() }).eq("id", shopId);
    expect((await prepareRun(admin, ref)).skip).toBe("trial_ended");
  });

  it("a failed run leaves one note and escalates the conversation", async () => {
    const ref = await newConversation("Hello?");
    await markFailed(admin, ref, "the AI service rejected the request");
    await markFailed(admin, ref, "the AI service rejected the request");
    const { data: notes } = await admin.from("messages").select("role, body").eq("conversation_id", ref.conversationId).eq("role", "system");
    expect(notes).toHaveLength(1);
    expect(notes?.[0]?.body).toContain("Please reply yourself");
    const { data: conv } = await admin.from("conversations").select("status").eq("id", ref.conversationId).single();
    expect(conv?.status).toBe("escalated");
    // System notes are never shown to the AI as conversation history.
    const prepared = await prepareRun(admin, { ...ref });
    if (prepared.skip === null) expect(prepared.input.history.every((m) => m.role !== ("system" as string))).toBe(true);
  });

  it("signed-in users can't call record_agent_result", async () => {
    if (!user) throw new Error("not set up");
    const ref = await newConversation("x");
    const res = await user.client.rpc("record_agent_result", {
      p_shop_id: ref.shopId,
      p_conversation_id: ref.conversationId,
      p_source_message_id: ref.messageId,
      p_reply: { status: "sent", body: "fake", confidence: 1, reasoning: "x" },
      p_conversation: { status: "open", sentiment: "neutral", tags: [] },
      p_actions: [{ type: "refund", payload: {}, ai_reasoning: "x" }],
      p_usage: { model: "x", input_tokens: 0, output_tokens: 0 },
    });
    expect(res.error).not.toBeNull();
  });
});
