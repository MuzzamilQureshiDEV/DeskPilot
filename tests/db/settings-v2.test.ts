import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminClient, createTestUser, deleteTestUser, hasDbEnv, type Db, type TestUser } from "./helpers";

describe.skipIf(!hasDbEnv)("settings v2: widget, filters, signature, quick replies (live DB)", () => {
  let admin: Db;
  let a: TestUser | undefined;
  let b: TestUser | undefined;
  let shopA = "";
  let shopB = "";

  beforeAll(async () => {
    admin = adminClient();
    a = await createTestUser(admin, { shopName: "Settings A" });
    b = await createTestUser(admin, { shopName: "Settings B" });
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

  it("members edit their own widget, filters and signature, never another shop's", async () => {
    const own = await a!.client
      .from("shops")
      .update({ widget: { title: "Help" }, email_filters: { blocked: ["spam.io"] }, email_signature: "Thanks!" })
      .eq("id", shopA)
      .select("widget, email_filters, email_signature");
    expect(own.error).toBeNull();
    expect(own.data).toEqual([{ widget: { title: "Help" }, email_filters: { blocked: ["spam.io"] }, email_signature: "Thanks!" }]);

    const other = await a!.client.from("shops").update({ email_signature: "Hacked" }).eq("id", shopB).select("id");
    expect(other.data ?? []).toEqual([]);
    expect((await admin.from("shops").select("email_signature").eq("id", shopB).single()).data?.email_signature).toBe("");
  });

  it("the database rejects oversized or wrongly shaped settings", async () => {
    expect((await a!.client.from("shops").update({ email_signature: "x".repeat(301) }).eq("id", shopA)).error).not.toBeNull();
    expect((await a!.client.from("shops").update({ widget: ["not", "an", "object"] }).eq("id", shopA)).error).not.toBeNull();
  });

  it("quick replies are private to the shop", async () => {
    const ins = await a!.client.from("quick_replies").insert({ shop_id: shopA, title: "Returns", body: "30 days." }).select("id").single();
    expect(ins.error).toBeNull();
    expect((await b!.client.from("quick_replies").select("id")).data).toEqual([]);
    const sneaky = await b!.client.from("quick_replies").insert({ shop_id: shopA, title: "x", body: "y" });
    expect(sneaky.error).not.toBeNull();
    const del = await b!.client.from("quick_replies").delete().eq("id", ins.data!.id).select("id");
    expect(del.data ?? []).toEqual([]);
    expect((await a!.client.from("quick_replies").select("title")).data).toEqual([{ title: "Returns" }]);
  });
});
