import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { connectOwnApp } from "@/lib/shopify/own-app";

import { adminClient, createTestUser, deleteTestUser, hasDbEnv, type Db, type TestUser } from "./helpers";

const ALL_SCOPES = ["read_orders", "write_orders", "read_products", "read_customers", "read_fulfillments", "read_merchant_managed_fulfillment_orders"];

/** Fake Shopify: token endpoint + the shop/scopes query. */
function shopify(opts: { tokenStatus?: number; scopes?: string[] } = {}) {
  return vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith("/admin/oauth/access_token")) {
      return new Response(JSON.stringify({ access_token: "shpat_x", scope: (opts.scopes ?? ALL_SCOPES).join(","), expires_in: 86399 }), {
        status: opts.tokenStatus ?? 200,
      });
    }
    return new Response(
      JSON.stringify({ data: { shop: { name: "Aura Test" }, currentAppInstallation: { accessScopes: (opts.scopes ?? ALL_SCOPES).map((handle) => ({ handle })) } } }),
    );
  });
}

describe.skipIf(!hasDbEnv)("connect with the store's own Shopify app (live DB)", () => {
  let admin: Db;
  let a: TestUser | undefined;
  let b: TestUser | undefined;
  let shopA = "";
  let shopB = "";
  const domain = `own-app-${Math.random().toString(36).slice(2, 8)}.myshopify.com`;

  beforeAll(async () => {
    admin = adminClient();
    a = await createTestUser(admin, { shopName: "Own app A" });
    b = await createTestUser(admin, { shopName: "Own app B" });
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

  it("explains wrong credentials and missing permissions, and saves nothing", async () => {
    const bad = await connectOwnApp(admin, shopA, { domain, clientId: "id", clientSecret: "secret" }, shopify({ tokenStatus: 401 }));
    expect(bad).toMatchObject({ ok: false, error: expect.stringContaining("didn't accept these credentials") });
    const partial = await connectOwnApp(admin, shopA, { domain, clientId: "id", clientSecret: "secret" }, shopify({ scopes: ["read_products"] }));
    expect(partial).toMatchObject({ ok: false, error: expect.stringContaining("Read orders") });
    expect((await admin.from("shops").select("shopify_domain").eq("id", shopA).single()).data?.shopify_domain).toBeNull();
  });

  it("connects, stores the secret encrypted and shows a healthy status", async () => {
    const res = await connectOwnApp(admin, shopA, { domain: `https://${domain}/admin`, clientId: "client-1", clientSecret: "very-secret" }, shopify());
    expect(res).toEqual({ ok: true, storeName: "Aura Test" });
    const { data: row } = await admin.from("shops").select("shopify_auth, shopify_client_id, shopify_client_secret_enc, shopify_refresh_token_enc").eq("id", shopA).single();
    expect(row).toMatchObject({ shopify_auth: "own_app", shopify_client_id: "client-1", shopify_refresh_token_enc: null });
    expect(row!.shopify_client_secret_enc).not.toContain("very-secret");
    const status = await a!.client.rpc("shopify_connection_status", { p_shop_id: shopA }).single();
    expect(status.data).toMatchObject({ domain, needs_reconnect: false, auth: "own_app" });
  });

  it("refuses a store already connected to another account", async () => {
    const res = await connectOwnApp(admin, shopB, { domain, clientId: "x", clientSecret: "y" }, shopify());
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining("already connected") });
  });

  it("browsers can't read the secret or switch the connection type; disconnect clears it", async () => {
    expect((await a!.client.from("shops").select("shopify_client_secret_enc").eq("id", shopA)).error).not.toBeNull();
    expect((await a!.client.from("shops").update({ shopify_auth: "oauth" }).eq("id", shopA)).error).not.toBeNull();
    const key = (await a!.client.from("shops").select("widget_key").eq("id", shopA).single()).data?.widget_key;
    expect(key).toMatch(/^[A-Za-z0-9_-]{24}$/);
    await a!.client.rpc("disconnect_shopify", { p_shop_id: shopA });
    const { data: row } = await admin.from("shops").select("shopify_domain, shopify_auth, shopify_client_secret_enc").eq("id", shopA).single();
    expect(row).toEqual({ shopify_domain: null, shopify_auth: "oauth", shopify_client_secret_enc: null });
  });
});
