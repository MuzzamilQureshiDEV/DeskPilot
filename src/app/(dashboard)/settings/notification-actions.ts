"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentShop } from "@/lib/auth/session";
import { hasPlan } from "@/lib/billing/plans";
import { createClient } from "@/lib/supabase/server";

const prefsSchema = z.object({ escalations: z.boolean(), approvals: z.boolean() });

/** Owner turns the escalation / approval email alerts on or off. RLS limits the update to their shop. */
export async function saveNotificationSettings(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid settings." };
  const shop = await getCurrentShop();
  if (!shop) return { ok: false, error: "Your account isn't linked to a store." };
  if (shop.role !== "owner") return { ok: false, error: "Only the store owner can change alerts." };
  if (!hasPlan(shop.plan)) return { ok: false, error: "Choose a plan to turn on alerts." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("shops")
    .update({ notify_escalations: parsed.data.escalations, notify_approvals: parsed.data.approvals })
    .eq("id", shop.id);
  if (error) return { ok: false, error: "Couldn't save. Please try again." };
  revalidatePath("/settings");
  return { ok: true };
}
