"use server";

import { revalidatePath } from "next/cache";

import { getCurrentShop } from "@/lib/auth/session";
import { saveSetting, type SaveResult } from "@/lib/automation/settings";
import { createClient } from "@/lib/supabase/server";

export async function saveAutomationSetting(input: unknown): Promise<SaveResult> {
  const shop = await getCurrentShop();
  if (!shop) return { ok: false, error: "Your account isn't linked to a store." };
  const result = await saveSetting(await createClient(), shop, input);
  revalidatePath("/automation");
  return result;
}
