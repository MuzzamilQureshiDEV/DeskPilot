import { randomBytes } from "node:crypto";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { signProxyParams } from "@/lib/chat/proxy-auth";

const chatShop = vi.fn();
const postChat = vi.fn();
const readChat = vi.fn();
vi.mock("@/lib/chat/handlers", () => ({ chatShop, postChat, readChat }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/inngest/events", () => ({ enqueueMessage: vi.fn() }));

const SECRET = "shpss_route_secret";
const TOKEN = "t".repeat(43);

function url(extra: Record<string, string> = {}, sign = true) {
  const p = new URLSearchParams({ shop: "demo.myshopify.com", path_prefix: "/apps/deskpilot", timestamp: String(Math.floor(Date.now() / 1000)), ...extra });
  if (sign) p.set("signature", signProxyParams(p, SECRET));
  return `http://localhost/api/proxy/messages?${p}`;
}

async function call(method: "GET" | "POST", href: string, body?: unknown) {
  const route = await import("./route");
  const req = new NextRequest(href, { method, ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) });
  return route[method](req, { params: Promise.resolve({ path: ["messages"] }) });
}

describe("chat proxy route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SHOPIFY_API_KEY", "k");
    vi.stubEnv("SHOPIFY_API_SECRET", SECRET);
    vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    for (const fn of [chatShop, postChat, readChat]) fn.mockReset();
    chatShop.mockResolvedValue({ id: "shop-1" });
  });

  it("rejects unsigned or forged requests before touching the database", async () => {
    expect((await call("GET", url({ token: TOKEN }, false))).status).toBe(401);
    const forged = url({ token: TOKEN }).replace("demo.myshopify.com", "evil.myshopify.com");
    expect((await call("POST", forged, { token: TOKEN, text: "hi" })).status).toBe(401);
    expect(chatShop).not.toHaveBeenCalled();
  });

  it("serves a signed request for the verified shop", async () => {
    readChat.mockResolvedValue({ messages: [] });
    const res = await call("GET", url({ token: TOKEN }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(chatShop.mock.calls[0]?.[1]).toBe("demo.myshopify.com");

    postChat.mockResolvedValue({ messages: [{ id: "1", from: "you", body: "hi", at: "t" }] });
    expect((await call("POST", url(), { token: TOKEN, text: "hi" })).status).toBe(200);
    expect((await call("POST", url(), { token: TOKEN, text: "" })).status).toBe(400);
  });

  it("passes through rate limits", async () => {
    postChat.mockResolvedValue({ error: "slow down", status: 429 });
    expect((await call("POST", url(), { token: TOKEN, text: "hi" })).status).toBe(429);
  });
});
