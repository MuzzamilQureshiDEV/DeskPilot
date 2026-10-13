"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { saveNotificationSettings } from "./notification-actions";

type Prefs = { escalations: boolean; approvals: boolean };

const ROWS: { key: keyof Prefs; title: string; text: string }[] = [
  { key: "escalations", title: "Email me when Ava hands a conversation to me", text: "When Ava escalates, for example a question she can't answer or an upset customer." },
  { key: "approvals", title: "Email me when something needs my approval", text: "When Ava prepares a refund, cancellation or address change." },
];

/** Two email-alert switches; each change saves straight away. */
export function NotificationsForm({ initial, canEdit, email }: { initial: Prefs; canEdit: boolean; email: string }) {
  const [prefs, setPrefs] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle(key: keyof Prefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    startTransition(async () => {
      const res = await saveNotificationSettings(next);
      if (!res.ok) {
        setPrefs(prefs);
        toast.error(res.error);
      } else {
        toast.success(next[key] ? "Alert turned on" : "Alert turned off");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {ROWS.map((r) => {
        const on = prefs[r.key];
        return (
          <div key={r.key} className="flex items-start justify-between gap-4 border-b py-3.5 last:border-b-0">
            <div>
              <p className="text-sm font-medium" id={`notify-${r.key}`}>
                {r.title}
              </p>
              <p className="text-xs text-muted-foreground">{r.text}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-labelledby={`notify-${r.key}`}
              disabled={!canEdit || pending}
              onClick={() => toggle(r.key)}
              className={cn(
                "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60",
                on ? "bg-primary" : "bg-muted-foreground/30",
              )}
            >
              <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-5.5" : "translate-x-0.5")} />
            </button>
          </div>
        );
      })}
      <p className="pt-2 text-xs text-muted-foreground">
        {canEdit ? <>Alerts go to {email}.</> : "Only the store owner can change alerts."}
      </p>
    </div>
  );
}
