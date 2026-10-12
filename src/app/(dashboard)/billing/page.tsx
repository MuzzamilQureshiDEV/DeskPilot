import { CreditCard } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState, PageHeader, PageShell } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentShop } from "@/lib/auth/session";
import { PLANS, planOf, usagePeriodStart } from "@/lib/billing/plans";
import { billingSummary } from "@/lib/billing/status";
import { loadAiAccess } from "@/lib/billing/usage";
import { serverEnv } from "@/lib/env";
import { paypalConfig } from "@/lib/paypal/client";
import { loadPayPalPrices, paypalManageUrl } from "@/lib/paypal/checkout";
import { LIVE_STATUSES, loadPrices } from "@/lib/stripe/checkout";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { PricingCards } from "@/components/billing/pricing-cards";
import { ChoosePlanButton, ManageBillingButton, PayPalManage, PayPalPlanButton } from "./billing-buttons";

export const metadata: Metadata = { title: "Billing · AstaDesk" };

const dateFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

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
    paypalConfig() ? loadPayPalPrices() : loadPrices(),
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
  const paypalReturn = params.paypal;
  const usePayPal = !!paypalConfig();
  const onPayPal = shop.billingProvider === "paypal" && !!shop.paypalSubscriptionId;

  return (
    <PageShell>
      <PageHeader title="Billing" description="Your plan, usage and invoices." />

      {checkout === "success" && (
        <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          Payment received, thank you! Your plan updates here within a few seconds. Refresh if it hasn&apos;t yet.
        </p>
      )}
      {paypalReturn === "success" && (
        <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          PayPal approved, thank you! Your plan updates here within a few seconds. Refresh if it hasn&apos;t yet.
        </p>
      )}
      {paypalReturn === "cancel" && (
        <p role="status" className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
          PayPal checkout was cancelled. You haven&apos;t been charged.
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
            <span className="capitalize">{plan === "trial" ? "Your plan" : `${plan} plan`}</span>
            <Badge variant={TONE[summary.tone]}>{summary.label}</Badge>
          </CardTitle>
          <CardDescription>{summary.detail}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {plan !== "trial" && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-medium">{limit === null ? `${used} AI replies this period` : `${used} of ${limit} AI replies used`}</span>
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
                <p className="text-sm text-destructive">{shop.agentName} is paused. New messages still arrive, but no AI drafts are written.</p>
              )}
            </div>
          )}
          {isOwner && onPayPal && <PayPalManage manageUrl={paypalManageUrl()} cancelled={shop.subscriptionStatus === "canceled"} />}
          {isOwner && !onPayPal && shop.hasStripeCustomer && (
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
        <PricingCards
          prices={prices}
          cta={(p) => {
            const current = plan === p && subscribed;
            if (current) return <Badge>Your current plan</Badge>;
            if (!isOwner) return null;
            const label = subscribed ? `Switch to ${p}` : `Choose ${p}`;
            return (
              <div className="flex flex-col gap-2">
                {usePayPal ? (
                  <PayPalPlanButton plan={p} label={onPayPal && subscribed ? `${label} with PayPal` : "Subscribe with PayPal"} />
                ) : (
                  <ChoosePlanButton plan={p} variant={p === "growth" ? "default" : "outline"} label={label} />
                )}
                {p === "scale" && salesEmail && (
                  <a
                    href={`mailto:${salesEmail}?subject=AstaDesk%20Scale%20plan`}
                    className="text-center text-xs underline underline-offset-2 opacity-80"
                  >
                    Need more than 1,000 replies? Talk to us
                  </a>
                )}
              </div>
            );
          }}
        />
      )}

      <p className="text-xs text-muted-foreground">
        Payments are handled securely by {usePayPal ? "PayPal" : "Stripe"}. AstaDesk never sees your card details. Prices exclude any applicable tax.
      </p>
    </PageShell>
  );
}
