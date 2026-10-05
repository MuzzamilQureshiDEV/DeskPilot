"use client";

import { Check, Copy, Send } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { sendTestEmail } from "./email-actions";

export function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <code className="flex-1 truncate rounded-lg border bg-muted px-3 py-2 text-sm">{address}</code>
      <Button
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard blocked: the address is still selectable.
          }
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function TestEmailButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" className="self-start" disabled={pending} onClick={() => start(async () => setResult(await sendTestEmail()))}>
        <Send aria-hidden />
        {pending ? "Sending…" : "Send me a test email"}
      </Button>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-sm text-primary" : "text-sm text-destructive"}>
          {result.message}
        </p>
      )}
    </div>
  );
}
