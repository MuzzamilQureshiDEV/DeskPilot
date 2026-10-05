import { Check, CreditCard } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState, PageHeader, PageShell } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentShop } from "@/lib/auth/session";
import { PLANS, planOf, usagePeriodStart, type SelfServePlan } from "@/lib/billing/plans";
import { billingSummary, formatPrice } from "@/lib/billing/status";
import { loadAiAccess } from "@/lib/billing/usage";
import { serverEnv } from "@/lib/env";
import { LIVE_STATUSES, loadPrices } from "@/lib/stripe/checkout";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { ChoosePlanButton, ManageBillingButton } from "./billing-buttons";

export const metadata: Metadata = { title: "Billing · DeskPilot" };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

const FEATURES: Record<SelfServePlan | "scale", string[]> = {
  starter: [`${PLANS.starter.aiRepliesPerMonth} AI replies a month`, "Refunds, cancellations and edits with your approval", "Email support inbox"],
  growth: [`${PLANS.growth.aiRepliesPerMonth} AI replies a month`, "Autopilot: send confident replies automatically", "Everything in Starter"],
  scale: ["Unlimited AI replies", "Autopilot", "Custom setup and priority support"],
};

const TONE = { ok: "default", warn: "secondary", bad: "destructive" } as const;

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  const shop = await getCurrentShop();
  if (!shop) {
    return (
      <PageShell>
        <EmptyState icon={CreditCard} title="No store yet" description="Your account isn't linked to a store." />
      </PageShell>
    );
  }

  const now = new Date();
  const [{ used, access }, prices, params] = await Promise.all([
    loadAiAccess(await createClient(), shop.id, shop, now),
    loadPrices(),
    searchParams,
  ]);
  const plan = planOf(shop.plan);
  const limit = PLANS[plan].aiRepliesPerMonth;
  const usedPct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const summary = billingSummary(shop, now);
  const isOwner = shop.role === "owner";
  const subscribed = !!shop.subscriptionStatus && LIVE_STATUSES.has(shop.subscriptionStatus);
  const salesEmail = serverEnv().SALES_EMAIL;
  const checkout = params.checkout;

  return (
    <PageShell>
      <PageHeader title="Billing" description="Your plan, usage and invoices." />

      {checkout === "success" && (
        <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          Payment received, thank you! Your plan updates here within a few seconds. Refresh if it hasn&apos;t yet.
        </p>
      )}
      {checkout === "cancel" && (
        <p role="status" className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
          Checkout was cancelled. You haven&apos;t been charged.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span className="capitalize">{plan === "trial" ? "Free trial" : `${plan} plan`}</span>
            <Badge variant={TONE[summary.tone]}>{summary.label}</Badge>
          </CardTitle>
          <CardDescription>{summary.detail}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-medium">
                {limit === null ? `${used} AI replies this period` : `${used} of ${limit} AI replies used`}
              </span>
              <span className="text-muted-foreground">Since {dateFormat.format(usagePeriodStart(now, shop))}</span>
            </div>
            {limit !== null && (
              <div
                role="progressbar"
                aria-label="AI replies used this period"
                aria-valuenow={used}
                aria-valuemin={0}
                aria-valuemax={limit}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div className={cn("h-full rounded-full", usedPct >= 90 ? "bg-destructive" : "bg-primary")} style={{ width: `${usedPct}%` }} />
              </div>
            )}
            {!access.allowed && (
              <p className="text-sm text-destructive">
                {shop.agentName} is paused. New messages still arrive, but no AI drafts are written.
              </p>
            )}
          </div>
          {isOwner && shop.hasStripeCustomer && (
            <div className="self-start">
              <ManageBillingButton />
              <p className="mt-1 text-xs text-muted-foreground">Change plan, update your card, see invoices or cancel.</p>
            </div>
          )}
          {!isOwner && <p className="text-sm text-muted-foreground">Only the store owner can change the plan.</p>}
        </CardContent>
      </Card>

      {prices.length === 0 ? (
        <EmptyState icon={CreditCard} title="Plans aren't available yet" description="Billing is being set up. Please check back soon." />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {prices.map((price) => {
            const current = plan === price.plan && subscribed;
            const recommended = price.plan === "growth";
            return (
              <Card key={price.plan} className={cn(recommended && "border-primary")}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 capitalize">
                    {price.plan}
                    {recommended && <Badge variant="secondary">Most popular</Badge>}
                  </CardTitle>
                  <CardDescription>
                    <span className="text-2xl font-semibold text-foreground">{formatPrice(price.amount, price.currency)}</span> / {price.interval}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <ul className="flex flex-col gap-2 text-sm">
                    {FEATURES[price.plan].map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto">
                    {current ? (
                      <Badge>Your current plan</Badge>
                    ) : isOwner ? (
                      <ChoosePlanButton
                        plan={price.plan}
                        variant={recommended ? "default" : "outline"}
                        label={subscribed ? `Switch to ${price.plan}` : `Choose ${price.plan}`}
                      />
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <Card>
            <CardHeader>
              <CardTitle>Scale</CardTitle>
              <CardDescription>
                <span className="text-2xl font-semibold text-foreground">Custom</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <ul className="flex flex-col gap-2 text-sm">
                {FEATURES.scale.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto text-sm">
                {plan === "scale" ? (
                  <Badge>Your current plan</Badge>
                ) : salesEmail ? (
                  <a href={`mailto:${salesEmail}?subject=DeskPilot%20Scale%20plan`} className="font-medium text-primary underline underline-offset-2">
                    Contact us
                  </a>
                ) : (
                  <span className="text-muted-foreground">Contact us for a custom plan.</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Payments are handled securely by Stripe. DeskPilot never sees your card details. Prices exclude any applicable tax.
      </p>
    </PageShell>
  );
}
