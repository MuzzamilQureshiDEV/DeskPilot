"use client";

import { Check, Loader2, Lock } from "lucide-react";
import { useId, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import type { Category } from "@/lib/ai/schemas";
import {
  CATEGORY_META,
  MAX_THRESHOLD,
  MIN_THRESHOLD,
  MODE_META,
  MODES,
  type Mode,
} from "@/lib/automation/settings";
import { cn } from "@/lib/utils";

import { saveAutomationSetting } from "./actions";

export function SettingRow({
  category,
  mode: initialMode,
  threshold: initialThreshold,
  money,
  autopilotAllowed,
}: {
  category: Category;
  mode: Mode;
  threshold: number;
  money: boolean;
  autopilotAllowed: boolean;
}) {
  const [mode, setMode] = useState(initialMode);
  const [threshold, setThreshold] = useState(Math.round(initialThreshold * 100));
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const sliderId = useId();
  const meta = CATEGORY_META[category];

  const save = (nextMode: Mode, nextThreshold: number) => {
    const previous = mode;
    setMode(nextMode);
    start(async () => {
      const res = await saveAutomationSetting({ category, mode: nextMode, threshold: nextThreshold / 100 });
      if (res.ok) setStatus({ ok: true, text: "Saved" });
      else {
        setMode(previous);
        setStatus({ ok: false, text: res.error });
      }
    });
  };

  return (
    <li className="flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between">
      <div className="flex flex-col gap-0.5 md:max-w-xs">
        <span className="flex items-center gap-2 text-sm font-medium">
          {meta.label}
          {money && <Badge variant="secondary">Money</Badge>}
        </span>
        <span className="text-xs text-muted-foreground">{meta.description}</span>
      </div>

      <div className="flex flex-col gap-2 md:items-end">
        <div role="radiogroup" aria-label={`${meta.label} mode`} className="inline-flex rounded-lg border p-0.5">
          {MODES.map((m) => {
            const locked = m === "autopilot" && (money || !autopilotAllowed);
            const selected = mode === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={pending || locked}
                title={
                  locked
                    ? money
                      ? "Money actions always need your approval"
                      : "Available on the Growth and Scale plans"
                    : MODE_META[m].description
                }
                onClick={() => !selected && save(m, threshold)}
                className={cn(
                  "flex items-center gap-1 rounded-md px-3 py-1 text-sm transition-colors disabled:cursor-not-allowed",
                  selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  locked && "opacity-50 hover:bg-transparent",
                )}
              >
                {locked && <Lock className="size-3" aria-hidden />}
                {MODE_META[m].label}
              </button>
            );
          })}
        </div>

        {money && <span className="text-xs text-muted-foreground">Approval always required. The AI only proposes these.</span>}

        {mode === "autopilot" && (
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor={sliderId} className="text-muted-foreground">
              Send when at least
            </label>
            <input
              id={sliderId}
              type="range"
              min={MIN_THRESHOLD * 100}
              max={MAX_THRESHOLD * 100}
              value={threshold}
              disabled={pending}
              onChange={(e) => setThreshold(Number(e.target.value))}
              onPointerUp={() => save("autopilot", threshold)}
              onKeyUp={(e) => /^(Arrow|Home|End|Page)/.test(e.key) && save("autopilot", threshold)}
              className="w-32 accent-primary"
            />
            <span className="w-14 font-medium tabular-nums">{threshold}% sure</span>
          </div>
        )}

        <span className="min-h-4 text-xs" aria-live="polite">
          {pending ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden /> Saving…
            </span>
          ) : status ? (
            <span className={cn("flex items-center gap-1", status.ok ? "text-primary" : "text-destructive")}>
              {status.ok && <Check className="size-3" aria-hidden />}
              {status.text}
            </span>
          ) : null}
        </span>
      </div>
    </li>
  );
}
