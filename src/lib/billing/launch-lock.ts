import { serverEnv } from "@/lib/env";
import { LAUNCH_AT } from "@/lib/launch";
import { paypalConfig } from "@/lib/paypal/client";

// Before launch, plans can't be bought with real money. Test payments (PayPal
// sandbox / Stripe test keys) stay open so the checkout can be tried first.

/** True when the active payment gateway takes real money. */
export function realMoneyBilling(): boolean {
  const e = serverEnv();
  if (paypalConfig()) return e.PAYPAL_ENV === "live";
  return /^(sk|rk)_live_/.test(e.STRIPE_SECRET_KEY ?? "");
}

/** Plans are locked until launch, but only when real money would change hands. */
export function plansLocked(now: Date = new Date()): boolean {
  return realMoneyBilling() && now.getTime() < new Date(LAUNCH_AT).getTime();
}
