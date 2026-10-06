"use client";

import { CheckCircle2, Hand } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";

import { resolveAction, takeoverAction } from "../inbox/actions";

export function EscalationActions({ conversationId }: { conversationId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => ReturnType<typeof resolveAction>) =>
    start(async () => {
      const res = await fn();
      setError(res.ok ? null : res.error);
    });

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <Link href={`/inbox/${conversationId}`} className={buttonVariants({ size: "sm" })}>
          Open conversation
        </Link>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => takeoverAction(conversationId, true))}>
          <Hand aria-hidden />
          Take over
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => resolveAction(conversationId, true))}>
          <CheckCircle2 aria-hidden />
          Mark resolved
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
