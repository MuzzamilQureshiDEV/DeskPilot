"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { enqueueAction } from "@/inngest/events";
import { getCurrentShop } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type DecisionResult = { ok: true; queued: boolean } | { ok: false; error: string };

const approveSchema = z.object({ id: z.uuid(), notifyCustomer: z.boolean(), restock: z.boolean() });

/**
 * A signed-in member approves a pending action (CLAUDE.md rule 2). The DB
 * function records who decided; the background job then runs it in Shopify.
 */
export async function approveAction(input: unknown): Promise<DecisionResult> {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const shop = await getCurrentShop();
  if (!shop) return { ok: false, error: "Your account isn't linked to a store." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_action_request", {
    p_id: parsed.data.id,
    p_options: { notify_customer: parsed.data.notifyCustomer, restock: parsed.data.restock },
  });
  revalidatePath("/", "layout");
  if (error) return { ok: false, error: "Couldn't approve this request." };
  const row = data?.[0];
  if (!row) return { ok: false, error: "This request was already decided." };

  try {
    await enqueueAction({ shopId: row.action_shop_id, actionId: parsed.data.id });
    return { ok: true, queued: true };
  } catch {
    // Approved and recorded; it runs once background processing is available.
    return { ok: true, queued: false };
  }
}

export async function rejectAction(id: unknown): Promise<DecisionResult> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const shop = await getCurrentShop();
  if (!shop) return { ok: false, error: "Your account isn't linked to a store." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reject_action_request", { p_id: parsed.data });
  revalidatePath("/", "layout");
  if (error) return { ok: false, error: "Couldn't reject this request." };
  if (!data?.[0]) return { ok: false, error: "This request was already decided." };
  return { ok: true, queued: false };
}
