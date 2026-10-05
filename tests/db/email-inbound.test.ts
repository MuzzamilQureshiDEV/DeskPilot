import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { replyAddress } from "@/lib/email/addresses";
import { handleInbound, postmarkInboundSchema, type InboundDeps } from "@/lib/email/inbound";
import { deliverMessage } from "@/lib/email/outbound";

import { adminClient, createTestUser, deleteTestUser, hasDbEnv, type Db, type TestUser } from "./helpers";

const BASE = "inboundtest@inbound.postmarkapp.com";

describe.skipIf(!hasDbEnv)("inbound email (live DB)", () => {
  let admin: Db;
  let user: TestUser | undefined;
  let shopId = "";
  let hash = "";
  const queued: { messageId: string }[] = [];
  const deps: InboundDeps = {
    ownAddresses: ["support@deskpilot.test"],
    enqueue: async (d) => {
      queued.push(d);
    },
  };

  beforeAll(async () => {
    admin = adminClient();
    user = await createTestUser(admin, { shopName: "Email Test" });
    shopId = (await admin.from("shop_members").select("shop_id").eq("user_id", user.id).single()).data?.shop_id ?? "";
    hash = (await admin.from("shops").select("inbound_hash").eq("id", shopId).single()).data?.inbound_hash ?? "";
  });

  afterAll(async () => {
    if (!admin) return;
    if (shopId) await admin.from("shops").delete().eq("id", shopId);
    await deleteTestUser(admin, user);
  });

  function email(over: { from?: string; subject?: string; text?: string; mailboxHash?: string; headers?: { Name: string; Value: string }[]; id?: string }) {
    return postmarkInboundSchema.parse({
      FromFull: { Email: over.from ?? "jamie@example.com", Name: "Jamie" },
      MailboxHash: over.mailboxHash ?? hash,
      Subject: over.subject ?? "Order help",
      MessageID: over.id ?? randomUUID(),
      TextBody: over.text ?? "Where is my order?",
      Headers: over.headers ?? [{ Name: "Message-ID", Value: `<${randomUUID()}@mail.example.com>` }],
    });
  }

  const inbound = (e: ReturnType<typeof email>) => handleInbound(admin, e, deps);

  it("stores a new email as customer + conversation + message, queues it and marks email connected", async () => {
    const r = await inbound(email({ from: "New.Person@Example.com", subject: "Where is #1001?" }));
    expect(r.status).toBe("stored");
    if (r.status !== "stored") return;
    expect(queued.at(-1)?.messageId).toBe(r.messageId);

    const { data: conv } = await admin.from("conversations").select("channel, subject, status, customers(email, name)").eq("id", r.conversationId).single();
    expect(conv).toMatchObject({ channel: "email", subject: "Where is #1001?", status: "open", customers: { email: "new.person@example.com", name: "Jamie" } });
    const { data: msg } = await admin.from("messages").select("role, status, body, rfc_message_id").eq("id", r.messageId).single();
    expect(msg).toMatchObject({ role: "customer", status: "received", body: "Where is my order?" });
    expect(msg?.rfc_message_id).toMatch(/@mail\.example\.com$/);

    const { data: shop } = await admin.from("shops").select("setup").eq("id", shopId).single();
    expect((shop?.setup as Record<string, unknown>).email_connected).toBe(true);
  });

  it("ignores a Postmark retry of the same message", async () => {
    const e = email({ from: "dupe@example.com", subject: "Dupe" });
    expect((await inbound(e)).status).toBe("stored");
    expect(await inbound(e)).toEqual({ status: "duplicate" });
  });

  it("threads a reply to our Reply-To address into the same conversation, and reopens it", async () => {
    const first = await inbound(email({ from: "thread@example.com", subject: "Size question" }));
    if (first.status !== "stored") throw new Error("not stored");
    await admin.from("conversations").update({ status: "resolved" }).eq("id", first.conversationId);
    const { data: conv } = await admin.from("conversations").select("reply_token").eq("id", first.conversationId).single();

    const replyTo = replyAddress(BASE, hash, conv?.reply_token ?? "");
    const mailboxHash = replyTo.split("+")[1]?.split("@")[0] ?? "";
    const reply = await inbound(email({ from: "thread@example.com", subject: "Totally different subject", mailboxHash }));
    expect(reply.status === "stored" && reply.conversationId).toBe(first.conversationId);
    const { data: after } = await admin.from("conversations").select("status").eq("id", first.conversationId).single();
    expect(after?.status).toBe("open");
  });

  it("threads by In-Reply-To when the reply token is missing", async () => {
    const rfc = `${randomUUID()}@mail.example.com`;
    const first = await inbound(email({ from: "irt@example.com", subject: "Return label", headers: [{ Name: "Message-ID", Value: `<${rfc}>` }] }));
    if (first.status !== "stored") throw new Error("not stored");
    const reply = await inbound(email({ from: "irt@example.com", subject: "Another subject", headers: [{ Name: "In-Reply-To", Value: `<${rfc}>` }] }));
    expect(reply.status === "stored" && reply.conversationId).toBe(first.conversationId);
  });

  it("threads by subject within the window, but not into a resolved conversation", async () => {
    const first = await inbound(email({ from: "subj@example.com", subject: "Gift wrap" }));
    if (first.status !== "stored") throw new Error("not stored");
    const second = await inbound(email({ from: "subj@example.com", subject: "RE: Gift wrap", headers: [] }));
    expect(second.status === "stored" && second.conversationId).toBe(first.conversationId);

    await admin.from("conversations").update({ status: "resolved" }).eq("id", first.conversationId);
    const third = await inbound(email({ from: "subj@example.com", subject: "Gift wrap", headers: [] }));
    expect(third.status === "stored" && third.conversationId).not.toBe(first.conversationId);
  });

  it("filters auto-replies and records why", async () => {
    const r = await inbound(email({ from: "ooo@example.com", subject: "Out of office", headers: [{ Name: "Auto-Submitted", Value: "auto-replied" }] }));
    expect(r).toEqual({ status: "filtered", reason: "auto_submitted" });
    const { data } = await admin.from("filtered_emails").select("reason").eq("shop_id", shopId).eq("from_email", "ooo@example.com");
    expect(data).toEqual([{ reason: "auto_submitted" }]);
    const { count } = await admin.from("customers").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("email", "ooo@example.com");
    expect(count).toBe(0);
  });

  it("filters the 6th email from one sender within 10 minutes", async () => {
    const results = [];
    for (let i = 0; i < 6; i++) results.push((await inbound(email({ from: "flood@example.com", subject: `Flood ${i}` }))).status);
    expect(results).toEqual(["stored", "stored", "stored", "stored", "stored", "filtered"]);
  });

  it("saves Gmail's forwarding confirmation code for Settings", async () => {
    const r = await inbound(
      email({ from: "forwarding-noreply@google.com", subject: "Gmail Forwarding Confirmation", text: "Confirmation code: 123456789\nhttps://mail-settings.google.com/mail/vf-abc" }),
    );
    expect(r).toEqual({ status: "filtered", reason: "forwarding_confirmation" });
    const { data: shop } = await admin.from("shops").select("setup").eq("id", shopId).single();
    expect((shop?.setup as Record<string, unknown>).forwarding_confirmation).toMatchObject({
      code: "123456789",
      link: "https://mail-settings.google.com/mail/vf-abc",
    });
  });

  it("ignores mail for an unknown shop", async () => {
    expect(await inbound(email({ mailboxHash: "ffffffffffff" }))).toEqual({ status: "ignored", reason: "unknown_shop" });
    expect(await inbound(email({ mailboxHash: "not-a-hash" }))).toEqual({ status: "ignored", reason: "unknown_shop" });
  });

  it("still stores the email when queueing fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await handleInbound(admin, email({ from: "queue@example.com", subject: "Queue down" }), {
      ...deps,
      enqueue: async () => {
        throw new Error("down");
      },
    });
    expect(r.status).toBe("stored");
    errorSpy.mockRestore();
  });

  it("emails a sent reply once, threaded, and never twice", async () => {
    const rfc = `${randomUUID()}@mail.example.com`;
    const first = await inbound(email({ from: "deliver@example.com", subject: "Deliver me", headers: [{ Name: "Message-ID", Value: `<${rfc}>` }] }));
    if (first.status !== "stored") throw new Error("not stored");
    const { data: reply } = await admin
      .from("messages")
      .insert({ shop_id: shopId, conversation_id: first.conversationId, role: "ai", status: "sent", body: "Hi Jamie, it's on its way." })
      .select("id")
      .single();
    const config = { token: "tok", from: "support@deskpilot.test", inboundAddress: BASE };
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ ErrorCode: 0, MessageID: "pm-1" }), { status: 200 }));

    expect(await deliverMessage(admin, shopId, reply?.id ?? "", { config, fetchFn })).toEqual({ status: "delivered" });
    expect(await deliverMessage(admin, shopId, reply?.id ?? "", { config, fetchFn })).toEqual({ status: "delivered" });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const body = JSON.parse(String((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as Record<string, unknown>;
    expect(body).toMatchObject({ To: "deliver@example.com", Subject: "Re: Deliver me" });
    expect(body.ReplyTo).toMatch(new RegExp(`\\+${hash}\\.[a-f0-9]+@inbound\\.postmarkapp\\.com$`));
    expect(body.Headers).toContainEqual({ Name: "In-Reply-To", Value: `<${rfc}>` });
    const { data: msg } = await admin.from("messages").select("delivered_at").eq("id", reply?.id ?? "").single();
    expect(msg?.delivered_at).not.toBeNull();
  });

  it("records a failed send and uses dev outbox without a sender", async () => {
    const first = await inbound(email({ from: "fail@example.com", subject: "Fail me" }));
    if (first.status !== "stored") throw new Error("not stored");
    const { data: reply } = await admin
      .from("messages")
      .insert({ shop_id: shopId, conversation_id: first.conversationId, role: "human", status: "sent", body: "Hi" })
      .select("id")
      .single();
    const id = reply?.id ?? "";

    expect(await deliverMessage(admin, shopId, id, { config: null })).toEqual({ status: "dev_outbox" });
    const config = { token: "tok", from: "support@deskpilot.test", inboundAddress: BASE };
    const bad = vi.fn(async () => new Response(JSON.stringify({ ErrorCode: 406, Message: "Inactive recipient" }), { status: 422 }));
    expect(await deliverMessage(admin, shopId, id, { config, fetchFn: bad })).toEqual({ status: "failed", error: "Inactive recipient" });
    const { data: msg } = await admin.from("messages").select("delivered_at, delivery_error").eq("id", id).single();
    expect(msg).toEqual({ delivered_at: null, delivery_error: "Inactive recipient" });

    // Another shop can't deliver this message.
    expect(await deliverMessage(admin, randomUUID(), id, { config, fetchFn: bad })).toEqual({ status: "failed", error: "Nothing to send." });
  });
});
