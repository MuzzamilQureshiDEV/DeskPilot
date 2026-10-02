import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  adminClient,
  createTestUser,
  deleteTestUser,
  hasDbEnv,
  type Db,
  type TestUser,
} from "./helpers";

describe.skipIf(!hasDbEnv)("signup creates a shop (live DB)", () => {
  let admin: Db;
  let owner: TestUser | undefined;
  let plain: TestUser | undefined;
  const shopIds: string[] = [];

  beforeAll(async () => {
    admin = adminClient();
    owner = await createTestUser(admin, { shopName: "  Trigger Test Store  " });
    plain = await createTestUser(admin);
  });

  afterAll(async () => {
    if (!admin) return;
    if (shopIds.length) await admin.from("shops").delete().in("id", shopIds);
    await deleteTestUser(admin, owner);
    await deleteTestUser(admin, plain);
  });

  it("creates the shop, owner membership and default automation settings", async () => {
    if (!owner) throw new Error("owner not set up");

    const members = await admin
      .from("shop_members")
      .select("shop_id, role, shops(name, agent_name, plan)")
      .eq("user_id", owner.id);
    expect(members.error).toBeNull();
    expect(members.data).toHaveLength(1);
    const member = members.data![0]!;
    shopIds.push(member.shop_id);

    expect(member.role).toBe("owner");
    expect(member.shops).toEqual({
      name: "Trigger Test Store",
      agent_name: "Ava",
      plan: "trial",
    });

    const settings = await admin
      .from("automation_settings")
      .select("category, mode")
      .eq("shop_id", member.shop_id);
    expect(settings.data).toHaveLength(8);
    expect(settings.data!.every((s) => s.mode === "copilot")).toBe(true);
  });

  it("lets the new owner read their shop through RLS", async () => {
    if (!owner) throw new Error("owner not set up");
    const shops = await owner.client.from("shops").select("id, name");
    expect(shops.error).toBeNull();
    expect(shops.data?.map((s) => s.name)).toEqual(["Trigger Test Store"]);
  });

  it("creates nothing for users signed up without a shop name", async () => {
    if (!plain) throw new Error("plain user not set up");
    const members = await admin.from("shop_members").select("shop_id").eq("user_id", plain.id);
    expect(members.data).toEqual([]);
  });

  it("cannot be called directly by a signed-in user", async () => {
    if (!owner) throw new Error("owner not set up");
    // Trigger functions are not callable over the API at all.
    const res = await owner.client.rpc("handle_new_user" as never);
    expect(res.error).not.toBeNull();
  });
});
