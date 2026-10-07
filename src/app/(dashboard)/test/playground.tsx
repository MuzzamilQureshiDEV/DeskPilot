"use client";

import { AlertTriangle, Check, RotateCcw, Sparkles, Star, X } from "lucide-react";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SANDBOX_CUSTOMERS } from "@/lib/sandbox/data";
import type { ExplainStep } from "@/lib/sandbox/explain";
import { SANDBOX_FREE_TEXT_DAILY_LIMIT, SCENARIOS, SCENARIO_IDS, sandboxCustomer, type ScenarioId } from "@/lib/sandbox/scenarios";
import { cn } from "@/lib/utils";

import { runSandboxTest } from "./actions";
import { ApprovalCard } from "./approval-card";
import { MAX_HISTORY_TURNS, MAX_MESSAGE_LENGTH, type LiveOutcome, type SandboxRunResult } from "./schema";

type Turn = { role: "customer"; body: string } | { role: "ai"; result: SandboxRunResult };
type Thread = { kind: "scenario"; scenario: ScenarioId } | { kind: "free_text"; customerEmail: string };

/** The request we recommend trying first (shows the approval flow). */
const FEATURED: ScenarioId = "cancel_order";

const STATUS: Record<LiveOutcome, { label: string; className: string }> = {
  sent: { label: "Sent", className: "bg-success/15 text-success" },
  draft: { label: "Draft ready", className: "bg-primary/10 text-primary" },
  awaiting_approval: { label: "Needs approval", className: "bg-warning/15 text-[color-mix(in_oklch,var(--warning),var(--foreground)_45%)]" },
  escalated: { label: "Escalated", className: "bg-destructive/10 text-destructive" },
  human: { label: "Your team", className: "bg-muted text-muted-foreground" },
};

const PENDING_STEPS = ["Reading the message", "Looking up the order and customer", "Checking store policy", "Writing a reply"];

export function Playground({ agentName, aiReady, initialRemaining }: { agentName: string; aiReady: boolean; initialRemaining: number }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [error, setError] = useState<string | null>(null);
  const [writeAs, setWriteAs] = useState(SANDBOX_CUSTOMERS[0]?.email ?? "");
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const selectId = useId();
  const messageId = useId();

  const freeTextOpen = thread?.kind === "free_text" && thread.customerEmail === writeAs;
  const historyFull = freeTextOpen && turns.length >= MAX_HISTORY_TURNS;
  const customerEmail = thread ? (thread.kind === "scenario" ? SCENARIOS[thread.scenario].customerEmail : thread.customerEmail) : null;
  const customer = customerEmail ? sandboxCustomer(customerEmail) : null;
  const latest = [...turns].reverse().find((t): t is Extract<Turn, { role: "ai" }> => t.role === "ai")?.result ?? null;

  function run(next: Thread, message: string, previous: Turn[]) {
    setError(null);
    setThread(next);
    setTurns([...previous, { role: "customer", body: message }]);
    startTransition(async () => {
      const res = await runSandboxTest(
        next.kind === "scenario"
          ? { kind: "scenario", scenario: next.scenario }
          : {
              kind: "free_text",
              customerEmail: next.customerEmail,
              message,
              history: previous.map((t) => (t.role === "customer" ? { role: "customer", body: t.body } : { role: "ai", body: t.result.reply })),
            },
      );
      if (!res.ok) {
        setError(res.message);
        setTurns(previous);
        if (previous.length === 0) setThread(null);
        if (res.code === "limit") setRemaining(0);
        return;
      }
      setTurns((t) => [...t, { role: "ai", result: res.result }]);
      if (res.result.freeTextRemaining !== null) setRemaining(res.result.freeTextRemaining);
    });
  }

  function sendFreeText() {
    const message = draft.trim();
    if (!message) return;
    run({ kind: "free_text", customerEmail: writeAs }, message, freeTextOpen ? turns : []);
    setDraft("");
  }

  const disabled = !aiReady || pending;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Pick a request */}
      <section className="flex flex-col gap-2" aria-labelledby="pick-heading">
        <h2 id="pick-heading" className="text-sm font-medium text-muted-foreground">
          Pick a support request
        </h2>
        <div className="flex flex-wrap gap-2">
          {SCENARIO_IDS.map((id) => {
            const active = thread?.kind === "scenario" && thread.scenario === id;
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => run({ kind: "scenario", scenario: id }, SCENARIOS[id].message, [])}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl border bg-card px-4 py-2 text-sm font-medium shadow-soft transition-colors hover:border-primary/40 disabled:opacity-60",
                  active && "border-primary bg-accent text-accent-foreground",
                )}
              >
                {SCENARIOS[id].label}
                {id === FEATURED && <Star className="size-3.5 fill-current text-primary" aria-label="Recommended" />}
              </button>
            );
          })}
          {turns.length > 0 && (
            <Button variant="ghost" size="sm" className="ml-auto self-center" onClick={() => (setThread(null), setTurns([]), setError(null))} disabled={pending}>
              <RotateCcw aria-hidden />
              Start over
            </Button>
          )}
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* 2. Conversation + what the agent did */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <div className="flex min-h-72 flex-col gap-4 rounded-2xl border bg-card p-5 shadow-soft" aria-live="polite">
            {thread && customer ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{customer.name}</p>
                    <p className="text-xs text-muted-foreground">{customer.email} · sample customer</p>
                  </div>
                  {latest && (
                    <span className={cn("rounded-lg px-2.5 py-1 text-xs font-medium", STATUS[latest.outcome].className)}>
                      {STATUS[latest.outcome].label}
                      {thread.kind === "scenario" ? ` · #SBX-${thread.scenario.split("_")[0]}` : ""}
                    </span>
                  )}
                </div>

                {turns.map((turn, i) =>
                  turn.role === "customer" ? (
                    <div key={i} className="flex flex-col items-start gap-1">
                      <span className="text-[11px] font-medium text-muted-foreground">Customer</span>
                      <p className="max-w-[85%] rounded-2xl rounded-tl-md bg-muted px-4 py-2.5 text-sm whitespace-pre-wrap">{turn.body}</p>
                    </div>
                  ) : (
                    <div key={i} className="flex flex-col items-end gap-1">
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {agentName} · {turn.result.outcome === "sent" ? "would send automatically" : "draft (not sent)"} ·{" "}
                        {Math.round(turn.result.confidence * 100)}% confident
                      </span>
                      <p className="max-w-[92%] rounded-2xl rounded-tr-md border border-dashed border-primary/40 bg-accent/40 px-4 py-3 text-sm whitespace-pre-wrap">
                        {turn.result.reply}
                      </p>
                    </div>
                  ),
                )}

                {pending && (
                  <div className="flex items-center gap-2 self-end rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground" role="status">
                    <span className="flex gap-1" aria-hidden>
                      {[0, 1, 2].map((d) => (
                        <span key={d} className="size-1.5 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: `${d * 150}ms` }} />
                      ))}
                    </span>
                    {agentName} is checking the store…
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-primary">
                  <Sparkles className="size-6" aria-hidden />
                </span>
                <p className="font-medium">Pick a request to watch {agentName} work</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {agentName} reads the message, looks up the sample order, checks the policy and drafts a reply. Nothing is sent
                  to anyone.
                </p>
              </div>
            )}
          </div>

          {latest?.proposals.map((p) => <ApprovalCard key={`${p.type}-${p.orderNumber}`} proposal={p} />)}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border bg-card p-5 shadow-soft">
            <h3 className="mb-3 font-semibold">What {agentName} did</h3>
            {pending ? (
              <ol className="flex flex-col gap-3">
                {PENDING_STEPS.map((label, i) => (
                  <li key={label} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <span className="size-4 animate-pulse rounded-full bg-muted" style={{ animationDelay: `${i * 200}ms` }} aria-hidden />
                    {label}…
                  </li>
                ))}
              </ol>
            ) : latest ? (
              <ol className="flex flex-col gap-3">
                {latest.steps.map((s, i) => (
                  <StepRow key={i} step={s} />
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">Each step {agentName} takes appears here: what it looked up, which policy it checked, and why.</p>
            )}
          </div>

          {latest && (latest.data.orders.length > 0 || latest.data.products.length > 0 || latest.data.policies.length > 0) && (
            <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-soft">
              <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Sample data {agentName} used</h3>
              {latest.data.orders.map((o) => (
                <div key={o.number} className="text-sm">
                  <p>
                    <span className="font-semibold">Order {o.number}</span> · {o.customer} · {o.total}
                  </p>
                  <p className="text-muted-foreground">{o.status}</p>
                  {o.items.map((it) => (
                    <p key={it} className="text-muted-foreground">
                      {it}
                    </p>
                  ))}
                </div>
              ))}
              {latest.data.products.map((p) => (
                <div key={p.title} className="text-sm">
                  <p>
                    <span className="font-semibold">{p.title}</span> · {p.price}
                  </p>
                  <p className="text-muted-foreground">{p.stock}</p>
                </div>
              ))}
              {latest.data.policies.map((p) => (
                <div key={p.title} className="text-sm">
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-muted-foreground italic">&ldquo;{p.content}&rdquo;</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. Ask your own question */}
      <section className="rounded-2xl border bg-card p-5 shadow-soft" aria-labelledby="ask-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ask-heading" className="font-semibold">
            Ask {agentName} your own question
          </h2>
          <span className="text-xs text-muted-foreground">
            {remaining} of {SANDBOX_FREE_TEXT_DAILY_LIMIT} free runs left today
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Type any customer message. {agentName} answers from the sample store only (live AI, limited free runs).
        </p>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            sendFreeText();
          }}
        >
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor={selectId} className="text-muted-foreground">
              Write as
            </label>
            <select
              id={selectId}
              value={writeAs}
              onChange={(e) => setWriteAs(e.target.value)}
              disabled={pending}
              className="h-8 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            >
              {SANDBOX_CUSTOMERS.map((c) => (
                <option key={c.email} value={c.email}>
                  {c.name} ({c.email})
                </option>
              ))}
            </select>
          </div>
          <label htmlFor={messageId} className="sr-only">
            Customer message
          </label>
          <Textarea
            id={messageId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={3}
            placeholder={freeTextOpen ? "Reply as the customer…" : "e.g. Do you ship free over $75?"}
            disabled={disabled || remaining === 0}
            className="bg-background"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={disabled || remaining === 0 || !draft.trim() || historyFull}>
              <Sparkles aria-hidden />
              {freeTextOpen ? "Send reply" : `Ask ${agentName}`}
            </Button>
            {historyFull && <p className="text-xs text-muted-foreground">This test conversation is full. Start over to try another.</p>}
          </div>
        </form>
      </section>
    </div>
  );
}

function StepRow({ step }: { step: ExplainStep }) {
  const Icon = step.status === "done" ? Check : step.status === "attention" ? AlertTriangle : X;
  return (
    <li className="flex gap-2.5">
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          step.status === "done" ? "text-success" : step.status === "attention" ? "text-warning" : "text-destructive",
        )}
        aria-label={step.status === "done" ? "Done" : step.status === "attention" ? "Needs attention" : "Failed"}
      />
      <span className="flex flex-col">
        <span className="text-sm font-medium">{step.label}</span>
        <span className="text-xs text-muted-foreground">{step.detail}</span>
      </span>
    </li>
  );
}
