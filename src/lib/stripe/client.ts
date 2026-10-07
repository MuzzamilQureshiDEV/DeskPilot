import "server-only";

import Stripe from "stripe";

import { serverEnv } from "@/lib/env";

let cached: Stripe | null | undefined;

/** Server-side Stripe client, or null when billing isn't configured (no secret key). */
export function stripeClient(): Stripe | null {
  if (cached === undefined) {
    const key = serverEnv().STRIPE_SECRET_KEY;
    cached = key ? new Stripe(key, { appInfo: { name: "AstaDesk" }, maxNetworkRetries: 2 }) : null;
  }
  return cached;
}
