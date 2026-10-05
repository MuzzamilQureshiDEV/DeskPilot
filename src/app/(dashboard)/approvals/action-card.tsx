"use client";

import { Ban, CheckCircle2, Clock, Loader2, MapPin, ReceiptText, XCircle } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActionSummary } from "@/lib/inbox/action-summary";
import { cn } from "@/lib/utils";

import { approveAction, rejectAction } from "./actions";

export type ActionCardData = {
  id: string;
  status: string;
  summary: ActionSummary;
  /** What approving will do, in plain words. */
  consequence: string;
  /** Outcome text for executed/failed actions. */
  outcome: string | null;
  decidedAt: string | null;
  conversation?: { id: string; label: string };
};

const ICON = { refund: ReceiptText, cancel: Ban, address_change: MapPin } as const;

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Needs your approval", variant: "default" },
  approved: { label: "Approved, queued", variant: "secondary" },
  executing: { label: "Running in Shopify", variant: "secondary" },
  executed: { label: "Done", variant: "outline" },
  rejected: { label: "Rejected", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
};

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export function ActionCard({ action, compact = false }: { action: ActionCardData; compact?: boolean }) {
  const { summary } = action;
  const Icon = ICON[summary.type];
  const status = STATUS[action.status] ?? { label: action.status, variant: "outline" as const };
  const [confirming, setConfirming] = useState(false);
  const [notify, setNotify] = useState(true);
  const [restock, setRestock] = useState(summary.type === "cancel");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const approve = () =>
    start(async () => {
      const res = await approveAction({ id: action.id, notifyCustomer: notify, restock });
      setConfirming(false);
      setMessage(
        !res.ok
          ? { tone: "error", text: res.error }
          : res.queued
            ? { tone: "info", text: "Approved. Running in Shopify now." }
            : { tone: "info", text: "Approved. It will run as soon as background processing is available." },
      );
    });
  const reject = () =>
    start(async () => {
      const res = await rejectAction(action.id);
      setMessage(res.ok ? null : { tone: "error", text: res.error });
    });

  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border p-3 text-sm", action.status === "pending" && "border-primary/40 bg-primary/5")}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium">
            {summary.title} · {summary.orderNumber}
          </span>
          {!compact && action.conversation && (
            <Link href={`/inbox/${action.conversation.id}`} className="truncate text-xs text-muted-foreground hover:text-primary">
              {action.conversation.label}
            </Link>
          )}
        </div>
        <Badge variant={status.variant} className="shrink-0">
          {action.status === "executing" && <Loader2 className="animate-spin" aria-hidden />}
          {status.label}
        </Badge>
      </div>

      <ul className="flex flex-col gap-0.5 pl-6 text-xs text-muted-foreground">
        {summary.details.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>

      {action.outcome && (
        <p className={cn("flex items-start gap-1.5 pl-6 text-xs", action.status === "failed" ? "text-destructive" : "text-foreground")}>
          {action.status === "failed" ? <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />}
          {action.outcome}
        </p>
      )}
      {action.decidedAt && action.status !== "pending" && (
        <p className="flex items-center gap-1 pl-6 text-xs text-muted-foreground">
          <Clock className="size-3" aria-hidden />
          Decided {dateFormat.format(new Date(action.decidedAt))}
        </p>
      )}

      {action.status === "pending" && !confirming && (
        <div className="flex flex-wrap gap-2 pl-6">
          <Button size="sm" disabled={pending} onClick={() => setConfirming(true)}>
            Approve
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={reject}>
            Reject
          </Button>
        </div>
      )}

      {action.status === "pending" && confirming && (
        <div className="ml-6 flex flex-col gap-2 rounded-lg border bg-background p-3">
          <p className="font-medium">{action.consequence}</p>
          <p className="text-xs text-muted-foreground">This happens in your Shopify store and can&apos;t be undone from DeskPilot.</p>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-primary" />
            Email the customer from Shopify
          </label>
          {summary.type !== "address_change" && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="accent-primary" />
              Put the items back in stock
            </label>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={approve}>
              {pending ? "Approving…" : "Yes, approve"}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={cn("pl-6 text-xs", message.tone === "error" ? "text-destructive" : "text-primary")}>
          {message.text}
        </p>
      )}
    </div>
  );
}
