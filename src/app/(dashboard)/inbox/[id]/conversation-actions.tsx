"use client";

import { Bot, CheckCircle2, Hand, Pencil, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import {
  rejectDraftAction,
  requestDraftAction,
  resolveAction,
  sendDraftAction,
  sendReplyAction,
  takeoverAction,
} from "../actions";

type Result = { ok: true } | { ok: false; error: string };

/** Runs a server action and keeps its error message (the page refreshes itself on success). */
function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<Result>, onOk?: () => void) =>
    start(async () => {
      const res = await fn();
      setError(res.ok ? null : res.error);
      if (res.ok) onOk?.();
    });
  return { pending, error, run };
}

function confidenceVariant(c: number) {
  if (c >= 0.85) return "default" as const;
  if (c >= 0.6) return "secondary" as const;
  return "destructive" as const;
}

export function DraftCard({
  draft,
  agentName,
}: {
  draft: { id: string; body: string; confidence: number | null; reasoning: string | null };
  agentName: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft.body);
  const { pending, error, run } = useAction();

  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="size-4 text-primary" aria-hidden />
        <span className="text-sm font-medium">{agentName}&apos;s draft</span>
        {draft.confidence !== null && (
          <Badge variant={confidenceVariant(draft.confidence)}>{Math.round(draft.confidence * 100)}% confident</Badge>
        )}
        <span className="text-xs text-muted-foreground">Not sent yet</span>
      </div>

      {editing ? (
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} maxLength={5000} className="bg-background" aria-label="Edit reply" />
      ) : (
        <p className="rounded-lg bg-background px-4 py-3 text-sm whitespace-pre-wrap">{draft.body}</p>
      )}

      {draft.reasoning && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Why {agentName} wrote this</summary>
          <p className="mt-1">{draft.reasoning}</p>
        </details>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button disabled={pending || !text.trim()} onClick={() => run(() => sendDraftAction(draft.id, text))}>
              <Send aria-hidden />
              {pending ? "Sending…" : "Send edited reply"}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => { setEditing(false); setText(draft.body); }}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button disabled={pending} onClick={() => run(() => sendDraftAction(draft.id))}>
              <Send aria-hidden />
              {pending ? "Sending…" : "Send"}
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              Edit &amp; send
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => run(() => rejectDraftAction(draft.id))}>
              <X aria-hidden />
              Reject
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function ReplyComposer({ conversationId }: { conversationId: string }) {
  const [text, setText] = useState("");
  const { pending, error, run } = useAction();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => sendReplyAction(conversationId, text), () => setText(""));
      }}
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        maxLength={5000}
        placeholder="Write a reply yourself…"
        aria-label="Your reply"
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="self-end" disabled={pending || !text.trim()}>
        <Send aria-hidden />
        {pending ? "Sending…" : "Send reply"}
      </Button>
    </form>
  );
}

export function ConversationControls({
  conversationId,
  aiPaused,
  resolved,
  canAskAi,
  agentName,
}: {
  conversationId: string;
  aiPaused: boolean;
  resolved: boolean;
  canAskAi: boolean;
  agentName: string;
}) {
  const { pending, error, run } = useAction();
  const [queued, setQueued] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      {aiPaused ? (
        <Button variant="outline" disabled={pending} onClick={() => run(() => takeoverAction(conversationId, false))}>
          <Bot aria-hidden />
          Hand back to {agentName}
        </Button>
      ) : (
        <Button variant="outline" disabled={pending} onClick={() => run(() => takeoverAction(conversationId, true))}>
          <Hand aria-hidden />
          Take over
        </Button>
      )}
      {canAskAi && !aiPaused && !resolved && (
        <Button
          variant="outline"
          disabled={pending || queued}
          onClick={() => run(() => requestDraftAction(conversationId), () => setQueued(true))}
        >
          <Sparkles aria-hidden />
          {queued ? "Draft requested…" : `Ask ${agentName} for a draft`}
        </Button>
      )}
      {resolved ? (
        <Button variant="ghost" disabled={pending} onClick={() => run(() => resolveAction(conversationId, false))}>
          <RotateCcw aria-hidden />
          Reopen
        </Button>
      ) : (
        <Button variant="ghost" disabled={pending} onClick={() => run(() => resolveAction(conversationId, true))}>
          <CheckCircle2 aria-hidden />
          Mark resolved
        </Button>
      )}
      {queued && <p className="text-xs text-muted-foreground">Refresh in a few seconds to see the draft.</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
