"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentShop } from "@/lib/auth/session";
import { checkShopifyConnection, type CheckResult } from "@/lib/shopify/health";
import { connectOwnApp, type OwnAppResult } from "@/lib/shopify/own-app";
import { getShopifyAccessToken, ShopifyNotConnected, ShopifyReauthRequired } from "@/lib/shopify/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Removes the stored Shopify tokens for the signed-in user's shop. */
export async function disconnectShopify(): Promise<{ ok: boolean }> {
  const shop = await getCurrentShop();
  if (!shop) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("disconnect_shopify", { p_shop_id: shop.id });
  revalidatePath("/store");
  return { ok: !error };
}

export type ConnectionTest = { ok: true; checks: CheckResult[] } | { ok: false; error: string };

/** Runs the read-only Shopify checks for the signed-in user's own store. */
export async function testShopifyConnection(): Promise<ConnectionTest> {
  const shop = await getCurrentShop();
  if (!shop) return { ok: false, error: "Your account isn't linked to a store." };
  try {
    return { ok: true, checks: await checkShopifyConnection(await getShopifyAccessToken(shop.id)) };
  } catch (err) {
    if (err instanceof ShopifyNotConnected) return { ok: false, error: "No Shopify store is connected yet." };
    if (err instanceof ShopifyReauthRequired) return { ok: false, error: "Shopify access expired. Reconnect your store below." };
    return { ok: false, error: "Couldn't run the test. Please try again." };
  }
}

const nameSchema = z.string().trim().min(1, "Enter a store name.").max(80, "Keep it under 80 characters.");

/** The store's display name (shown in Ava's replies and the dashboard). */
export async function saveStoreName(name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid name." };
  const shop = await getCurrentShop();
  if (!shop) return { ok: false, error: "Your account isn't linked to a store." };
  const supabase = await createClient();
  const { error } = await supabase.from("shops").update({ name: parsed.data }).eq("id", shop.id);
  if (error) return { ok: false, error: "Couldn't save. Please try again." };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Connect through the store's own private Shopify app (Client ID + secret). Owner only. */
export async function connectOwnShopifyApp(input: { domain: string; clientId: string; clientSecret: string }): Promise<OwnAppResult> {
  const shop = await getCurrentShop();
  if (!shop) return { ok: false, error: "Your account isn't linked to a store." };
  if (shop.role !== "owner") return { ok: false, error: "Only the store owner can connect Shopify." };
  const result = await connectOwnApp(createAdminClient(), shop.id, {
    domain: String(input?.domain ?? ""),
    clientId: String(input?.clientId ?? ""),
    clientSecret: String(input?.clientSecret ?? ""),
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
