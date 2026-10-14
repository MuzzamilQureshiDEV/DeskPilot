"use client";

import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveStoreName, testShopifyConnection, type ConnectionTest } from "./actions";

/** Runs the read-only Shopify checks and lists each result in plain words. */
export function TestConnectionButton() {
  const [result, setResult] = useState<ConnectionTest | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await testShopifyConnection()))}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <PlugZap aria-hidden />}
        {pending ? "Testing…" : "Test Shopify connection"}
      </Button>
      <div aria-live="polite">
        {result && !result.ok && <p className="text-sm text-destructive">{result.error}</p>}
        {result?.ok && (
          <ul className="flex flex-col divide-y rounded-xl border">
            {result.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                {c.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Passed" />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Failed" />
                )}
                <div>
                  <p className="font-medium">{c.label}</p>
                  <p className="text-muted-foreground">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** The store's display name. Ava's own name is fixed. */
export function StoreNameForm({ initial, agentName }: { initial: string; agentName: string }) {
  const [name, setName] = useState(initial);
  const [pending, startTransition] = useTransition();
  const nameId = useId();
  const agentId = useId();
  const changed = name.trim() !== initial.trim();

  return (
    <form
      className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await saveStoreName(name);
          if (res.ok) toast.success("Store name saved");
          else toast.error(res.error);
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId}>Store display name</Label>
        <Input id={nameId} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={agentId}>AI agent name</Label>
        <Input id={agentId} value={agentName} disabled readOnly />
      </div>
      <Button type="submit" disabled={pending || !changed || !name.trim()}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <p className="text-xs text-muted-foreground sm:col-span-3">
        Customers see the store name in {agentName}&apos;s replies and the chat. {agentName} is the name of your AI agent and stays the same.
      </p>
    </form>
  );
}
