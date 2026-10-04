"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentShop } from "@/lib/auth/session";
import { KIND_META, knowledgeIdSchema, knowledgeInputSchema } from "@/lib/knowledge/schema";
import { createClient } from "@/lib/supabase/server";

export type KnowledgeActionState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
};

const GENERIC = "Something went wrong saving that. Please try again.";

/** Creates an entry (no id) or updates one (with id). RLS limits both to the user's shop. */
export async function saveKnowledge(
  _prev: KnowledgeActionState,
  formData: FormData,
): Promise<KnowledgeActionState> {
  const parsed = knowledgeInputSchema.safeParse({
    kind: formData.get("kind"),
    title: formData.get("title"),
    content: formData.get("content"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { kind, title, content } = parsed.data;

  const rawId = formData.get("id");
  const id = rawId ? knowledgeIdSchema.safeParse(rawId) : null;
  if (id && !id.success) return { error: GENERIC };

  const shop = await getCurrentShop();
  if (!shop) return { error: "Your account isn't linked to a store." };
  const supabase = await createClient();

  if (id) {
    const { data, error } = await supabase
      .from("knowledge")
      .update({ title, content, updated_at: new Date().toISOString() })
      .eq("id", id.data)
      .eq("shop_id", shop.id)
      .select("id");
    if (error || !data?.length) return { error: GENERIC };
  } else {
    const { count } = await supabase
      .from("knowledge")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shop.id)
      .eq("kind", kind);
    const { max, singular } = KIND_META[kind];
    if ((count ?? 0) >= max) {
      return { error: `You can have up to ${max} entries here. Delete or merge one before adding another ${singular}.` };
    }
    const { error } = await supabase.from("knowledge").insert({ shop_id: shop.id, kind, title, content });
    if (error) return { error: GENERIC };
  }

  revalidatePath("/train");
  return { ok: true };
}

export async function deleteKnowledge(id: string): Promise<{ ok: boolean }> {
  const parsed = knowledgeIdSchema.safeParse(id);
  const shop = await getCurrentShop();
  if (!parsed.success || !shop) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge")
    .delete()
    .eq("id", parsed.data)
    .eq("shop_id", shop.id)
    .select("id");
  revalidatePath("/train");
  return { ok: !error && !!data?.length };
}
