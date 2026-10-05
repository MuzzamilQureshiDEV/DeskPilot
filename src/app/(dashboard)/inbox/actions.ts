"use server";

import { revalidatePath } from "next/cache";

import { enqueueMessage } from "@/inngest/events";
import { getCurrentShop } from "@/lib/auth/session";
import { deliverMessage, type DeliveryResult } from "@/lib/email/outbound";
import * as inbox from "@/lib/inbox/mutations";
import { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;
export type Result =
  | { ok: true; delivery?: DeliveryResult["status"]; deliveryError?: string }
  | { ok: false; error: string };

/** Runs an inbox mutation for the signed-in user's shop through the RLS client. */
async function withShop(fn: (db: Db, shopId: string) => Promise<Result>): Promise<Result> {
  const shop = await getCurrentShop();
  if (!shop) return { ok: false, error: "Your account isn't linked to a store." };
  const result = await fn(await createClient(), shop.id);
  revalidatePath("/inbox", "layout");
  return result;
}

/** After a reply is marked sent, email it to the customer (email conversations only). */
async function andDeliver(db: Db, shopId: string, res: inbox.InboxResult): Promise<Result> {
  if (!res.ok || !res.messageId) return res;
  const delivery = await deliverMessage(db, shopId, res.messageId);
  return delivery.status === "failed"
    ? { ok: true, delivery: "failed", deliveryError: delivery.error }
    : { ok: true, delivery: delivery.status };
}

export async function sendDraftAction(messageId: string, editedBody?: string | null): Promise<Result> {
  return withShop(async (db, shopId) => andDeliver(db, shopId, await inbox.sendDraft(db, shopId, messageId, editedBody)));
}

export async function rejectDraftAction(messageId: string): Promise<Result> {
  return withShop((db, shopId) => inbox.rejectDraft(db, shopId, messageId));
}

export async function sendReplyAction(conversationId: string, body: string): Promise<Result> {
  return withShop(async (db, shopId) => andDeliver(db, shopId, await inbox.sendHumanReply(db, shopId, conversationId, body)));
}

/** Try emailing an already-sent reply again (e.g. after a delivery error). */
export async function resendEmailAction(messageId: string): Promise<Result> {
  return withShop(async (db, shopId) => {
    const id = inbox.idSchema.safeParse(messageId);
    if (!id.success) return { ok: false, error: "Unknown message." };
    return andDeliver(db, shopId, { ok: true, messageId: id.data });
  });
}

export async function takeoverAction(conversationId: string, takeOver: boolean): Promise<Result> {
  return withShop((db, shopId) => inbox.setTakeover(db, shopId, conversationId, takeOver));
}

export async function resolveAction(conversationId: string, resolved: boolean): Promise<Result> {
  return withShop((db, shopId) => inbox.setResolved(db, shopId, conversationId, resolved));
}

/** Ask the AI to draft a reply to the latest unanswered customer message. */
export async function requestDraftAction(conversationId: string): Promise<Result> {
  return withShop(async (db, shopId) => {
    const id = inbox.idSchema.safeParse(conversationId);
    if (!id.success) return { ok: false, error: "Unknown conversation." };
    const messageId = await inbox.unansweredCustomerMessage(db, shopId, id.data);
    if (!messageId) return { ok: false, error: "There's no unanswered customer message." };
    try {
      await enqueueMessage({ shopId, conversationId: id.data, messageId });
      return { ok: true };
    } catch {
      return { ok: false, error: "Background processing isn't running right now. Please try again later." };
    }
  });
}
