"use client";

import { CheckCircle2, CircleAlert, Plug } from "lucide-react";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeShopDomain } from "@/lib/shopify/domain";

import { disconnectShopify } from "./actions";

/**
 * Store address form with a live preview of the address we'll connect.
 * Submits as a plain GET to the install route, which redirects to Shopify.
 */
export function ConnectForm({ defaultDomain, label }: { defaultDomain?: string; label: string }) {
  const [value, setValue] = useState(defaultDomain ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [tried, setTried] = useState(false);
  const hintId = useId();
  const domain = normalizeShopDomain(value);
  const showHint = tried || value.trim().length > 0;

  return (
    <form
      action="/api/shopify/install"
      method="get"
      onSubmit={(e) => {
        if (!domain) {
          e.preventDefault();
          setTried(true);
          return;
        }
        setSubmitting(true);
      }}
      className="flex flex-col gap-2"
    >
      <Label htmlFor="shop">Store address</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="shop"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="your-store.myshopify.com"
          autoComplete="off"
          spellCheck={false}
          required
          aria-invalid={showHint && !domain ? true : undefined}
          aria-describedby={hintId}
          className="h-10 text-base sm:flex-1 md:text-sm"
        />
        {/* Send the normalised address, not the raw input. */}
        <input type="hidden" name="shop" value={domain ?? ""} />
        <Button type="submit" size="lg" className="h-10 px-5" disabled={submitting}>
          <Plug aria-hidden />
          {submitting ? "Opening Shopify…" : label}
        </Button>
      </div>
      <p id={hintId} className="min-h-5 text-sm" aria-live="polite">
        {showHint &&
          (domain ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle2 className="size-4 text-primary" aria-hidden />
              We&apos;ll connect <strong className="text-foreground">{domain}</strong>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-destructive">
              <CircleAlert className="size-4" aria-hidden />
              {value.trim()
                ? "That doesn’t look like a Shopify store address."
                : "Enter your store address first, e.g. your-store.myshopify.com."}
            </span>
          ))}
      </p>
    </form>
  );
}

export function DisconnectButton() {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  if (!confirming) {
    return (
      <Button variant="outline" onClick={() => setConfirming(true)}>
        Disconnect
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Disconnect this store? The agent will stop seeing live orders and products until you connect again.
      </p>
      <div className="flex gap-2">
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await disconnectShopify();
              setFailed(!res.ok);
              if (res.ok) setConfirming(false);
            })
          }
        >
          {pending ? "Disconnecting…" : "Yes, disconnect"}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
      {failed && <p className="text-sm text-destructive">Couldn&apos;t disconnect. Please try again.</p>}
    </div>
  );
}
