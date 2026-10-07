"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { SandboxProposal } from "./schema";

/** Sandbox version of the approval card. Deciding only changes local state. */
export function ApprovalCard({ proposal }: { proposal: SandboxProposal }) {
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-warning/60 bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <AlertTriangle className="size-4 text-warning" aria-hidden />
          Action requires your approval
        </p>
        <span className="rounded-lg bg-warning/15 px-2.5 py-1 text-xs font-medium text-[color-mix(in_oklch,var(--warning),var(--foreground)_45%)]">
          Sandbox action · sample store
        </span>
      </div>
      <p className="font-semibold">
        {proposal.title} · order {proposal.orderNumber}
      </p>
      <ul className="text-sm text-muted-foreground">
        {proposal.details.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        In production this waits for you before anything happens in Shopify. Here, approving only updates the sample store.
      </p>

      {decision === null ? (
        <div className="flex gap-2">
          <Button onClick={() => setDecision("approved")} className="bg-success text-white hover:bg-success/90">
            Approve
          </Button>
          <Button variant="outline" onClick={() => setDecision("rejected")}>
            Reject
          </Button>
        </div>
      ) : (
        <p role="status" className="flex items-center gap-1.5 text-sm">
          {decision === "approved" ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <XCircle className="size-4 text-muted-foreground" aria-hidden />}
          {decision === "approved" ? "Approved" : "Rejected"}. In a live store this would {decision === "approved" ? "run in Shopify" : "be dismissed"}. Nothing
          was sent here.
        </p>
      )}
    </div>
  );
}
