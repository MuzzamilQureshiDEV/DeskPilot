"use client";

import { KeyRound, LogOut, Minus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseSenderList, type EmailFilters } from "@/lib/settings/email-filters";
import { cn } from "@/lib/utils";

import {
  deleteQuickReply,
  saveAccountName,
  saveEmailFilters,
  saveQuickReply,
  saveSignature,
  sendPasswordReset,
  type Result,
} from "./settings-actions";

function useSave() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<Result>, ok: string, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(ok);
        after?.();
      } else toast.error(res.error);
    });
  return { pending, run };
}

/** A small on/off switch. */
export function Toggle({ on, onChange, labelledBy, disabled }: { on: boolean; onChange: (v: boolean) => void; labelledBy: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60",
        on ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-5.5" : "translate-x-0.5")} />
    </button>
  );
}

// ---- Email signature ------------------------------------------------------

export function SignatureForm({ initial, storeName }: { initial: string; storeName: string }) {
  const [sig, setSig] = useState(initial);
  const { pending, run } = useSave();
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Email signature</Label>
      <Textarea id={id} value={sig} rows={3} maxLength={300} placeholder={`Warm regards,\nThe ${storeName} team`} onChange={(e) => setSig(e.target.value)} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Added under every emailed reply (Ava&apos;s and yours). Leave empty for none.</p>
        <Button size="sm" disabled={pending || sig === initial} onClick={() => run(() => saveSignature(sig), "Signature saved")}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ---- Email filters --------------------------------------------------------

function TagInput({ label, hint, values, onChange }: { label: string; hint: string; values: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const id = useId();
  function add() {
    const res = parseSenderList(draft);
    if (!res.ok) return setErr(`"${res.invalid}" isn't a domain or email address.`);
    onChange([...new Set([...values, ...res.list])].slice(0, 100));
    setDraft("");
    setErr(null);
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full border bg-background py-0.5 pr-1 pl-2.5 font-mono text-xs">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="rounded-full p-0.5 hover:bg-muted">
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          placeholder="brand.com, name@shop.com"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          aria-invalid={err ? true : undefined}
        />
        <Button type="button" variant="outline" onClick={add} disabled={!draft.trim()}>
          <Plus aria-hidden /> Add
        </Button>
      </div>
      <p className={cn("text-xs", err ? "text-destructive" : "text-muted-foreground")}>{err ?? hint}</p>
    </div>
  );
}

export function FiltersForm({ initial }: { initial: EmailFilters }) {
  const [f, setF] = useState(initial);
  const { pending, run } = useSave();
  const nlId = useId();
  const capId = useId();
  const changed = JSON.stringify(f) !== JSON.stringify(initial);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 md:grid-cols-2">
        <TagInput
          label="Always block"
          hint="Emails from these never reach Ava. Use a domain (brand.com) or one address."
          values={f.blocked}
          onChange={(blocked) => setF({ ...f, blocked })}
        />
        <TagInput
          label="Always allow"
          hint="Skip the newsletter and notification checks for these, e.g. a supplier that writes from alerts@."
          values={f.allowed}
          onChange={(allowed) => setF({ ...f, allowed })}
        />
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
        <div>
          <p className="text-sm font-medium" id={nlId}>
            Skip newsletters and automatic notifications
          </p>
          <p className="text-xs text-muted-foreground">
            Mailing lists, &ldquo;unsubscribe&rdquo; emails and senders like notifications@ or alerts@ are logged, not answered.
          </p>
        </div>
        <Toggle on={f.skipNewsletters} onChange={(v) => setF({ ...f, skipNewsletters: v })} labelledBy={nlId} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4">
        <div className="max-w-md">
          <p className="text-sm font-medium" id={capId}>
            Automatic email replies per conversation
          </p>
          <p className="text-xs text-muted-foreground">
            Loop protection: after this many automatic replies in a row, Ava saves drafts until a person replies. 0 = never send email
            automatically. Chat isn&apos;t affected.
          </p>
        </div>
        <div className="flex items-center gap-2" role="group" aria-labelledby={capId}>
          <Button type="button" size="icon" variant="outline" aria-label="Fewer" disabled={f.maxAutoReplies <= 0} onClick={() => setF({ ...f, maxAutoReplies: f.maxAutoReplies - 1 })}>
            <Minus aria-hidden />
          </Button>
          <span className="w-8 text-center text-lg font-semibold tabular-nums" aria-live="polite">
            {f.maxAutoReplies}
          </span>
          <Button type="button" size="icon" variant="outline" aria-label="More" disabled={f.maxAutoReplies >= 10} onClick={() => setF({ ...f, maxAutoReplies: f.maxAutoReplies + 1 })}>
            <Plus aria-hidden />
          </Button>
        </div>
      </div>

      <Button className="self-start" disabled={pending || !changed} onClick={() => run(() => saveEmailFilters(f), "Email filters saved")}>
        {pending ? "Saving…" : "Save filters"}
      </Button>
    </div>
  );
}

// ---- Quick replies --------------------------------------------------------

type QuickReply = { id: string; title: string; body: string };

function QuickReplyEditor({ initial, onDone }: { initial?: QuickReply; onDone: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const { pending, run } = useSave();
  const tId = useId();
  const bId = useId();
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={tId}>Title</Label>
        <Input id={tId} value={title} maxLength={80} placeholder="e.g. Return policy" onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={bId}>Reply text</Label>
        <Textarea id={bId} value={body} rows={4} maxLength={2000} placeholder="Unworn items can be returned within 30 days of delivery…" onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || !title.trim() || !body.trim()} onClick={() => run(() => saveQuickReply({ id: initial?.id, title, body }), "Quick reply saved", onDone)}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function QuickRepliesManager({ replies }: { replies: QuickReply[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(replies.length === 0 ? "new" : null);
  const { pending, run } = useSave();
  return (
    <div className="flex flex-col gap-4">
      {editing === "new" ? (
        <QuickReplyEditor onDone={() => setEditing(null)} />
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setEditing("new")}>
          <Plus aria-hidden /> New quick reply
        </Button>
      )}
      {replies.length > 0 && (
        <ul className="flex flex-col gap-3">
          {replies.map((r) =>
            editing === r.id ? (
              <li key={r.id}>
                <QuickReplyEditor initial={r} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={r.id} className="group flex items-start justify-between gap-4 rounded-xl border bg-card p-4">
                <div className="min-w-0">
                  <p className="font-medium">{r.title}</p>
                  <p className="line-clamp-2 text-sm whitespace-pre-line text-muted-foreground">{r.body}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" aria-label={`Edit ${r.title}`} onClick={() => setEditing(r.id)}>
                    <Pencil aria-hidden />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Delete ${r.title}`} disabled={pending} onClick={() => run(() => deleteQuickReply(r.id), "Quick reply deleted")}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

// ---- Account --------------------------------------------------------------

export function AccountForm({ name, email }: { name: string; email: string }) {
  const [value, setValue] = useState(name);
  const save = useSave();
  const reset = useSave();
  const [signingOut, startSignOut] = useTransition();
  const nId = useId();
  const eId = useId();
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nId}>Your name</Label>
          <Input id={nId} value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={eId}>Login email</Label>
          <Input id={eId} value={email} disabled readOnly />
          <p className="text-xs text-muted-foreground">Your login email can&apos;t be changed here.</p>
        </div>
      </div>
      <Button className="self-start" disabled={save.pending || !value.trim() || value.trim() === name} onClick={() => save.run(() => saveAccountName(value), "Name saved")}>
        {save.pending ? "Saving…" : "Save changes"}
      </Button>
      <div className="flex flex-wrap gap-3 border-t pt-5">
        <Button variant="outline" disabled={reset.pending} onClick={() => reset.run(sendPasswordReset, `We've emailed a reset link to ${email}.`)}>
          <KeyRound aria-hidden />
          {reset.pending ? "Sending…" : "Change password"}
        </Button>
        <Button variant="ghost" disabled={signingOut} onClick={() => startSignOut(() => signOut())}>
          <LogOut aria-hidden />
          Sign out
        </Button>
      </div>
    </div>
  );
}
