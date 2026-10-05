// Display labels for conversation states (shared by inbox list and detail).

export const CONVERSATION_STATUSES = [
  "open",
  "ai_drafted",
  "awaiting_approval",
  "escalated",
  "human",
  "resolved",
] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const STATUS_LABEL: Record<ConversationStatus, string> = {
  open: "Open",
  ai_drafted: "Draft ready",
  awaiting_approval: "Needs approval",
  escalated: "Escalated",
  human: "You're handling",
  resolved: "Resolved",
};

export const STATUS_VARIANT: Record<ConversationStatus, "default" | "secondary" | "destructive" | "outline"> = {
  open: "outline",
  ai_drafted: "default",
  awaiting_approval: "default",
  escalated: "destructive",
  human: "secondary",
  resolved: "outline",
};

/** Statuses that need the merchant to do something. */
export const NEEDS_ATTENTION: ConversationStatus[] = ["ai_drafted", "awaiting_approval", "escalated", "open"];

export const INBOX_FILTERS = ["attention", "all", ...CONVERSATION_STATUSES] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export const FILTER_LABEL: Record<InboxFilter, string> = {
  attention: "Needs attention",
  all: "All",
  ...STATUS_LABEL,
};

export function parseFilter(value: unknown): InboxFilter {
  return INBOX_FILTERS.find((f) => f === value) ?? "attention";
}

export function asStatus(value: string): ConversationStatus {
  return CONVERSATION_STATUSES.find((s) => s === value) ?? "open";
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "5 minutes ago", "yesterday"… falls back to a date after a week. */
export function timeAgo(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - now.getTime();
  if (Math.abs(diff) > 7 * 86_400_000) return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "just now";
}
