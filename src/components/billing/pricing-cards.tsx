import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { CUSTOM_PLAN, FOUNDING_BADGE, PLAN_COPY } from "@/lib/billing/catalog";
import { SELF_SERVE_PLANS, type SelfServePlan } from "@/lib/billing/plans";
import { formatPrice } from "@/lib/billing/status";
import { cn } from "@/lib/utils";

export type CardPrice = { plan: SelfServePlan; amount: number; currency: string; interval: string };

function Feature({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <li className="flex gap-2.5">
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
          dark ? "bg-white/15 text-white" : "bg-primary/10 text-primary",
        )}
      >
        <Check className="size-3" aria-hidden />
      </span>
      <span className={dark ? "text-white/85" : undefined}>{children}</span>
    </li>
  );
}

/**
 * The three plan cards (landing page and Billing), with the wide "Customize"
 * card below them. Growth is the dark, highlighted card. `cta` renders each
 * plan's button (link, PayPal, Stripe…), `customCta` the Customize one.
 */
export function PricingCards({
  prices,
  cta,
  customCta,
}: {
  prices: CardPrice[];
  cta: (plan: SelfServePlan) => ReactNode;
  customCta: ReactNode;
}) {
  const custom = CUSTOM_PLAN.copy;
  return (
    <div className="flex flex-col gap-6">
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
                    <Feature key={f} dark={dark}>
                      {f}
                    </Feature>
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

      <section
        aria-labelledby="plan-custom"
        className="grid gap-8 rounded-3xl border bg-card p-7 shadow-soft sm:p-8 lg:grid-cols-[1.2fr_1fr_1.2fr] lg:items-center lg:gap-10"
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{custom.kicker}</p>
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">{CUSTOM_PLAN.badge}</span>
          </div>
          <h3 id="plan-custom" className="text-xl font-semibold">
            {custom.name}
          </h3>
          <p className="text-sm text-muted-foreground">{custom.description}</p>
        </div>

        <div className="flex flex-col gap-1 lg:border-x lg:px-10">
          <p className="flex items-baseline gap-2">
            <span className="text-5xl font-semibold tracking-tight">{formatPrice(CUSTOM_PLAN.monthlyAmount, CUSTOM_PLAN.currency)}</span>
            <span className="text-sm text-muted-foreground">/month</span>
          </p>
          <p className="text-sm font-medium">+ {formatPrice(CUSTOM_PLAN.perReplyAmount, CUSTOM_PLAN.currency)} per AI reply</p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2.5">
            {custom.includes && <p className="text-xs text-muted-foreground">{custom.includes}</p>}
            <ul className="flex flex-col gap-2.5 text-sm">
              {custom.features.map((f) => (
                <Feature key={f}>{f}</Feature>
              ))}
            </ul>
          </div>
          {customCta && <div>{customCta}</div>}
        </div>
      </section>
    </div>
  );
}
