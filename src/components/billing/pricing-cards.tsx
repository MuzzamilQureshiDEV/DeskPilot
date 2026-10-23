import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { CUSTOM_PLAN, FOUNDING_BADGE, PLAN_COPY, type PlanCopy } from "@/lib/billing/catalog";
import { SELF_SERVE_PLANS, type SelfServePlan } from "@/lib/billing/plans";
import { formatPrice } from "@/lib/billing/status";
import { cn } from "@/lib/utils";

export type CardPrice = { plan: SelfServePlan; amount: number; currency: string; interval: string };

type CardEntry = { key: string; copy: PlanCopy; badge: string; price: string; interval: string; extra?: string; cta: ReactNode };

/**
 * The plan cards (landing page and Billing): the three self-serve plans plus
 * the "Customize" card. Growth is the dark, highlighted card. `cta` renders
 * each plan's button (link, PayPal, Stripe…), `customCta` the Customize one.
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
  const entries: CardEntry[] = [
    ...SELF_SERVE_PLANS.map((plan) => {
      const price = prices.find((p) => p.plan === plan);
      return {
        key: plan,
        copy: PLAN_COPY[plan],
        badge: FOUNDING_BADGE,
        price: price ? formatPrice(price.amount, price.currency) : "—",
        interval: price?.interval ?? "month",
        cta: cta(plan),
      };
    }),
    {
      key: "custom",
      copy: CUSTOM_PLAN.copy,
      badge: CUSTOM_PLAN.badge,
      price: formatPrice(CUSTOM_PLAN.monthlyAmount, CUSTOM_PLAN.currency),
      interval: "month",
      extra: `+ ${formatPrice(CUSTOM_PLAN.perReplyAmount, CUSTOM_PLAN.currency)} per AI reply`,
      cta: customCta,
    },
  ];

  return (
    <div className="grid gap-px overflow-hidden rounded-3xl border bg-border shadow-soft md:grid-cols-2 xl:grid-cols-4">
      {entries.map(({ key, copy, badge, price, interval, extra, cta: button }) => {
        const dark = !!copy.featured;
        return (
          <section
            key={key}
            aria-labelledby={`plan-${key}`}
            className={cn(
              "relative flex flex-col gap-5 p-7 sm:p-8",
              dark ? "bg-[oklch(0.17_0.015_200)] text-white dark:bg-[oklch(0.25_0.03_180)]" : "bg-card",
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
              <h3 id={`plan-${key}`} className="mt-1 text-xl font-semibold">
                {copy.name}
              </h3>
            </div>

            <span
              className={cn(
                "self-start rounded-full px-3 py-1 text-xs font-medium",
                dark ? "bg-white/10 text-white ring-1 ring-white/15" : "bg-accent text-accent-foreground",
              )}
            >
              {badge}
            </span>

            <div className="flex flex-col gap-1">
              <p className="flex items-baseline gap-2">
                <span className="text-5xl font-semibold tracking-tight">{price}</span>
                <span className={cn("text-sm", dark ? "text-white/60" : "text-muted-foreground")}>/{interval}</span>
              </p>
              {extra && <p className="text-sm font-medium">{extra}</p>}
            </div>
            <p className={cn("text-sm", dark ? "text-white/75" : "text-muted-foreground")}>{copy.description}</p>

            <div>{button}</div>

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
