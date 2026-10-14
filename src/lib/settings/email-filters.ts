import { z } from "zod";

// Which incoming emails reach Ava (Settings → Email filters), stored in
// shops.email_filters. Pure and safe for client code.

/** A domain ("brand.com") or a full address ("bills@bank.com"), lower-case. */
const senderRule = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^([^\s@]+@)?([a-z0-9-]+\.)+[a-z]{2,}$/, "Use a domain like brand.com or an address like name@brand.com.");

export const emailFiltersSchema = z.object({
  blocked: z.array(senderRule).max(100),
  allowed: z.array(senderRule).max(100),
  skipNewsletters: z.boolean(),
  maxAutoReplies: z.number().int().min(0).max(10),
});

export type EmailFilters = z.infer<typeof emailFiltersSchema>;

export const EMAIL_FILTER_DEFAULTS: EmailFilters = { blocked: [], allowed: [], skipNewsletters: true, maxAutoReplies: 3 };

export function emailFilters(stored: unknown): EmailFilters {
  const parsed = emailFiltersSchema.partial().safeParse(stored ?? {});
  return { ...EMAIL_FILTER_DEFAULTS, ...(parsed.success ? parsed.data : {}) };
}

/** "a.com, b@c.com\nd.com" → cleaned unique list, or the first invalid entry. */
export function parseSenderList(input: string): { ok: true; list: string[] } | { ok: false; invalid: string } {
  const parts = input.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
  const list: string[] = [];
  for (const p of parts) {
    const r = senderRule.safeParse(p.replace(/^@/, ""));
    if (!r.success) return { ok: false, invalid: p };
    if (!list.includes(r.data)) list.push(r.data);
  }
  return { ok: true, list };
}

/** Does a sender match a rule list (exact address, or the domain or one of its subdomains)? */
export function senderMatches(from: string, rules: string[]): boolean {
  const email = from.trim().toLowerCase();
  const domain = email.split("@")[1] ?? "";
  return rules.some((r) => (r.includes("@") ? r === email : domain === r || domain.endsWith(`.${r}`)));
}
