import { z } from "zod";

// Pure schemas (no side effects) so they can be unit-tested and shared.
// Keys for later phases are optional until their task lands; tighten them then.

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const encryptionKey = z
  .string()
  .refine((v) => Buffer.from(v, "base64").length === 32, {
    message: "ENCRYPTION_KEY must be 32 bytes, base64-encoded",
  });

export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ENCRYPTION_KEY: encryptionKey.optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  SHOPIFY_API_KEY: z.string().min(1).optional(),
  SHOPIFY_API_SECRET: z.string().min(1).optional(),
  SHOPIFY_SCOPES: z.string().min(1).optional(),
  INNGEST_EVENT_KEY: z.string().min(1).optional(),
  INNGEST_SIGNING_KEY: z.string().min(1).optional(),
  POSTMARK_SERVER_TOKEN: z.string().min(1).optional(),
  POSTMARK_INBOUND_TOKEN: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  SENTRY_DSN: z.url().optional(),
});

/**
 * The app's public URL: NEXT_PUBLIC_APP_URL if set, otherwise the production
 * domain Vercel provides automatically (so a missing setting can't break pages).
 */
export function appUrlFromEnv(env: Record<string, string | undefined>): string | undefined {
  if (env.NEXT_PUBLIC_APP_URL) return env.NEXT_PUBLIC_APP_URL;
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL ?? env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : undefined;
}

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
