import { publicEnvSchema, type PublicEnv } from "@/lib/env-schema";

/**
 * Validated public env, safe for client code. Each key is referenced literally
 * so Next.js can inline it into the browser bundle.
 */
export function publicEnv(): PublicEnv {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
