// Loop protection for inbound email (CLAUDE.md rule 8). Pure: given the
// email's headers/sender and a recent-message count, decide whether the AI
// may see it. Filtered emails are logged in filtered_emails, never answered.

export type FilterReason =
  | "auto_submitted"
  | "auto_reply_header"
  | "bulk_precedence"
  | "no_reply_sender"
  | "own_address"
  | "rate_limited"
  | "forwarding_confirmation";

export type Header = { Name: string; Value: string };

export const RATE_LIMIT = { messages: 5, minutes: 10 } as const;

const header = (headers: Header[], name: string) =>
  headers.find((h) => h.Name.toLowerCase() === name.toLowerCase())?.Value.trim();

const NO_REPLY_LOCAL = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer-daemon|postmaster|bounces?([-+._].*)?)$/i;

export function isGmailForwardingConfirmation(from: string, subject: string): boolean {
  return from.toLowerCase() === "forwarding-noreply@google.com" || /forwarding confirmation/i.test(subject);
}

export function classifyInbound(input: {
  from: string;
  subject: string;
  headers: Header[];
  ownAddresses: string[];
  /** Customer messages from this sender in the last RATE_LIMIT.minutes (before this one). */
  recentFromSender: number;
}): { accept: true } | { accept: false; reason: FilterReason } {
  const from = input.from.trim().toLowerCase();
  const local = from.split("@")[0] ?? "";

  if (isGmailForwardingConfirmation(from, input.subject)) return { accept: false, reason: "forwarding_confirmation" };

  const autoSubmitted = header(input.headers, "Auto-Submitted");
  if (autoSubmitted && autoSubmitted.toLowerCase() !== "no") return { accept: false, reason: "auto_submitted" };
  if (["X-Autoreply", "X-Autorespond", "X-Auto-Response-Suppress"].some((h) => header(input.headers, h) !== undefined)) {
    return { accept: false, reason: "auto_reply_header" };
  }
  const precedence = header(input.headers, "Precedence")?.toLowerCase();
  if (precedence && ["bulk", "list", "junk"].includes(precedence)) return { accept: false, reason: "bulk_precedence" };

  if (NO_REPLY_LOCAL.test(local)) return { accept: false, reason: "no_reply_sender" };
  if (input.ownAddresses.some((a) => a.toLowerCase() === from)) return { accept: false, reason: "own_address" };
  if (input.recentFromSender >= RATE_LIMIT.messages) return { accept: false, reason: "rate_limited" };

  return { accept: true };
}

/** Gmail's forwarding-setup email carries a numeric code and a confirmation link. */
export function extractForwardingConfirmation(text: string): { code: string | null; link: string | null } {
  const code = text.match(/Confirmation code:\s*(\d{6,12})/i)?.[1] ?? null;
  const link = text.match(/https:\/\/mail(?:-settings)?\.google\.com\/mail\/[^\s"<>]+/i)?.[0] ?? null;
  return { code, link };
}

/** Plain text from an HTML body (fallback when an email has no text part). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
