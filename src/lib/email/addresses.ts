// Postmark inbound addresses (pure). The server's inbound address is
// local@inbound.postmarkapp.com; anything after "+" arrives as MailboxHash.
//   shop forwarding address:  local+<shopHash>@domain
//   per-conversation Reply-To: local+<shopHash>.<replyToken>@domain

const HASH = /^[a-f0-9]{6,32}$/;

function split(base: string): { local: string; domain: string } {
  const at = base.lastIndexOf("@");
  if (at <= 0) throw new Error("Invalid inbound address");
  return { local: base.slice(0, at).split("+")[0] ?? "", domain: base.slice(at + 1) };
}

export function shopAddress(base: string, shopHash: string): string {
  const { local, domain } = split(base);
  return `${local}+${shopHash}@${domain}`;
}

export function replyAddress(base: string, shopHash: string, replyToken: string): string {
  const { local, domain } = split(base);
  return `${local}+${shopHash}.${replyToken}@${domain}`;
}

/** "abc123" → { shopHash }, "abc123.def456" → { shopHash, replyToken }. Anything else → null. */
export function parseMailboxHash(hash: string | null | undefined): { shopHash: string; replyToken: string | null } | null {
  if (!hash) return null;
  const [shopHash, replyToken, extra] = hash.trim().toLowerCase().split(".");
  if (!shopHash || !HASH.test(shopHash) || extra !== undefined) return null;
  if (replyToken !== undefined && !HASH.test(replyToken)) return null;
  return { shopHash, replyToken: replyToken ?? null };
}

/** "Re: Fwd: RE: Order help" → "order help" (for matching a reply to its conversation). */
export function normalizeSubject(subject: string | null | undefined): string {
  let s = (subject ?? "").trim();
  for (;;) {
    const next = s.replace(/^(re|fw|fwd|aw|sv|vs)\s*(\[\d+\])?\s*:\s*/i, "");
    if (next === s) break;
    s = next;
  }
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
