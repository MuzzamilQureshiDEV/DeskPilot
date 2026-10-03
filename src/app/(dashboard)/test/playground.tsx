"use client";

import { Bot, Loader2, RotateCcw, Send, Wrench } from "lucide-react";
import { useId, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SANDBOX_CUSTOMERS } from "@/lib/sandbox/data";
import {
  SANDBOX_FREE_TEXT_DAILY_LIMIT,
  SCENARIOS,
  SCENARIO_IDS,
  sandboxCustomer,
  type ScenarioId,
} from "@/lib/sandbox/scenarios";

import { runSandboxTest } from "./actions";
import { ApprovalCard } from "./approval-card";
import { MAX_HISTORY_TURNS, MAX_MESSAGE_LENGTH, type LiveOutcome, type SandboxRunResult } from "./schema";

type Turn =
  | { role: "customer"; body: string; name: string }
  | { role: "ai"; result: SandboxRunResult };

type Thread = { kind: "scenario"; scenario: ScenarioId } | { kind: "free_text"; customerEmail: string };

const OUTCOME_TEXT: Record<LiveOutcome, string> = {
  sent: "Sent to the customer automatically",
  draft: "Saved as a draft for you to review and send",
  awaiting_approval: "Waiting for your approval before anything happens",
  escalated: "Escalated to your team",
  human: "Handed to your team (automation is off for this topic)",
};

const TOOL_NAMES: Record<string, string> = {
  lookup_order: "Looked up order",
  get_tracking: "Checked tracking",
  search_products: "Searched products",
  get_policy: "Checked policy",
  propose_refund: "Proposed refund",
  propose_cancellation: "Proposed cancellation",
  propose_address_change: "Proposed address change",
  respond: "Wrote reply",
};

function confidenceVariant(c: number) {
  if (c >= 0.85) return "default" as const;
  if (c >= 0.6) return "secondary" as const;
  return "destructive" as const;
}

export function Playground({
  agentName,
  aiReady,
  initialRemaining,
}: {
  agentName: string;
  aiReady: boolean;
  initialRemaining: number;
}) {
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

  function run(next: Thread, message: string, previous: Turn[]) {
    const customer = sandboxCustomer(next.kind === "scenario" ? SCENARIOS[next.scenario].customerEmail : next.customerEmail);
    setError(null);
    setThread(next);
    setTurns([...previous, { role: "customer", body: message, name: customer?.name ?? "Customer" }]);

    startTransition(async () => {
      const res = await runSandboxTest(
        next.kind === "scenario"
          ? { kind: "scenario", scenario: next.scenario }
          : {
              kind: "free_text",
              customerEmail: next.customerEmail,
              message,
              history: previous.map((t) =>
                t.role === "customer" ? { role: "customer", body: t.body } : { role: "ai", body: t.result.reply },
              ),
            },
      );
      if (!res.ok) {
        setError(res.message);
        // Drop the unanswered customer turn so it can be retried.
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

  function reset() {
    setThread(null);
    setTurns([]);
    setError(null);
  }

  const disabled = !aiReady || pending;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Try a scenario</CardTitle>
            <CardDescription>Common requests from the sample store&apos;s customers.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {SCENARIO_IDS.map((id) => (
              <Button
                key={id}
                variant={thread?.kind === "scenario" && thread.scenario === id ? "secondary" : "outline"}
                className="h-auto justify-start py-2 text-left whitespace-normal"
                disabled={disabled}
                onClick={() => run({ kind: "scenario", scenario: id }, SCENARIOS[id].message, [])}
              >
                {SCENARIOS[id].label}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Write your own</CardTitle>
            <CardDescription>
              {remaining} of {SANDBOX_FREE_TEXT_DAILY_LIMIT} messages left today.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                sendFreeText();
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor={selectId}>Write as</Label>
                <select
                  id={selectId}
                  value={writeAs}
                  onChange={(e) => setWriteAs(e.target.value)}
                  disabled={pending}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                >
                  {SANDBOX_CUSTOMERS.map((c) => (
                    <option key={c.email} value={c.email}>
                      {c.name} ({c.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={messageId}>{freeTextOpen ? "Reply as the customer" : "Customer message"}</Label>
                <Textarea
                  id={messageId}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={MAX_MESSAGE_LENGTH}
                  rows={4}
                  placeholder="e.g. Hi, can I change the address on order #1002?"
                  disabled={disabled || remaining === 0}
                />
              </div>
              <Button type="submit" disabled={disabled || remaining === 0 || !draft.trim() || historyFull}>
                <Send aria-hidden />
                {freeTextOpen ? "Send reply" : "Send"}
              </Button>
              {historyFull && (
                <p className="text-xs text-muted-foreground">This test conversation is full. Start over to try another.</p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="min-h-96">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>Conversation</CardTitle>
            <CardDescription>
              {thread?.kind === "scenario" ? `Expected: ${SCENARIOS[thread.scenario].expect}` : `See how ${agentName} replies.`}
            </CardDescription>
          </div>
          {turns.length > 0 && (
            <Button variant="ghost" size="sm" onClick={reset} disabled={pending}>
              <RotateCcw aria-hidden />
              Start over
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4" aria-live="polite">
          {turns.length === 0 && !error && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Pick a scenario or write a message to see {agentName} at work.
            </p>
          )}

          {turns.map((turn, i) =>
            turn.role === "customer" ? (
              <div key={i} className="flex flex-col items-end gap-1">
                <span className="text-xs text-muted-foreground">{turn.name}</span>
                <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-muted px-4 py-2 text-sm whitespace-pre-wrap">
                  {turn.body}
                </p>
              </div>
            ) : (
              <AgentTurn key={i} agentName={agentName} result={turn.result} />
            ),
          )}

          {pending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {agentName} is looking into it…
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AgentTurn({ agentName, result }: { agentName: string; result: SandboxRunResult }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Bot className="size-3.5" aria-hidden />
        {agentName}
      </span>
      <p className="max-w-[85%] rounded-2xl rounded-tl-sm border bg-background px-4 py-2 text-sm whitespace-pre-wrap">
        {result.reply}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant={confidenceVariant(result.confidence)}>{Math.round(result.confidence * 100)}% confident</Badge>
        <Badge variant="outline">{result.category.replace("_", " ")}</Badge>
        <Badge variant="outline">{result.sentiment}</Badge>
        {result.tags.map((t) => (
          <Badge key={t} variant="secondary">
            {t}
          </Badge>
        ))}
        {result.escalate && <Badge variant="destructive">Escalated</Badge>}
      </div>

      <p className="text-sm">
        <span className="text-muted-foreground">In a live conversation: </span>
        {OUTCOME_TEXT[result.outcome]}.
      </p>
      {result.escalate && result.escalateReason && (
        <p className="text-sm text-muted-foreground">Why escalated: {result.escalateReason}</p>
      )}
      {result.fallback && (
        <p className="text-sm text-muted-foreground">
          The agent couldn&apos;t finish this one, so it used a safe holding reply.
        </p>
      )}

      {result.proposals.map((p) => (
        <ApprovalCard key={`${p.type}-${p.orderNumber}`} proposal={p} />
      ))}

      <details className="rounded-lg border px-3 py-2 text-sm">
        <summary className="cursor-pointer text-muted-foreground">How {agentName} got there</summary>
        <p className="mt-2">{result.reasoning}</p>
        {result.tools.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {result.tools.map((t, i) => (
              <li key={i}>
                <Badge variant={t.ok ? "outline" : "destructive"}>
                  <Wrench aria-hidden />
                  {TOOL_NAMES[t.name] ?? t.name}
                  {t.ok ? "" : " (failed)"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
