// The email AstaDesk sends the store's own team when Ava needs a person:
// an escalated conversation, or a money action waiting for approval. Pure.
// Only what's needed to decide is included, and the customer's email address
// is never put in the subject line.

export type TeamAlertKind = "escalated" | "approval";

export type TeamAlertInput = {
  kind: TeamAlertKind;
  appUrl: string;
  storeName: string;
  conversationId: string;
  customerName: string | null;
  channel: "email" | "chat";
  subject: string | null;
  reason: string | null;
  lastMessage: string | null;
  /** Approval only: one line per pending action, e.g. "Cancel order #1048". */
  actions?: string[];
};

export type TeamAlertEmail = { subject: string; text: string; html: string };

const MAX_QUOTE = 300;

function trim(s: string | null | undefined, max: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const stripTrailingSlash = (u: string) => u.replace(/\/+$/, "");

export function teamAlertEmail(input: TeamAlertInput): TeamAlertEmail {
  const base = stripTrailingSlash(input.appUrl);
  const who = trim(input.customerName, 60) || "A customer";
  const topic = trim(input.subject, 80);
  const channel = input.channel === "chat" ? "store chat" : "email";
  const quote = trim(input.lastMessage, MAX_QUOTE);
  const actions = (input.actions ?? []).map((a) => trim(a, 120)).filter(Boolean);

  const escalated = input.kind === "escalated";
  const link = escalated ? `${base}/inbox/${input.conversationId}` : `${base}/approvals`;
  const button = escalated ? "Open conversation" : "Review in AstaDesk";
  const heading = escalated ? "Ava needs you" : "Approval needed";
  const subject = escalated
    ? `Ava needs you: ${who}${topic ? ` · ${topic}` : ""}`
    : `Approval needed: ${actions[0] ?? "a request"}${actions.length > 1 ? ` (+${actions.length - 1} more)` : ""}`;
  const intro = escalated
    ? `${who} wrote in by ${channel}, and Ava handed the conversation to you.`
    : `Ava prepared ${actions.length > 1 ? "these requests" : "this request"} for ${who} (${channel}). Nothing happens in Shopify until you approve.`;
  const reason = escalated ? trim(input.reason, 300) : "";

  const text = [
    `${heading} · ${input.storeName}`,
    "",
    intro,
    ...(reason ? ["", `Why: ${reason}`] : []),
    ...(actions.length ? ["", ...actions.map((a) => `• ${a}`)] : []),
    ...(quote ? ["", `Their last message: "${quote}"`] : []),
    "",
    `${button}: ${link}`,
    "",
    "You're getting this because alerts are on in AstaDesk Settings → Notifications.",
  ].join("\n");

  const p = (t: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3d4a45;">${t}</p>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background-color:#f6f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#17201d;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f5f0;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
<tr><td align="center" style="padding-bottom:22px;"><img src="${escapeHtml(base)}/brand/astadesk-logo-email.png" width="161" height="40" alt="AstaDesk" style="display:block;border:0;width:161px;height:40px;"></td></tr>
<tr><td style="background-color:#ffffff;border:1px solid #e3e8e5;border-radius:16px;padding:32px 28px;">
<p style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${escalated ? "#b4232c" : "#8a5a00"};">${escapeHtml(heading)} · ${escapeHtml(trim(input.storeName, 60))}</p>
<h1 style="margin:0 0 14px;font-size:20px;line-height:1.35;font-weight:600;color:#17201d;">${escapeHtml(topic || (escalated ? "A conversation needs a person" : "A request waits for your approval"))}</h1>
${p(escapeHtml(intro))}
${reason ? p(`<strong>Why:</strong> ${escapeHtml(reason)}`) : ""}
${actions.length ? `<ul style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.6;color:#17201d;">${actions.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>` : ""}
${quote ? `<p style="margin:0 0 12px;padding:12px 14px;border-left:3px solid #cfe3dc;background:#f3f7f5;border-radius:6px;font-size:14px;line-height:1.55;color:#3d4a45;">&ldquo;${escapeHtml(quote)}&rdquo;</p>` : ""}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px;"><tr><td bgcolor="#0f6e5c" style="border-radius:10px;"><a href="${escapeHtml(link)}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${button}</a></td></tr></table>
</td></tr>
<tr><td align="center" style="padding:20px 8px 0;font-size:12px;line-height:1.7;color:#7c8984;">You're getting this because alerts are on in AstaDesk Settings → Notifications.<br>AstaDesk · A product of Websaura</td></tr>
</table></td></tr></table>
</body></html>`;

  return { subject: trim(subject, 150), text, html };
}
