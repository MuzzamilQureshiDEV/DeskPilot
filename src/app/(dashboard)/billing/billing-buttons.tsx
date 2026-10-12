"use client";

import { useState, useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import type { SelfServePlan } from "@/lib/billing/plans";

import { cancelPayPalAction, choosePayPalPlanAction, choosePlanAction, openPortalAction, type BillingResult } from "./actions";

function useBillingAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // On success the action redirects to Stripe; only errors come back.
  const run = (fn: () => Promise<BillingResult>) =>
    start(async () => {
      const res = await fn();
      setError(res?.error ?? null);
    });
  return { pending, error, run };
}

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

export function ChoosePlanButton({ plan, label, variant }: { plan: SelfServePlan; label: string; variant: "default" | "outline" }) {
  const { pending, error, run } = useBillingAction();
  return (
    <div className="flex flex-col gap-2">
      <Button variant={variant} disabled={pending} onClick={() => run(() => choosePlanAction(plan))}>
        {pending ? "Opening Stripe…" : label}
      </Button>
      <ErrorText error={error} />
    </div>
  );
}

export function ManageBillingButton() {
  const { pending, error, run } = useBillingAction();
  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" disabled={pending} onClick={() => run(openPortalAction)}>
        {pending ? "Opening Stripe…" : "Manage billing"}
      </Button>
      <ErrorText error={error} />
    </div>
  );
}

/** PayPal-branded subscribe / switch button (redirects to PayPal's approval page). */
export function PayPalPlanButton({ plan, label }: { plan: SelfServePlan; label: string }) {
  const { pending, error, run } = useBillingAction();
  return (
    <div className="flex flex-col gap-2">
      <Button
        disabled={pending}
        onClick={() => run(() => choosePayPalPlanAction(plan))}
        className="bg-[#FFC439] text-[#111] shadow-soft hover:bg-[#f2b72c]"
      >
        {pending ? "Opening PayPal…" : label}
      </Button>
      <ErrorText error={error} />
    </div>
  );
}

/** Manage a PayPal subscription: cancel (with confirm) or open PayPal's automatic payments page. */
export function PayPalManage({ manageUrl, cancelled }: { manageUrl: string; cancelled: boolean }) {
  const { pending, error, run } = useBillingAction();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <a href={manageUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
          Manage in PayPal
        </a>
        {!cancelled &&
          (confirming ? (
            <>
              <Button variant="destructive" disabled={pending} onClick={() => run(cancelPayPalAction)}>
                {pending ? "Cancelling…" : "Yes, cancel subscription"}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
                Keep my plan
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Cancel subscription
            </Button>
          ))}
      </div>
      {confirming && !pending && (
        <p className="text-xs text-muted-foreground">Your plan keeps working until the end of the period you&apos;ve paid for.</p>
      )}
      <ErrorText error={error} />
    </div>
  );
}
