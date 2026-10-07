import { STATUS_LABEL, type ConversationStatus } from "@/lib/inbox/labels";
import { cn } from "@/lib/utils";

/** One colour per conversation state, used everywhere a status is shown. */
export const STATUS_TONE: Record<ConversationStatus, { pill: string; dot: string; bar: string }> = {
  escalated: { pill: "bg-destructive/10 text-destructive", dot: "bg-destructive", bar: "bg-destructive" },
  awaiting_approval: { pill: "bg-warning/15 text-[color-mix(in_oklch,var(--warning),var(--foreground)_45%)]", dot: "bg-warning", bar: "bg-warning" },
  ai_drafted: { pill: "bg-primary/10 text-primary", dot: "bg-primary", bar: "bg-primary" },
  open: { pill: "bg-chart-3/12 text-[color-mix(in_oklch,var(--chart-3),var(--foreground)_35%)]", dot: "bg-chart-3", bar: "bg-chart-3" },
  human: { pill: "bg-[oklch(0.6_0.13_295/0.12)] text-[oklch(0.5_0.13_295)] dark:text-[oklch(0.78_0.1_295)]", dot: "bg-[oklch(0.6_0.13_295)]", bar: "bg-[oklch(0.6_0.13_295)]" },
  resolved: { pill: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/50", bar: "bg-transparent" },
};

export function StatusPill({ status, className }: { status: ConversationStatus; className?: string }) {
  const tone = STATUS_TONE[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tone.pill, className)}>
      <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Initials avatar with a stable soft colour per person. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials =
    name
      .replace(/@.*/, "")
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = [172, 200, 230, 260, 295, 330, 25, 60, 140][hash % 9];
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        "bg-[oklch(0.93_0.04_var(--av-h))] text-[oklch(0.38_0.08_var(--av-h))]",
        "dark:bg-[oklch(0.32_0.05_var(--av-h))] dark:text-[oklch(0.88_0.06_var(--av-h))]",
        className,
      )}
      style={{ "--av-h": hue } as React.CSSProperties}
      aria-hidden
    >
      {initials}
    </span>
  );
}
