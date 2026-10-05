import { describe, expect, it } from "vitest";

import { runAgent } from "@/lib/ai/agent";
import { FAKE_MODEL, fakeMessagesClient } from "@/lib/ai/fake-client";
import { buildSandboxStore, SANDBOX_KNOWLEDGE } from "@/lib/sandbox/data";
import { SandboxProvider } from "@/lib/sandbox/provider";

const provider = new SandboxProvider(buildSandboxStore(new Date("2026-10-04T12:00:00Z")));

function run(body: string, email: string | null, name: string | null = null) {
  return runAgent({
    client: fakeMessagesClient,
    shop: { agentName: "Ava", shopName: "Harbor & Pine Outfitters", agentTone: "friendly" },
    knowledge: SANDBOX_KNOWLEDGE,
    provider,
    history: [{ role: "customer", body }],
    channel: email ? "email" : "chat",
    customerEmail: email,
    customerName: name,
    now: new Date("2026-10-04T12:00:00Z"),
  });
}

describe("dev fake AI drives the real tools", () => {
  it("answers where-is-my-order from tracking", async () => {
    const r = await run("Where is my order #1003?", "priya.nair@example.com", "Priya Nair");
    expect(r.fallback).toBeNull();
    expect(r.model).toBe(FAKE_MODEL);
    expect(r.toolCalls.map((t) => t.name)).toEqual(["lookup_order", "get_tracking", "respond"]);
    expect(r.response.reply).toMatch(/^Hi Priya,/);
    expect(r.response.reply).toContain("1Z999AA10123456784");
    expect(r.response.reply).toMatch(/Ava$/);
    expect(r.response.category).toBe("order_status");
  });

  it("proposes a cancellation for an unshipped order", async () => {
    const r = await run("Please cancel order #1001", "emma.larsen@example.com");
    expect(r.proposals.map((p) => p.type)).toEqual(["cancel"]);
    expect(r.response.reply).toContain("sent your request to cancel order #1001");
    expect(r.response.category).toBe("cancel");
  });

  it("explains when a shipped order can't be cancelled", async () => {
    const r = await run("Cancel #1003 please", "priya.nair@example.com");
    expect(r.proposals).toEqual([]);
    expect(r.response.reply).toContain("already shipped");
  });

  it("proposes a refund of the refundable items", async () => {
    const r = await run("I'd like a refund for order #1006", "liam.chen@example.com");
    expect(r.proposals.map((p) => p.type)).toEqual(["refund"]);
    expect(r.response.reply).toContain("123.00 USD");
  });

  it("answers product questions from search", async () => {
    const r = await run("Do you have the Ridgeline Rain Shell in stock?", "sofia.martinez@example.com");
    expect(r.toolCalls.map((t) => t.name)).toEqual(["search_products", "respond"]);
    expect(r.response.reply).toContain("Ridgeline Rain Shell");
  });

  it("never reveals another customer's order", async () => {
    const r = await run("Where is order #1001?", "priya.nair@example.com");
    expect(r.response.reply).toContain("couldn't find order #1001");
    expect(r.response.reply).not.toContain("Ridgeline");
  });

  it("escalates anything it can't handle", async () => {
    const r = await run("Can I become a wholesale partner?", "priya.nair@example.com");
    expect(r.response).toMatchObject({ escalate: true, category: "general" });
  });
});
