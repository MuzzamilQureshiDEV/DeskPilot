"use client";

import { Ban, CheckCircle2, MapPin, ReceiptText, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { SandboxProposal } from "./schema";

const ICONS = { refund: ReceiptText, cancel: Ban, address_change: MapPin } as const;

/** Sandbox version of the approval card. Deciding only changes local state. */
export function ApprovalCard({ proposal }: { proposal: SandboxProposal }) {
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const Icon = ICONS[proposal.type];

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            <ShieldCheck className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
            Needs your approval
          </p>
          <p className="font-medium">
            {proposal.title} · Order {proposal.orderNumber}
          </p>
          <ul className="text-sm text-muted-foreground">
            {proposal.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {decision === null ? (
          <>
            <Button size="sm" onClick={() => setDecision("approved")}>
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDecision("rejected")}>
              Reject
            </Button>
            <span className="text-xs text-muted-foreground">Sample store: nothing is sent to Shopify.</span>
          </>
        ) : (
          <p role="status" className="flex items-center gap-1.5 text-sm">
            {decision === "approved" ? (
              <CheckCircle2 className="size-4 text-primary" aria-hidden />
            ) : (
              <XCircle className="size-4 text-muted-foreground" aria-hidden />
            )}
            {decision === "approved" ? "Approved" : "Rejected"}. In a live store this would{" "}
            {decision === "approved" ? "run in Shopify" : "be dismissed"}. Here nothing was sent.
          </p>
        )}
      </div>
    </div>
  );
}
