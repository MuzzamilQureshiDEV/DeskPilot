import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  adminClient,
  createTestUser,
  deleteTestUser,
  hasDbEnv,
  type Db,
  type TestUser,
} from "./helpers";

describe.skipIf(!hasDbEnv)("sandbox run limits (live DB)", () => {
  let admin: Db;
  let a: TestUser | undefined;
  let b: TestUser | undefined;
  let shopA = "";
  let shopB = "";

  const shopOf = async (user: TestUser) => {
    const { data } = await admin.from("shop_members").select("shop_id").eq("user_id", user.id).single();
    if (!data) throw new Error("no shop");
    return data.shop_id;
  };

  beforeAll(async () => {
    admin = adminClient();
    a = await createTestUser(admin, { shopName: "Sandbox A" });
    b = await createTestUser(admin, { shopName: "Sandbox B" });
    shopA = await shopOf(a);
    shopB = await shopOf(b);
    // A is on a paid plan (daily typed limit); B has no plan yet (2 tries in total).
    await admin.from("shops").update({ plan: "starter", subscription_status: "active" }).eq("id", shopA);
  });

  afterAll(async () => {
    if (!admin) return;
    const ids = [shopA, shopB].filter(Boolean);
    if (ids.length) await admin.from("shops").delete().in("id", ids);
    await deleteTestUser(admin, a);
    await deleteTestUser(admin, b);
  });

  function userA(): Db {
    if (!a) throw new Error("not set up");
    return a.client;
  }

  it("allows 3 free-text runs per day, then refuses", async () => {
    const remaining: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await userA().rpc("claim_sandbox_run", { p_shop_id: shopA, p_free_text: true }).single();
      expect(res.error).toBeNull();
      remaining.push(res.data?.remaining ?? -1);
    }
    expect(remaining).toEqual([2, 1, 0]);

    const fourth = await userA().rpc("claim_sandbox_run", { p_shop_id: shopA, p_free_text: true }).single();
    expect(fourth.error?.message).toContain("sandbox_limit");
  });

  it("doesn't limit preset scenarios", async () => {
    const res = await userA().rpc("claim_sandbox_run", { p_shop_id: shopA, p_free_text: false }).single();
    expect(res.error).toBeNull();
    expect(res.data?.remaining).toBe(0);
  });

  it("gives a shop with no plan 2 tries in total, scenarios and typed questions together", async () => {
    if (!b) throw new Error("not set up");
    const first = await b.client.rpc("claim_sandbox_run", { p_shop_id: shopB, p_free_text: false }).single();
    expect(first.error).toBeNull();
    expect(first.data?.remaining).toBe(1);

    // A failed run is given back.
    await b.client.rpc("release_sandbox_run", { p_event_id: first.data!.event_id });
    const again = await b.client.rpc("claim_sandbox_run", { p_shop_id: shopB, p_free_text: false }).single();
    expect(again.data?.remaining).toBe(1);

    const second = await b.client.rpc("claim_sandbox_run", { p_shop_id: shopB, p_free_text: true }).single();
    expect(second.error).toBeNull();
    expect(second.data?.remaining).toBe(0);

    for (const freeText of [false, true]) {
      const third = await b.client.rpc("claim_sandbox_run", { p_shop_id: shopB, p_free_text: freeText }).single();
      expect(third.error?.message).toContain("sandbox_limit");
    }
    // Tries never reset by day: the limit counts all of the shop's runs.
    await admin.from("usage_events").update({ created_at: new Date(Date.now() - 3 * 86_400_000).toISOString() }).eq("shop_id", shopB);
    const later = await b.client.rpc("claim_sandbox_run", { p_shop_id: shopB, p_free_text: false }).single();
    expect(later.error?.message).toContain("sandbox_limit");

    await admin.from("usage_events").delete().eq("shop_id", shopB);
  });

  it("refuses claims for a shop the user isn't a member of", async () => {
    const res = await userA().rpc("claim_sandbox_run", { p_shop_id: shopB, p_free_text: false }).single();
    expect(res.error).not.toBeNull();
    const { count } = await admin.from("usage_events").select("id", { count: "exact", head: true }).eq("shop_id", shopB);
    expect(count).toBe(0);
  });

  it("finish and release only touch the caller's own unfinished sandbox rows", async () => {
    if (!b) throw new Error("not set up");
    const claimB = await b.client.rpc("claim_sandbox_run", { p_shop_id: shopB, p_free_text: false }).single();
    const bEvent = claimB.data?.event_id ?? -1;
    const { data: real } = await admin
      .from("usage_events")
      .insert({ shop_id: shopA, kind: "ai_reply" })
      .select("id")
      .single();

    // A tries to edit B's row and a non-sandbox row: no effect.
    await userA().rpc("finish_sandbox_run", { p_event_id: bEvent, p_model: "x", p_input_tokens: 999, p_output_tokens: 999 });
    await userA().rpc("release_sandbox_run", { p_event_id: bEvent });
    await userA().rpc("release_sandbox_run", { p_event_id: real?.id ?? -1 });
    const { data: rows } = await admin.from("usage_events").select("id, input_tokens").in("id", [bEvent, real?.id ?? -1]);
    expect(rows).toHaveLength(2);
    expect(rows?.every((r) => r.input_tokens === null)).toBe(true);

    // B finishes its own row; it can't be released afterwards.
    await b.client.rpc("finish_sandbox_run", { p_event_id: bEvent, p_model: "claude-sonnet-5", p_input_tokens: 10, p_output_tokens: 5 });
    await b.client.rpc("release_sandbox_run", { p_event_id: bEvent });
    const { data: finished } = await admin.from("usage_events").select("model, input_tokens").eq("id", bEvent).single();
    expect(finished).toEqual({ model: "claude-sonnet-5", input_tokens: 10 });
  });

  it("releasing a failed free-text run gives the allowance back", async () => {
    if (!b) throw new Error("not set up");
    await admin.from("shops").update({ plan: "growth", subscription_status: "active" }).eq("id", shopB);
    await admin.from("usage_events").delete().eq("shop_id", shopB);
    const claim = await b.client.rpc("claim_sandbox_run", { p_shop_id: shopB, p_free_text: true }).single();
    expect(claim.data?.remaining).toBe(2);
    await b.client.rpc("release_sandbox_run", { p_event_id: claim.data?.event_id ?? -1 });
    const again = await b.client.rpc("claim_sandbox_run", { p_shop_id: shopB, p_free_text: true }).single();
    expect(again.data?.remaining).toBe(2);
  });
});
