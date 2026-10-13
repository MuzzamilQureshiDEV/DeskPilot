"use client";

import { Check, CheckCircle2, Hand, PackageSearch, ShieldCheck, Sparkles, X } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

// Landing-page demo: pre-written examples of what Ava does (no AI call).
// Mirrors real behaviour: routine answers can go out on Autopilot, money
// actions wait for approval, unknowns are handed to the team.

type Outcome = "auto" | "approval" | "handoff";

type Scenario = {
  id: string;
  label: string;
  hint: string;
  message: string;
  customer: string;
  checks: string[];
  outcome: Outcome;
  reply: string;
  action?: { kind: string; text: string; done: string };
};

const SCENARIOS: Scenario[] = [
  {
    id: "order",
    label: "Where's my order?",
    hint: "Looks up the live order and tracking in Shopify.",
    customer: "Sara",
    message: "hi, where's my order #1042? it's been a week",
    checks: ["Order #1042", "Tracking"],
    outcome: "auto",
    reply:
      "Hi Sara! Order #1042 shipped on Monday with UPS and is due to arrive on Thursday. You can follow it here: 1Z999AA10123456784. Let me know if anything looks off!",
  },
  {
    id: "cancel",
    label: "Cancel an order",
    hint: "Checks it hasn't shipped, then asks you to approve.",
    customer: "Maya",
    message: "can you cancel order #1048? i ordered the wrong size",
    checks: ["Order #1048", "Cancellation policy"],
    outcome: "approval",
    reply:
      "Hi Maya, I found order #1048 (Relaxed Linen Shirt, size L). It hasn't shipped yet, so it can be cancelled. I've asked the team to confirm, and you'll hear from me as soon as it's done.",
    action: {
      kind: "Cancel",
      text: "Cancel order #1048 and refund $84.00 to the original payment method.",
      done: "Done in Shopify. Ava has told Maya her order is cancelled.",
    },
  },
  {
    id: "refund",
    label: "Request a refund",
    hint: "Reads your refund policy and drafts the refund for approval.",
    customer: "Leo",
    message: "my mug from order #1052 arrived chipped. can i get a refund?",
    checks: ["Order #1052", "Refund policy"],
    outcome: "approval",
    reply:
      "So sorry about the chipped mug, Leo! Damaged items are fully refundable under our policy. I've sent a $24.00 refund for approval and will confirm the moment it's processed.",
    action: {
      kind: "Refund",
      text: "Refund $24.00 for 1 × Stoneware Mug on order #1052.",
      done: "Refunded in Shopify. Ava has confirmed it to Leo.",
    },
  },
  {
    id: "returns",
    label: "Ask about returns",
    hint: "Answers word for word from the policy you wrote.",
    customer: "Priya",
    message: "can I return something I bought on sale?",
    checks: ["Returns policy"],
    outcome: "auto",
    reply:
      "Hi Priya! Sale items are final sale, so they can't be returned. Full-price items can be returned unworn within 30 days of delivery for a full refund.",
  },
  {
    id: "product",
    label: "Ask about a product",
    hint: "Checks the catalog and stock for the right size.",
    customer: "Tom",
    message: "is the trail jacket in stock in medium?",
    checks: ["Product catalog", "Inventory"],
    outcome: "auto",
    reply: "Good news, Tom: the Trail Jacket is in stock in Medium (6 left) in Olive and Black. It's $129 and ships within 2 business days.",
  },
  {
    id: "unknown",
    label: "Something it doesn't know",
    hint: "Hands it to you instead of making something up.",
    customer: "Ana",
    message: "do you sell gift cards? how long are they valid?",
    checks: ["Product catalog", "Store policies"],
    outcome: "handoff",
    reply: "Thanks for asking, Ana! Let me check the details on gift cards with the team, and we'll get back to you shortly.",
  },
];

const OUTCOME: Record<Outcome, { label: string; className: string; icon: typeof Check }> = {
  auto: { label: "Answered automatically", className: "bg-success/12 text-success", icon: CheckCircle2 },
  approval: { label: "Needs your approval", className: "bg-warning/15 text-[color-mix(in_oklch,var(--warning),var(--foreground)_45%)]", icon: ShieldCheck },
  handoff: { label: "Handed to your team", className: "bg-primary/10 text-primary", icon: Hand },
};

export function AvaDemo() {
  const [active, setActive] = useState(SCENARIOS[1]!.id);
  const [decision, setDecision] = useState<Record<string, "approved" | "rejected">>({});
  const s = SCENARIOS.find((x) => x.id === active) ?? SCENARIOS[0]!;
  const o = OUTCOME[s.outcome];
  const decided = decision[s.id];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="flex flex-col gap-2.5" role="group" aria-label="Pick a customer question">
        {SCENARIOS.map((x) => {
          const on = x.id === active;
          return (
            <button
              key={x.id}
              type="button"
              aria-pressed={on}
              onClick={() => setActive(x.id)}
              className={cn(
                "flex flex-col gap-0.5 rounded-2xl border bg-card px-5 py-4 text-left transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                on ? "border-primary/60 shadow-soft ring-4 ring-primary/10" : "hover:border-primary/30 hover:bg-accent/40",
              )}
            >
              <span className="font-medium">{x.label}</span>
              <span className="text-sm text-muted-foreground">{x.hint}</span>
            </button>
          );
        })}
      </div>

      <div key={s.id} className="flex animate-in flex-col self-start gap-4 rounded-3xl border bg-card p-5 shadow-lift duration-300 fade-in slide-in-from-bottom-2 sm:p-7">
        <p className="text-lg font-medium text-balance">&ldquo;{s.message}&rdquo;</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Ava checks</span>
          {s.checks.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs">
              <PackageSearch className="size-3 text-primary" aria-hidden />
              {c}
            </span>
          ))}
        </div>
        <span className={cn("inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-medium", o.className)}>
          <o.icon className="size-3.5" aria-hidden />
          {o.label}
        </span>

        <div className="rounded-2xl bg-muted/60 p-4 sm:p-5">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <Sparkles className="size-3.5 text-primary" aria-hidden /> Ava&apos;s reply
          </p>
          <p className="text-sm leading-relaxed">{s.reply}</p>
        </div>

        {s.action && (
          <div className="flex flex-col gap-3 rounded-2xl border p-4 sm:p-5">
            <span className="self-start rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">{s.action.kind}</span>
            <p className="font-medium">{s.action.text}</p>
            {decided === "approved" ? (
              <p role="status" className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="size-4" aria-hidden /> {s.action.done}
              </p>
            ) : decided === "rejected" ? (
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <X className="size-4" aria-hidden /> Rejected. Nothing changes in Shopify.
              </p>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDecision((d) => ({ ...d, [s.id]: "approved" }))}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:brightness-110"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => setDecision((d) => ({ ...d, [s.id]: "rejected" }))}
                  className="rounded-lg border px-4 py-2 text-sm font-medium transition hover:bg-muted"
                >
                  Reject
                </button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Try it. This is a preview: nothing here touches a real store.</p>
          </div>
        )}
      </div>
    </div>
  );
}
