import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { FOUNDING_BADGE, PLAN_COPY } from "@/lib/billing/catalog";
import { SELF_SERVE_PLANS, type SelfServePlan } from "@/lib/billing/plans";
import { formatPrice } from "@/lib/billing/status";
import { cn } from "@/lib/utils";

export type CardPrice = { plan: SelfServePlan; amount: number; currency: string; interval: string };

/**
 * The three plan cards (landing page and Billing). Growth is the dark,
 * highlighted card. `cta` renders each plan's button (link, PayPal, Stripe…).
 */
export function PricingCards({ prices, cta }: { prices: CardPrice[]; cta: (plan: SelfServePlan) => ReactNode }) {
  return (
    <div className="grid overflow-hidden rounded-3xl border bg-card shadow-soft lg:grid-cols-3">
      {SELF_SERVE_PLANS.map((plan) => {
        const copy = PLAN_COPY[plan];
        const price = prices.find((p) => p.plan === plan);
        const dark = !!copy.featured;
        return (
          <section
            key={plan}
            aria-labelledby={`plan-${plan}`}
            className={cn(
              "relative flex flex-col gap-5 p-7 sm:p-8",
              dark ? "bg-[oklch(0.17_0.015_200)] text-white dark:bg-[oklch(0.25_0.03_180)]" : "border-b last:border-b-0 lg:border-r lg:border-b-0 lg:last:border-r-0",
            )}
          >
            {dark && (
              <span className="absolute top-5 right-5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                Most popular
              </span>
            )}
            <div className="flex flex-col gap-1">
              <p className={cn("text-xs font-semibold tracking-wider uppercase", dark ? "text-white/60" : "text-muted-foreground")}>{copy.kicker}</p>
              <p className={cn("text-sm", dark ? "text-white/60" : "text-muted-foreground")}>{copy.tagline}</p>
              <h3 id={`plan-${plan}`} className="mt-1 text-xl font-semibold">
                {copy.name}
              </h3>
            </div>

            <span
              className={cn(
                "self-start rounded-full px-3 py-1 text-xs font-medium",
                dark ? "bg-white/10 text-white ring-1 ring-white/15" : "bg-accent text-accent-foreground",
              )}
            >
              {FOUNDING_BADGE}
            </span>

            <p className="flex items-baseline gap-2">
              <span className="text-5xl font-semibold tracking-tight">{price ? formatPrice(price.amount, price.currency) : "—"}</span>
              <span className={cn("text-sm", dark ? "text-white/60" : "text-muted-foreground")}>/{price?.interval ?? "month"}</span>
            </p>
            <p className={cn("text-sm", dark ? "text-white/75" : "text-muted-foreground")}>{copy.description}</p>

            <div>{cta(plan)}</div>

            <div className="flex flex-col gap-2.5">
              {copy.includes && <p className={cn("text-xs", dark ? "text-white/60" : "text-muted-foreground")}>{copy.includes}</p>}
              <ul className="flex flex-col gap-2.5 text-sm">
                {copy.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                        dark ? "bg-white/15 text-white" : "bg-primary/10 text-primary",
                      )}
                    >
                      <Check className="size-3" aria-hidden />
                    </span>
                    <span className={dark ? "text-white/85" : undefined}>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className={cn("mt-auto border-t pt-4 text-sm italic", dark ? "border-white/10 text-white/50" : "text-muted-foreground")}>
              &ldquo;{copy.quote}&rdquo;
            </p>
          </section>
        );
      })}
    </div>
  );
}
