"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAuthUser, getCurrentShop } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env-public";
import { emailFiltersSchema } from "@/lib/settings/email-filters";
import { widgetSchema } from "@/lib/settings/widget";
import { createClient } from "@/lib/supabase/server";

// Settings tabs: widget look, email filters, signature, quick replies, account.
// Every write goes through the signed-in user's client, so RLS and the column
// grants limit it to their own shop.

export type Result = { ok: true } | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Please check the form.";

async function shopOrNull() {
  const shop = await getCurrentShop();
  return shop ? { shop, db: await createClient() } : null;
}

export async function saveWidget(input: unknown): Promise<Result> {
  const parsed = widgetSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await shopOrNull();
  if (!ctx) return fail("Your account isn't linked to a store.");
  const { error } = await ctx.db.from("shops").update({ widget: parsed.data }).eq("id", ctx.shop.id);
  if (error) return fail("Couldn't save. Please try again.");
  revalidatePath("/settings");
  return { ok: true };
}

export async function saveEmailFilters(input: unknown): Promise<Result> {
  const parsed = emailFiltersSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await shopOrNull();
  if (!ctx) return fail("Your account isn't linked to a store.");
  const { error } = await ctx.db.from("shops").update({ email_filters: parsed.data }).eq("id", ctx.shop.id);
  if (error) return fail("Couldn't save. Please try again.");
  revalidatePath("/settings");
  return { ok: true };
}

const signatureSchema = z.string().max(300, "Keep the signature under 300 characters.");

export async function saveSignature(signature: unknown): Promise<Result> {
  const parsed = signatureSchema.safeParse(signature);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await shopOrNull();
  if (!ctx) return fail("Your account isn't linked to a store.");
  const { error } = await ctx.db.from("shops").update({ email_signature: parsed.data.trim() }).eq("id", ctx.shop.id);
  if (error) return fail("Couldn't save. Please try again.");
  revalidatePath("/settings");
  return { ok: true };
}

const quickReplySchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1, "Add a title.").max(80, "Keep the title under 80 characters."),
  body: z.string().trim().min(1, "Write the reply.").max(2000, "Keep it under 2,000 characters."),
});
const MAX_QUICK_REPLIES = 50;

export async function saveQuickReply(input: unknown): Promise<Result> {
  const parsed = quickReplySchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const ctx = await shopOrNull();
  if (!ctx) return fail("Your account isn't linked to a store.");
  const { id, title, body } = parsed.data;
  if (id) {
    const { data, error } = await ctx.db.from("quick_replies").update({ title, body }).eq("id", id).eq("shop_id", ctx.shop.id).select("id");
    if (error || !data?.length) return fail("Couldn't save. Please try again.");
  } else {
    const { count } = await ctx.db.from("quick_replies").select("id", { count: "exact", head: true }).eq("shop_id", ctx.shop.id);
    if ((count ?? 0) >= MAX_QUICK_REPLIES) return fail(`You can keep up to ${MAX_QUICK_REPLIES} quick replies. Delete one first.`);
    const { error } = await ctx.db.from("quick_replies").insert({ shop_id: ctx.shop.id, title, body });
    if (error) return fail("Couldn't save. Please try again.");
  }
  revalidatePath("/settings");
  revalidatePath("/inbox", "layout");
  return { ok: true };
}

export async function deleteQuickReply(id: unknown): Promise<Result> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return fail("Invalid request.");
  const ctx = await shopOrNull();
  if (!ctx) return fail("Your account isn't linked to a store.");
  const { error } = await ctx.db.from("quick_replies").delete().eq("id", parsed.data).eq("shop_id", ctx.shop.id);
  if (error) return fail("Couldn't delete. Please try again.");
  revalidatePath("/settings");
  revalidatePath("/inbox", "layout");
  return { ok: true };
}

const nameSchema = z.string().trim().min(1, "Enter your name.").max(80, "Keep it under 80 characters.");

export async function saveAccountName(name: unknown): Promise<Result> {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { full_name: parsed.data } });
  if (error) return fail("Couldn't save. Please try again.");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Emails the signed-in user the (branded) reset-password link. */
export async function sendPasswordReset(): Promise<Result> {
  const user = await getAuthUser();
  if (!user?.email) return fail("Log in again and retry.");
  const supabase = await createClient();
  const url = new URL("/auth/confirm", publicEnv().NEXT_PUBLIC_APP_URL);
  url.searchParams.set("next", "/reset/update");
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: url.toString() });
  if (error) return fail("Couldn't send the email. Please try again in a minute.");
  return { ok: true };
}
