// Pure helpers for live dashboard updates (tested without a browser).

export const LIVE_TABLES = ["conversations", "messages", "action_requests"] as const;
export type LiveTable = (typeof LIVE_TABLES)[number];

export type LiveChange = {
  table: string;
  eventType: "INSERT" | "UPDATE" | "DELETE" | string;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};

export type LiveNotice = { kind: "escalation" | "approval"; title: string } | null;

/** Should this change pop a toast? Only brand-new escalations and approval requests. */
export function noticeFor(change: LiveChange): LiveNotice {
  const row = change.new ?? {};
  if (change.table === "conversations" && change.eventType === "UPDATE" && row.status === "escalated") {
    // Realtime only includes the old status with REPLICA IDENTITY FULL; without it, use escalated_at freshness.
    const before = change.old?.status;
    if (before === "escalated") return null;
    const at = typeof row.escalated_at === "string" ? Date.parse(row.escalated_at) : NaN;
    if (before === undefined && !(Date.now() - at < 60_000)) return null;
    const subject = typeof row.subject === "string" && row.subject ? row.subject : "a conversation";
    return { kind: "escalation", title: `Needs you: ${subject}` };
  }
  if (change.table === "action_requests" && change.eventType === "INSERT" && row.status === "pending") {
    return { kind: "approval", title: "New request waiting for your approval" };
  }
  return null;
}

/** Trailing debounce: many changes in a burst → one call. */
export function debounce(fn: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
  run.cancel = () => clearTimeout(timer);
  return run;
}
