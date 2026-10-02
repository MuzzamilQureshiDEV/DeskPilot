import "server-only";

import { createClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Service-role client. BYPASSES RLS.
 *
 * Use ONLY in background jobs (Inngest) and verified webhooks. Every query
 * made with it must filter by `shop_id` explicitly. Never use it to serve a
 * request made in a user's context; use `@/lib/supabase/server` instead.
 */
export function createAdminClient() {
  const env = serverEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
