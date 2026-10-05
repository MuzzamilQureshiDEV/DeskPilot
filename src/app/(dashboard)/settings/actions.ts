"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentShop } from "@/lib/auth/session";
import { agentSettingsSchema, toneText } from "@/lib/settings/agent";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type AgentSettingsState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
};

export async function saveAgentSettings(_prev: AgentSettingsState, formData: FormData): Promise<AgentSettingsState> {
  const parsed = agentSettingsSchema.safeParse({
    agentName: formData.get("agentName"),
    tonePreset: formData.get("tonePreset"),
    customTone: formData.get("customTone") ?? "",
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const shop = await getCurrentShop();
  if (!shop) return { error: "Your account isn't linked to a store." };
  const supabase = await createClient();

  // Keep other setup flags; mark the tone step done.
  const { data: current } = await supabase.from("shops").select("setup").eq("id", shop.id).single();
  const setup = current?.setup && typeof current.setup === "object" && !Array.isArray(current.setup) ? current.setup : {};
  const nextSetup: Json = { ...setup, tone_chosen: true };

  const { error } = await supabase
    .from("shops")
    .update({
      agent_name: parsed.data.agentName,
      agent_tone: toneText(parsed.data.tonePreset, parsed.data.customTone),
      setup: nextSetup,
    })
    .eq("id", shop.id);
  if (error) return { error: "Couldn't save. Please try again." };

  revalidatePath("/", "layout");
  return { ok: true };
}
