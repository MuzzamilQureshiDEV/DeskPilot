import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminClient, createTestUser, deleteTestUser, hasDbEnv, type Db, type TestUser } from "./helpers";

describe.skipIf(!hasDbEnv)("Shopify connection storage (live DB)", () => {
  let admin: Db;
  let a: TestUser | undefined;
  let b: TestUser | undefined;
  let shopA = "";
  let shopB = "";

  beforeAll(async () => {
    admin = adminClient();
    a = await createTestUser(admin, { shopName: "Shopify A" });
    b = await createTestUser(admin, { shopName: "Shopify B" });
    const shopOf = async (u: TestUser) =>
      (await admin.from("shop_members").select("shop_id").eq("user_id", u.id).single()).data?.shop_id ?? "";
    shopA = await shopOf(a);
    shopB = await shopOf(b);
    // Simulate a completed OAuth for A (what the callback writes).
    await admin
      .from("shops")
      .update({
        shopify_domain: `test-${shopA.slice(0, 8)}.myshopify.com`,
        shopify_token_enc: "v1.iv.tag.access",
        shopify_refresh_token_enc: "v1.iv.tag.refresh",
        shopify_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
        shopify_refresh_expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
        shopify_scopes: "read_orders,write_orders",
        shopify_connected_at: new Date().toISOString(),
      })
      .eq("id", shopA);
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("shops").delete().in("id", [shopA, shopB].filter(Boolean));
    await deleteTestUser(admin, a);
    await deleteTestUser(admin, b);
  });

  const client = (u: TestUser | undefined) => {
    if (!u) throw new Error("not set up");
    return u.client;
  };

  it("browsers can't read token columns", async () => {
    for (const col of ["shopify_token_enc", "shopify_refresh_token_enc", "shopify_token_expires_at", "shopify_refresh_expires_at"]) {
      const res = await client(a).from("shops").select(col).eq("id", shopA);
      expect(res.error, col).not.toBeNull();
    }
  });

  it("status shows the connection without any secret", async () => {
    const { data, error } = await client(a).rpc("shopify_connection_status", { p_shop_id: shopA }).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ scopes: "read_orders,write_orders", needs_reconnect: false });
    expect(JSON.stringify(data)).not.toContain("v1.iv.tag");
  });

  it("other shops' status and disconnect are off limits", async () => {
    const status = await client(b).rpc("shopify_connection_status", { p_shop_id: shopA });
    expect(status.data).toEqual([]);
    const res = await client(b).rpc("disconnect_shopify", { p_shop_id: shopA });
    expect(res.error).not.toBeNull();
    const { data } = await admin.from("shops").select("shopify_token_enc").eq("id", shopA).single();
    expect(data?.shopify_token_enc).toBe("v1.iv.tag.access");
  });

  it("disconnect wipes every Shopify field", async () => {
    const res = await client(a).rpc("disconnect_shopify", { p_shop_id: shopA });
    expect(res.error).toBeNull();
    const { data } = await admin
      .from("shops")
      .select("shopify_domain, shopify_token_enc, shopify_refresh_token_enc, shopify_scopes, shopify_connected_at")
      .eq("id", shopA)
      .single();
    expect(Object.values(data ?? {}).every((v) => v === null)).toBe(true);
  });
});
