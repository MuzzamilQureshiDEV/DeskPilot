// Load test (task 3.8): 100 shops × 10 inbound emails through the real pipeline
// against the cloud DB, with the free rule-based AI and the sample store.
//   npm run test:load            (cleans up everything it creates)
//   LOAD_SHOPS=20 LOAD_MESSAGES=5 npm run test:load   (smaller run)

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fakeMessagesClient } from "@/lib/ai/fake-client";
import { prepareRun, runAndDecide, saveResult, type MessageRef } from "@/lib/ai/process-message";
import { handleInbound, postmarkInboundSchema } from "@/lib/email/inbound";
import { buildSandboxStore } from "@/lib/sandbox/data";
import { SandboxProvider } from "@/lib/sandbox/provider";

import { adminClient, hasDbEnv, type Db } from "../db/helpers";

const SHOPS = Number(process.env.LOAD_SHOPS ?? 100);
const MESSAGES = Number(process.env.LOAD_MESSAGES ?? 10);
const WORKERS = Number(process.env.LOAD_WORKERS ?? 20); // like parallel Inngest runs

const SCENARIOS = [
  { from: "emma.larsen@example.com", subject: "Where is my order?", text: "Hi, where is my order #1001?" },
  { from: "marcus.reid@example.com", subject: "Cancel please", text: "Please cancel order #1002." },
  { from: "priya.nair@example.com", subject: "Gift cards", text: "Do you sell gift cards?" },
  { from: "daniel.okafor@example.com", subject: "Refund", text: "I'd like a refund for order #1004." },
  { from: "new.shopper@example.com", subject: "Sizes", text: "Do you have this jacket in medium?" },
];

/** Run tasks with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]!);
    }),
  );
}

/**
 * Retry like production does: Postmark re-delivers a failed webhook and Inngest
 * retries a failed job (3 retries). Counts how often a retry was needed.
 */
async function withRetries<T>(fn: () => Promise<T>, retried: { count: number }, attempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts) throw err;
      retried.count++;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    }
  }
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
const stats = (ms: number[]) => {
  const s = [...ms].sort((a, b) => a - b);
  return { p50: pct(s, 50), p95: pct(s, 95), max: s.at(-1) ?? 0 };
};

describe.skipIf(!hasDbEnv)(`load: ${SHOPS} shops × ${MESSAGES} messages`, () => {
  let admin: Db;
  const tag = `load-${randomUUID().slice(0, 8)}`;
  const users: string[] = [];
  const shops: { id: string; hash: string }[] = [];

  beforeAll(async () => {
    admin = adminClient();
    const indexes = Array.from({ length: SHOPS }, (_, i) => i);
    await pool(indexes, 10, async (i) => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `${tag}-${i}@deskpilot.test`,
        password: randomUUID(),
        email_confirm: true,
        user_metadata: { shop_name: `${tag} shop ${i}` },
      });
      if (error) throw error;
      users.push(data.user.id);
      const { data: member } = await admin.from("shop_members").select("shop_id").eq("user_id", data.user.id).single();
      const { data: shop } = await admin.from("shops").select("id, inbound_hash").eq("id", member!.shop_id).single();
      shops.push({ id: shop!.id, hash: shop!.inbound_hash });
    });
  }, 600_000);

  afterAll(async () => {
    if (!admin) return;
    await pool(shops, 10, async (s) => void (await admin.from("shops").delete().eq("id", s.id)));
    await pool(users, 10, async (u) => void (await admin.auth.admin.deleteUser(u)));
  }, 600_000);

  it("ingests and answers every message, per shop, without errors or cross-talk", async () => {
    const provider = new SandboxProvider(buildSandboxStore());
    const refs: MessageRef[] = [];
    const ingestMs: number[] = [];
    const processMs: number[] = [];
    const errors: string[] = [];
    const retried = { ingest: { count: 0 }, process: { count: 0 } };
    const alreadyAnswered = { count: 0 };
    const started = Date.now();

    // 1. Inbound webhook path (as Postmark would call it).
    const jobs = shops.flatMap((shop) => Array.from({ length: MESSAGES }, (_, n) => ({ shop, n })));
    await pool(jobs, WORKERS, async ({ shop, n }) => {
      const sc = SCENARIOS[n % SCENARIOS.length]!;
      const email = postmarkInboundSchema.parse({
        FromFull: { Email: sc.from, Name: "Load Test" },
        MailboxHash: shop.hash,
        Subject: `${sc.subject} ${n}`,
        MessageID: randomUUID(),
        TextBody: sc.text,
        Headers: [{ Name: "Message-ID", Value: `<${randomUUID()}@load.test>` }],
      });
      const t = Date.now();
      try {
        const res = await withRetries(
          () => handleInbound(admin, email, { ownAddresses: [], enqueue: async (r) => void refs.push(r) }),
          retried.ingest,
        );
        if (res.status !== "stored") errors.push(`ingest:${res.status}`);
      } catch (e) {
        errors.push(`ingest:${(e as Error).message}`);
      }
      ingestMs.push(Date.now() - t);
    });
    const ingested = Date.now();

    // 2. The background job (prepare → agent → save), WORKERS at a time.
    await pool(refs, WORKERS, async (ref) => {
      const t = Date.now();
      try {
        await withRetries(async () => {
          const prepared = await prepareRun(admin, ref);
          if (prepared.skip !== null) {
            // "already_answered" = an earlier attempt saved the reply but its response was lost:
            // the idempotent path, counted below. Anything else is a real problem.
            if (prepared.skip === "already_answered") alreadyAnswered.count++;
            else errors.push(`skip:${prepared.skip}`);
            return;
          }
          const data = await runAndDecide(prepared.input, { client: fakeMessagesClient, provider });
          await saveResult(admin, ref, data);
        }, retried.process);
      } catch (e) {
        errors.push(`process:${(e as Error).message}`);
      } finally {
        processMs.push(Date.now() - t);
      }
    });
    const done = Date.now();

    // 3. Integrity: every shop got exactly its own replies and usage.
    const ids = shops.map((s) => s.id);
    const counts = new Map<string, { customer: number; ai: number; usage: number }>();
    for (const id of ids) counts.set(id, { customer: 0, ai: 0, usage: 0 });
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const { data: msgs } = await admin.from("messages").select("shop_id, role").in("shop_id", chunk).in("role", ["customer", "ai"]).limit(10_000);
      for (const m of msgs ?? []) counts.get(m.shop_id)![m.role === "customer" ? "customer" : "ai"]++;
      const { data: usage } = await admin.from("usage_events").select("shop_id").in("shop_id", chunk).eq("kind", "ai_reply").limit(10_000);
      for (const u of usage ?? []) counts.get(u.shop_id)!.usage++;
    }
    // Exactly one AI reply and one usage event per customer message: no duplicates from retries.
    const wrong = [...counts.entries()].filter(([, c]) => c.customer !== MESSAGES || c.ai !== MESSAGES || c.usage !== MESSAGES);

    const total = shops.length * MESSAGES;
    const report = {
      shops: shops.length,
      messages: total,
      workers: WORKERS,
      ingest: { seconds: (ingested - started) / 1000, perSecond: +(total / ((ingested - started) / 1000)).toFixed(1), ms: stats(ingestMs) },
      process: { seconds: (done - ingested) / 1000, perSecond: +(refs.length / ((done - ingested) / 1000)).toFixed(1), ms: stats(processMs) },
      aiReplies: [...counts.values()].reduce((a, c) => a + c.ai, 0),
      retriesNeeded: { ingest: retried.ingest.count, process: retried.process.count },
      savedThenRetried: alreadyAnswered.count,
      errors: errors.length,
      errorSamples: [...new Set(errors)].slice(0, 5),
      shopsWithWrongCounts: wrong.length,
    };
    console.log("LOAD REPORT", JSON.stringify(report, null, 2));
    writeFileSync("load-report.json", JSON.stringify({ at: new Date().toISOString(), ...report }, null, 2));

    expect(errors).toEqual([]);
    expect(refs).toHaveLength(total);
    expect(wrong).toEqual([]);
    expect(report.process.ms.p95).toBeLessThan(15_000);
  }, 1_800_000);
});
