"use client";

import { Dialog } from "@base-ui/react/dialog";
import { CheckCircle2, LifeBuoy, Loader2, Send, X } from "lucide-react";
import { useId, useState, useTransition } from "react";

import { sendSupportRequest } from "@/app/(dashboard)/support-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Header help button: a small form that emails the AstaDesk team. */
export function SupportButton({ defaultName, defaultEmail }: { defaultName: string; defaultEmail: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [concern, setConcern] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const ids = { name: useId(), email: useId(), concern: useId() };

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next && sent) {
      // Start fresh next time.
      setSent(false);
      setConcern("");
      setError(null);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger
        render={<Button variant="ghost" size="sm" aria-label="Contact support" title="Contact support" className="rounded-full max-sm:size-8 max-sm:px-0" />}
      >
        <LifeBuoy aria-hidden />
        <span className="hidden sm:inline">Help</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-2xl border bg-popover p-6 text-popover-foreground shadow-lift transition duration-200 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <LifeBuoy className="size-5" aria-hidden />
              </span>
              <div>
                <Dialog.Title className="text-base font-semibold">Contact support</Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">We usually reply within one business day.</Dialog.Description>
              </div>
            </div>
            <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="Close" className="-mt-1 -mr-2 rounded-full" />}>
              <X aria-hidden />
            </Dialog.Close>
          </div>

          {sent ? (
            <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-success/12 text-success">
                <CheckCircle2 className="size-6" aria-hidden />
              </span>
              <p className="text-base font-semibold">Thanks, we&apos;ve got your message</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Our team will email you at <span className="font-medium text-foreground">{email}</span> about your concern.
              </p>
              <Dialog.Close render={<Button className="mt-2" />}>Done</Dialog.Close>
            </div>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                startTransition(async () => {
                  const res = await sendSupportRequest({ name, email, concern });
                  if (res.ok) setSent(true);
                  else setError(res.error);
                });
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={ids.name}>Name</Label>
                  <Input id={ids.name} value={name} maxLength={80} autoComplete="name" required onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={ids.email}>Email</Label>
                  <Input id={ids.email} type="email" value={email} maxLength={200} autoComplete="email" required onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.concern}>How can we help?</Label>
                <Textarea
                  id={ids.concern}
                  value={concern}
                  rows={5}
                  maxLength={4000}
                  required
                  placeholder="Describe your question or problem. The page you were on and the steps you took help us answer faster."
                  onChange={(e) => setConcern(e.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={pending || !name.trim() || !email.trim() || concern.trim().length < 10} className="self-end">
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
                {pending ? "Sending…" : "Send"}
              </Button>
            </form>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
