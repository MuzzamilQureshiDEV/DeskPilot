import { describe, expect, it } from "vitest";

import { normalizeShopDomain, storeNameFromDomain } from "@/lib/shopify/domain";

describe("normalizeShopDomain (client-safe)", () => {
  it("accepts an admin link pasted without https://", () => {
    expect(normalizeShopDomain("admin.shopify.com/store/my-store/orders")).toBe("my-store.myshopify.com");
  });

  it("rejects custom storefront domains", () => {
    expect(normalizeShopDomain("www.harborandpine.com")).toBeNull();
  });
});

describe("storeNameFromDomain", () => {
  it("turns the handle into a readable name", () => {
    expect(storeNameFromDomain("harbor-and-pine.myshopify.com")).toBe("Harbor And Pine");
    expect(storeNameFromDomain("shop123.myshopify.com")).toBe("Shop123");
  });
});
