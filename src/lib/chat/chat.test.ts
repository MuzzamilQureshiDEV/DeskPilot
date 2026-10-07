import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { proxyMessage, signProxyParams, verifyProxyRequest } from "@/lib/chat/proxy-auth";
import { checkLimits, CHAT_LIMITS, getSchema, postSchema, threadIdFor, visibleMessages } from "@/lib/chat/session";

const SECRET = "shpss_unit_secret";
const NOW = new Date("2026-10-06T12:00:00Z");
const ts = String(Math.floor(NOW.getTime() / 1000));

function signed(extra: Record<string, string> = {}) {
  const p = new URLSearchParams({ shop: "demo.myshopify.com", logged_in_customer_id: "", path_prefix: "/apps/deskpilot", timestamp: ts, ...extra });
  p.set("signature", signProxyParams(p, SECRET));
  return p;
}

describe("app proxy signature", () => {
  it("builds Shopify's message: sorted key=value pairs, repeated keys joined, no separator", () => {
    const p = new URLSearchParams("b=2&a=1&ids=1&ids=2&signature=x");
    expect(proxyMessage(p)).toBe("a=1b=2ids=1,2");
  });

  it("accepts a fresh, correctly signed request", () => {
    expect(verifyProxyRequest(signed({ token: "t" }), SECRET, NOW)).toBe(true);
  });

  it("rejects tampering, a wrong secret, a missing signature and stale requests", () => {
    const p = signed();
    p.set("shop", "evil.myshopify.com");
    expect(verifyProxyRequest(p, SECRET, NOW)).toBe(false);
    expect(verifyProxyRequest(signed(), "other-secret", NOW)).toBe(false);
    const unsigned = signed();
    unsigned.delete("signature");
    expect(verifyProxyRequest(unsigned, SECRET, NOW)).toBe(false);
    expect(verifyProxyRequest(signed(), SECRET, new Date(NOW.getTime() + 6 * 60_000))).toBe(false);
  });
});

describe("chat requests", () => {
  const token = "a".repeat(43);

  it("validates messages and the optional email", () => {
    expect(postSchema.safeParse({ token, text: "  Hello  " }).data).toEqual({ token, text: "Hello" });
    expect(postSchema.safeParse({ token, text: "Hi", email: " Pat@Example.com " }).data?.email).toBe("pat@example.com");
    expect(postSchema.safeParse({ token, text: "Hi", email: "" }).data?.email).toBeUndefined();
    for (const bad of [
      { token, text: "   " },
      { token, text: "x".repeat(CHAT_LIMITS.maxText + 1) },
      { token, text: "Hi", email: "not-an-email" },
      { token: "short", text: "Hi" },
      { token: "a".repeat(40) + "<>!", text: "Hi" },
    ]) {
      expect(postSchema.safeParse(bad).success).toBe(false);
    }
    expect(getSchema.safeParse({ token, after: "2026-10-06T12:00:00.123+00:00" }).success).toBe(true);
    expect(getSchema.safeParse({ token, after: "yesterday" }).success).toBe(false);
  });

  it("stores only a hash of the visitor token", () => {
    expect(threadIdFor(token)).toMatch(/^chat:[a-f0-9]{64}$/);
    expect(threadIdFor(token)).not.toContain(token);
    expect(threadIdFor(token)).not.toBe(threadIdFor("b".repeat(43)));
  });

  it("shows shoppers only their messages and sent replies, never drafts or notes", () => {
    const rows = [
      { id: "1", role: "customer", status: "received", body: "Hi", created_at: "t1" },
      { id: "2", role: "ai", status: "draft", body: "DRAFT", created_at: "t2" },
      { id: "3", role: "system", status: "received", body: "NOTE", created_at: "t3" },
      { id: "4", role: "human", status: "sent", body: "Hello!", created_at: "t4" },
      { id: "5", role: "ai", status: "rejected", body: "REJECTED", created_at: "t5" },
    ];
    expect(visibleMessages(rows)).toEqual([
      { id: "1", from: "you", body: "Hi", at: "t1" },
      { id: "4", from: "agent", body: "Hello!", at: "t4" },
    ]);
  });

  it("limits fast senders and floods of new chats", () => {
    expect(checkLimits({ recentVisitorMessages: 9, isNewChat: false, newChatsLastHour: 999 })).toEqual({ ok: true });
    expect(checkLimits({ recentVisitorMessages: 10, isNewChat: false, newChatsLastHour: 0 })).toEqual({ ok: false, reason: "visitor" });
    expect(checkLimits({ recentVisitorMessages: 0, isNewChat: true, newChatsLastHour: 60 })).toEqual({ ok: false, reason: "shop" });
  });
});

describe("storefront widget helpers", () => {
  // Load the real asset without a DOM; it exposes its pure helpers on window.
  const source = readFileSync("extensions/deskpilot-chat/assets/deskpilot-chat.js", "utf8") /* built from widget/deskpilot-chat.src.js */;
  const sandbox: { window: { DeskPilotChat?: Record<string, (...a: never[]) => unknown> } } = { window: {} };
  runInNewContext(source, sandbox);
  const chat = sandbox.window.DeskPilotChat as unknown as {
    mergeMessages: (a: object[], b: object[]) => { id: string }[];
    nextDelay: (open: boolean, failures: number, fast?: boolean) => number;
    awaitingReply: (m: { from: string }[]) => boolean;
  };

  it("merges polled messages without duplicates, in time order", () => {
    const a = [{ id: "1", at: "2026-01-01T00:00:01Z", from: "you" }];
    const b = [
      { id: "1", at: "2026-01-01T00:00:01Z", from: "you" },
      { id: "2", at: "2026-01-01T00:00:02Z", from: "agent" },
      { id: "0", at: "2026-01-01T00:00:00Z", from: "agent" },
    ];
    expect(chat.mergeMessages(a, b).map((m) => m.id)).toEqual(["0", "1", "2"]);
  });

  it("polls fast while open, slowly while closed, and backs off on errors", () => {
    expect(chat.nextDelay(true, 0)).toBe(4000);
    expect(chat.nextDelay(false, 0)).toBe(30000);
    expect(chat.nextDelay(true, 2)).toBe(16000);
    expect(chat.nextDelay(true, 10)).toBe(60000);
    // Waiting for a reply: poll fast.
    expect(chat.nextDelay(true, 0, true)).toBe(1500);
  });

  it("knows when the shopper is waiting", () => {
    expect(chat.awaitingReply([{ from: "agent" }, { from: "you" }])).toBe(true);
    expect(chat.awaitingReply([{ from: "you" }, { from: "agent" }])).toBe(false);
    expect(chat.awaitingReply([])).toBe(false);
  });
});
