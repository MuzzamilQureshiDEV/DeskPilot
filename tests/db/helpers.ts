import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { serverEnvSchema } from "@/lib/env-schema";
import type { Database } from "@/types/database";

export type Db = SupabaseClient<Database>;

const parsed = serverEnvSchema.safeParse(process.env);

/** DB tests run only when Supabase env vars are present (e.g. from .env.local). */
export const hasDbEnv = parsed.success;

function env() {
  if (!parsed.success) throw new Error("Supabase env vars missing");
  return parsed.data;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export function adminClient(): Db {
  const e = env();
  return createClient<Database>(
    e.NEXT_PUBLIC_SUPABASE_URL,
    e.SUPABASE_SERVICE_ROLE_KEY,
    noSession,
  );
}

export function anonClient(): Db {
  const e = env();
  return createClient<Database>(
    e.NEXT_PUBLIC_SUPABASE_URL,
    e.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    noSession,
  );
}

export type TestUser = { id: string; email: string; client: Db };

/**
 * Creates a confirmed user and returns a client signed in as them (RLS applies).
 * Pass `shopName` to go through the signup trigger, which creates their shop.
 */
export async function createTestUser(
  admin: Db,
  opts: { shopName?: string } = {},
): Promise<TestUser> {
  const email = `test-${randomUUID()}@deskpilot.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: opts.shopName ? { shop_name: opts.shopName } : {},
  });
  if (error) throw error;

  const client = anonClient();
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;

  return { id: data.user.id, email, client };
}

export async function deleteTestUser(admin: Db, user: TestUser | undefined) {
  if (!user) return;
  await user.client.auth.signOut();
  await admin.auth.admin.deleteUser(user.id);
}
