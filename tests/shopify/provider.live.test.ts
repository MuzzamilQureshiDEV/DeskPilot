// Live check of ShopifyProvider against the connected dev store.
// Run: npm run test:shopify  (needs .env.local and a connected store)

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { storeProviderForShop } from "@/lib/store/provider";

async function connectedShopId(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.SHOPIFY_API_KEY) return null;
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await admin.from("shops").select("id").not("shopify_domain", "is", null).limit(1).maybeSingle();
  return data?.id ?? null;
}

const shopId = await connectedShopId();

describe.skipIf(!shopId)("ShopifyProvider on the connected store (live)", () => {
  it("finds active products with prices and stock", async () => {
    const provider = await storeProviderForShop(shopId ?? "");
    expect(provider.kind).toBe("shopify");
    const products = await provider.searchProducts("snowboard");
    console.log(products.map((p) => `${p.title}: ${p.priceRange.min.amount} ${p.priceRange.min.currency}, stock ${p.totalInventory ?? "untracked"}`).join("\n"));
    expect(products.length).toBeGreaterThan(0);
    expect(products.every((p) => /^\d+\.\d{2}$/.test(p.priceRange.min.amount))).toBe(true);
  });

  it("looks up orders by email without errors (none expected for a random address)", async () => {
    const provider = await storeProviderForShop(shopId ?? "");
    expect(await provider.findOrders({ email: "nobody-deskpilot-test@example.com", orderNumber: "1001" })).toEqual([]);
    expect(await provider.getOrder("gid://shopify/Order/1")).toBeNull();
  });
});
