"use client";

import { Sparkles } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";

const UNITS = [
  { label: "Days", ms: 86_400_000 },
  { label: "Hours", ms: 3_600_000 },
  { label: "Minutes", ms: 60_000 },
  { label: "Seconds", ms: 1_000 },
] as const;

function parts(left: number): number[] {
  let rest = Math.max(left, 0);
  return UNITS.map(({ ms }) => {
    const n = Math.floor(rest / ms);
    rest -= n * ms;
    return n;
  });
}

// A once-a-second clock. The server snapshot is null, so the countdown only
// fills in after hydration and server and browser HTML match.
const subscribe = (tick: () => void) => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
};
const nowSecond = () => Math.floor(Date.now() / 1000) * 1000;
const noClock = () => null;

/**
 * Blurs its children behind a "Launching soon" countdown until `launchAt`,
 * then shows them as normal (no reload needed).
 */
export function LaunchGate({ launchAt, launchLabel, children }: { launchAt: string; launchLabel: string; children: ReactNode }) {
  const target = new Date(launchAt).getTime();
  const now = useSyncExternalStore(subscribe, nowSecond, noClock);

  if (now !== null && now >= target) return <>{children}</>;

  const values = now === null ? null : parts(target - now);

  return (
    <div className="relative">
      <div inert aria-hidden className="pointer-events-none select-none blur-md saturate-50">
        {children}
      </div>
      <div className="absolute inset-0 flex items-start justify-center px-4 pt-16 sm:items-center sm:pt-0">
        <div
          role="timer"
          aria-live="off"
          aria-label="Time until founding prices open"
          className="flex w-full max-w-lg flex-col items-center gap-5 rounded-3xl border bg-card/95 p-7 text-center shadow-lift backdrop-blur sm:p-9"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary uppercase">
            <Sparkles className="size-3.5" aria-hidden />
            Launching soon
          </span>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-2xl font-semibold tracking-tight text-balance">Founding spots open in</h3>
            <p className="text-sm text-muted-foreground">
              Founding prices go live on {launchLabel}. Spots are limited.
            </p>
          </div>
          <dl className="grid w-full grid-cols-4 gap-2 sm:gap-3">
            {UNITS.map((u, i) => (
              <div key={u.label} className="flex flex-col items-center gap-1 rounded-2xl border bg-background px-1 py-3">
                <dt className="order-last text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{u.label}</dt>
                <dd className="text-3xl font-semibold tabular-nums sm:text-4xl">{values ? String(values[i]).padStart(2, "0") : "--"}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
