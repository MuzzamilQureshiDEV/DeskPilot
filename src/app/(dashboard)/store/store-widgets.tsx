"use client";

import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { connectOwnShopifyApp, saveStoreName, testShopifyConnection, type ConnectionTest } from "./actions";

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

const GUIDE = [
  <>
    Open{" "}
    <a href="https://dev.shopify.com" target="_blank" rel="noopener noreferrer">
      dev.shopify.com
    </a>{" "}
    and log in with the Shopify account that owns your store. Click <b>Create app</b>, choose to start from the Dev Dashboard and name it
    &ldquo;AstaDesk&rdquo;.
  </>,
  <>
    Under <b>Versions</b> (Access → Admin API), tick these permissions and click <b>Release</b>:{" "}
    <code>read_orders, write_orders, read_products, read_customers, read_fulfillments, read_merchant_managed_fulfillment_orders</code>.
  </>,
  <>
    Open <b>API access → Protected customer data access</b> and request it with the reason &ldquo;Customer service&rdquo;. Tick Name,
    Email, Phone and Address too. For your own store this is approved straight away.
  </>,
  <>
    Click <b>Install app</b> and choose your store.
  </>,
  <>
    Open <b>Settings</b>, copy the <b>Client ID</b> and <b>Client secret</b>, and paste them below with your store address.
  </>,
];

/** Connect through the store's own private Shopify app, with the setup guide. */
export function OwnAppConnectForm({ defaultDomain, label = "Connect store" }: { defaultDomain?: string; label?: string }) {
  const [domain, setDomain] = useState(defaultDomain ?? "");
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ids = { domain: useId(), id: useId(), secret: useId() };

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-col gap-3">
        {GUIDE.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm text-muted-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-2 hover:[&_a]:underline [&_b]:font-medium [&_b]:text-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-xs [&_code]:break-words">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

      <form
        className="flex flex-col gap-4 rounded-2xl border bg-muted/30 p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const res = await connectOwnShopifyApp({ domain, clientId, clientSecret: secret });
            if (res.ok) {
              toast.success(`Connected to ${res.storeName}`);
              setSecret("");
            } else setError(res.error);
          });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.domain}>Store address</Label>
          <Input id={ids.domain} value={domain} placeholder="your-store.myshopify.com" autoComplete="off" spellCheck={false} onChange={(e) => setDomain(e.target.value)} required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.id}>Client ID</Label>
            <Input id={ids.id} value={clientId} autoComplete="off" spellCheck={false} className="font-mono" onChange={(e) => setClientId(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.secret}>Client secret</Label>
            <Input id={ids.secret} type="password" value={secret} autoComplete="off" className="font-mono" onChange={(e) => setSecret(e.target.value)} required />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || !domain.trim() || !clientId.trim() || !secret.trim()}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <PlugZap aria-hidden />}
            {pending ? "Checking with Shopify…" : label}
          </Button>
          <p className="text-xs text-muted-foreground">Your secret is encrypted and never shown again. We check it with Shopify before saving.</p>
        </div>
      </form>
    </div>
  );
}
