"use server";

import { revalidatePath } from "next/cache";

import { getCurrentShop } from "@/lib/auth/session";
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
