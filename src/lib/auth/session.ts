import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { LOGIN_PATH } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

export type AuthUser = { id: string; email: string };

/** Signed-in user from the verified JWT, or null. Cached per request. */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;
  return { id: data.claims.sub, email: data.claims.email ?? "" };
});

/** Authoritative auth check for pages and actions (the proxy check is only optimistic). */
export async function requireUser(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
}

export type CurrentShop = {
  id: string;
  name: string;
  agentName: string;
  agentTone: string;
  plan: string;
  trialEndsAt: string | null;
  role: string;
};

/**
 * The signed-in user's shop, read through RLS. Lists columns explicitly:
 * `shopify_token_enc` is not granted to browsers, so `select('*')` would fail.
 */
export const getCurrentShop = cache(async (): Promise<CurrentShop | null> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_members")
    .select("role, shops(id, name, agent_name, agent_tone, plan, trial_ends_at)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("Could not load shop");
  if (!data?.shops) return null;

  return {
    id: data.shops.id,
    name: data.shops.name,
    agentName: data.shops.agent_name,
    agentTone: data.shops.agent_tone,
    plan: data.shops.plan,
    trialEndsAt: data.shops.trial_ends_at,
    role: data.role,
  };
});
