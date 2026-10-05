"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { SelfServePlan } from "@/lib/billing/plans";

import { choosePlanAction, openPortalAction, type BillingResult } from "./actions";

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
