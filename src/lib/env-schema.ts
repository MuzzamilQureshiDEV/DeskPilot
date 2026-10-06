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
  /** Dev only: "1" swaps Claude for a rule-based stand-in (ignored in production). */
  DEV_FAKE_AI: z.string().optional(),
  SHOPIFY_API_KEY: z.string().min(1).optional(),
  SHOPIFY_API_SECRET: z.string().min(1).optional(),
  SHOPIFY_SCOPES: z.string().min(1).optional(),
  /** App Store listing / install link. When set, the Store page offers one-click connect. */
  SHOPIFY_INSTALL_URL: z.url().optional(),
  INNGEST_DEV: z.string().optional(),
  INNGEST_EVENT_KEY: z.string().min(1).optional(),
  INNGEST_SIGNING_KEY: z.string().min(1).optional(),
  POSTMARK_SERVER_TOKEN: z.string().min(1).optional(),
  POSTMARK_INBOUND_TOKEN: z.string().min(16).optional(),
  /** Postmark server inbound address, e.g. abc123@inbound.postmarkapp.com. */
  POSTMARK_INBOUND_ADDRESS: z.email().optional(),
  /** Verified Postmark sender signature. Unset = dev outbox (replies are recorded, not emailed). */
  POSTMARK_FROM_EMAIL: z.email().optional(),
  STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(test|live)_/, "Use a Stripe secret key (sk_test_… or sk_live_…)").optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  /** Shown on the Billing page for the custom Scale plan. */
  SALES_EMAIL: z.email().optional(),
  /** Legal pages (Privacy Policy, Terms). */
  LEGAL_ENTITY_NAME: z.string().min(1).max(200).default("DeskPilot"),
  LEGAL_CONTACT_EMAIL: z.email().optional(),
  LEGAL_GOVERNING_LAW: z.string().min(2).max(100).default("Pakistan"),
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
