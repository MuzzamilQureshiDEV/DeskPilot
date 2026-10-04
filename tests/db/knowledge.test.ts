import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadKnowledge } from "@/lib/knowledge/load";

import { adminClient, createTestUser, deleteTestUser, hasDbEnv, type Db, type TestUser } from "./helpers";

describe.skipIf(!hasDbEnv)("knowledge (live DB)", () => {
  let admin: Db;
  let a: TestUser | undefined;
  let b: TestUser | undefined;
  let shopA = "";
  let shopB = "";

  beforeAll(async () => {
    admin = adminClient();
    a = await createTestUser(admin, { shopName: "Knowledge A" });
    b = await createTestUser(admin, { shopName: "Knowledge B" });
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

  const userA = () => {
    if (!a) throw new Error("not set up");
    return a.client;
  };

  it("members add entries and load them newest first, optionally by kind", async () => {
    const rows = [
      { kind: "policy" as const, title: "Returns", content: "30 days", updated_at: "2026-10-01T00:00:00Z" },
      { kind: "example_reply" as const, title: "Old reply", content: "Hi there", updated_at: "2026-10-02T00:00:00Z" },
      { kind: "example_reply" as const, title: "New reply", content: "Hello!", updated_at: "2026-10-03T00:00:00Z" },
    ];
    const { error } = await userA().from("knowledge").insert(rows.map((r) => ({ ...r, shop_id: shopA })));
    expect(error).toBeNull();

    const all = await loadKnowledge(userA(), shopA);
    expect(all.map((k) => k.title)).toEqual(["New reply", "Old reply", "Returns"]);
    const replies = await loadKnowledge(userA(), shopA, ["example_reply"]);
    expect(replies.map((k) => k.title)).toEqual(["New reply", "Old reply"]);
  });

  it("another shop can't read, edit or delete them", async () => {
    if (!b) throw new Error("not set up");
    expect(await loadKnowledge(b.client, shopA)).toEqual([]);
    const upd = await b.client.from("knowledge").update({ content: "hacked" }).eq("shop_id", shopA).select("id");
    const del = await b.client.from("knowledge").delete().eq("shop_id", shopA).select("id");
    expect(upd.data).toEqual([]);
    expect(del.data).toEqual([]);
    const ins = await b.client.from("knowledge").insert({ shop_id: shopA, kind: "policy", title: "x", content: "y" });
    expect(ins.error).not.toBeNull();
    expect((await loadKnowledge(admin, shopA)).length).toBe(3);
  });
});
