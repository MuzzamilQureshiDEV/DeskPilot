import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env-public";
import type { Database } from "@/types/database";

/** Browser client (anon key). All access is governed by RLS. */
export function createClient() {
  const env = publicEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
