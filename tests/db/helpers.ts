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
  // Supabase limits sign-ins per minute; wait and retry instead of failing (and leaving data behind).
  for (let attempt = 0; ; attempt++) {
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (!signIn.error) break;
    if (signIn.error.status !== 429 || attempt >= 5) {
      // Clean up the half-made account (and the shop the signup trigger created).
      const { data: m } = await admin.from("shop_members").select("shop_id").eq("user_id", data.user.id);
      if (m?.length) await admin.from("shops").delete().in("id", m.map((x) => x.shop_id));
      await admin.auth.admin.deleteUser(data.user.id);
      throw signIn.error;
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }

  return { id: data.user.id, email, client };
}

export async function deleteTestUser(admin: Db, user: TestUser | undefined) {
  if (!user) return;
  await user.client.auth.signOut();
  await admin.auth.admin.deleteUser(user.id);
}
