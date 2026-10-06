import { createHash } from "node:crypto";

import { z } from "zod";

// Storefront chat visitors (pure helpers). A visitor is identified only by a
// random token kept in their browser; we store its hash, never the token.

export const CHAT_LIMITS = {
  messagesPerVisitor: 10,
  visitorWindowMinutes: 10,
  newChatsPerShopPerHour: 60,
  maxText: 2000,
} as const;

const token = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, "invalid token");

export const postSchema = z.object({
  token,
  text: z.string().trim().min(1, "Write a message first.").max(CHAT_LIMITS.maxText, "That message is too long."),
  name: z.string().trim().max(100).optional().transform((v) => v || undefined),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(320)
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.email("That email doesn't look right.").optional()),
});
export type ChatPost = { token: string; text: string; name?: string; email?: string };

export const getSchema = z.object({
  token,
  after: z.iso.datetime({ offset: true }).optional(),
});

/** `external_thread_id` for a visitor token. */
export function threadIdFor(visitorToken: string): string {
  return `chat:${createHash("sha256").update(visitorToken).digest("hex")}`;
}

export type VisibleMessage = { id: string; from: "you" | "agent"; body: string; at: string };

/** What a shopper may see: their own messages and replies that were actually sent. Never drafts or notes. */
export function visibleMessages(rows: { id: string; role: string; status: string; body: string; created_at: string | null }[]): VisibleMessage[] {
  return rows.flatMap((m): VisibleMessage[] => {
    if (m.role === "customer") return [{ id: m.id, from: "you", body: m.body, at: m.created_at ?? "" }];
    if ((m.role === "ai" || m.role === "human") && m.status === "sent") {
      return [{ id: m.id, from: "agent", body: m.body, at: m.created_at ?? "" }];
    }
    return [];
  });
}

export type LimitVerdict = { ok: true } | { ok: false; reason: "visitor" | "shop" };

export function checkLimits(input: { recentVisitorMessages: number; isNewChat: boolean; newChatsLastHour: number }): LimitVerdict {
  if (input.recentVisitorMessages >= CHAT_LIMITS.messagesPerVisitor) return { ok: false, reason: "visitor" };
  if (input.isNewChat && input.newChatsLastHour >= CHAT_LIMITS.newChatsPerShopPerHour) return { ok: false, reason: "shop" };
  return { ok: true };
}
