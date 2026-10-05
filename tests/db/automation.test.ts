import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadSettings, saveSetting } from "@/lib/automation/settings";

import { adminClient, createTestUser, deleteTestUser, hasDbEnv, type Db, type TestUser } from "./helpers";

describe.skipIf(!hasDbEnv)("automation settings (live DB)", () => {
  let admin: Db;
  let a: TestUser | undefined;
  let b: TestUser | undefined;
  let shopA = "";
  let shopB = "";

  beforeAll(async () => {
    admin = adminClient();
    a = await createTestUser(admin, { shopName: "Automation A" });
    b = await createTestUser(admin, { shopName: "Automation B" });
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

  const db = () => {
    if (!a) throw new Error("not set up");
    return a.client;
  };
  const setting = async (category: string) =>
    (await admin.from("automation_settings").select("mode, confidence_threshold").eq("shop_id", shopA).eq("category", category as "general").single()).data;

  it("starts every category in copilot at 85%", async () => {
    const rows = await loadSettings(db(), shopA);
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.mode === "copilot" && r.threshold === 0.85)).toBe(true);
  });

  it("saves off and copilot on any plan", async () => {
    expect(await saveSetting(db(), { id: shopA, plan: "trial" }, { category: "general", mode: "off", threshold: 0.85 })).toEqual({ ok: true });
    expect(await setting("general")).toEqual({ mode: "off", confidence_threshold: 0.85 });
  });

  it("refuses autopilot on plans without it, allows it on Growth", async () => {
    const trial = await saveSetting(db(), { id: shopA, plan: "trial" }, { category: "order_status", mode: "autopilot", threshold: 0.9 });
    expect(trial).toMatchObject({ ok: false, error: expect.stringContaining("Growth") });
    expect((await setting("order_status"))?.mode).toBe("copilot");

    const growth = await saveSetting(db(), { id: shopA, plan: "growth" }, { category: "order_status", mode: "autopilot", threshold: 0.9 });
    expect(growth).toEqual({ ok: true });
    expect(await setting("order_status")).toEqual({ mode: "autopilot", confidence_threshold: 0.9 });
  });

  it("never allows autopilot for money categories (code and database)", async () => {
    for (const category of ["refund", "cancel", "address_change"]) {
      const res = await saveSetting(db(), { id: shopA, plan: "scale" }, { category, mode: "autopilot", threshold: 0.99 });
      expect(res, category).toMatchObject({ ok: false });
    }
    const direct = await db().from("automation_settings").update({ mode: "autopilot" }).eq("shop_id", shopA).eq("category", "refund");
    expect(direct.error).not.toBeNull();
  });

  it("rejects bad input", async () => {
    for (const input of [
      { category: "general", mode: "copilot", threshold: 0.2 },
      { category: "general", mode: "copilot", threshold: 1.5 },
      { category: "secret", mode: "copilot", threshold: 0.8 },
      { category: "general", mode: "yolo", threshold: 0.8 },
    ]) {
      expect(await saveSetting(db(), { id: shopA, plan: "growth" }, input)).toMatchObject({ ok: false });
    }
  });

  it("another shop can't change these settings", async () => {
    if (!b) throw new Error("not set up");
    const res = await saveSetting(b.client, { id: shopA, plan: "growth" }, { category: "product", mode: "off", threshold: 0.8 });
    expect(res).toMatchObject({ ok: false });
    expect((await setting("product"))?.mode).toBe("copilot");
  });
});
