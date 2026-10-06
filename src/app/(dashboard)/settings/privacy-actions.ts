"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/** Mark a customer data request as handled (members only, enforced by the RPC). */
export async function completePrivacyRequest(id: string): Promise<{ ok: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false };
  const { error } = await (await createClient()).rpc("complete_privacy_request", { p_id: id });
  revalidatePath("/settings");
  return { ok: !error };
}
