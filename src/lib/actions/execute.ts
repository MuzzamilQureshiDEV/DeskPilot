import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { summarizeAction, type ActionType } from "@/lib/inbox/action-summary";
import {
  ActionFailed,
  executeAddressChange,
  executeCancel,
  executeRefund,
  type ShopifyConn,
} from "@/lib/shopify/mutations";
import type { Database, Json } from "@/types/database";

// Steps of the execute-action job (approved action → Shopify). Service-role
// client, always filtered by shop_id. Each step is idempotent:
// - claim only moves approved → executing (one winner),
// - Shopify calls re-check order state, and refunds carry an idempotency key,
// - finish only moves executing → executed/failed.

type Db = SupabaseClient<Database>;

export type ClaimedAction = {
  id: string;
  shopId: string;
  conversationId: string;
  type: ActionType;
  payload: Json;
  options: { notifyCustomer: boolean; restock: boolean };
};

export type Outcome = { ok: true; result: Json } | { ok: false; error: string };

const optionsSchema = z.object({ notify_customer: z.boolean().default(true), restock: z.boolean().default(false) });

export async function claimAction(db: Db, shopId: string, actionId: string): Promise<ClaimedAction | null> {
  const { data } = await db
    .from("action_requests")
    .update({ status: "executing" })
    .eq("id", actionId)
    .eq("shop_id", shopId)
    .eq("status", "approved")
    .not("decided_by", "is", null) // belt and braces: the DB check enforces this too
    .select("id, shop_id, conversation_id, type, payload, options");
  const row = data?.[0];
  if (!row) return null;
  const opts = optionsSchema.parse(row.options ?? {});
  return {
    id: row.id,
    shopId: row.shop_id,
    conversationId: row.conversation_id,
    type: row.type,
    payload: row.payload,
    options: { notifyCustomer: opts.notify_customer, restock: opts.restock },
  };
}

const refundPayload = z.object({
  order_id: z.string(),
  amount: z.string(),
  currency: z.string(),
  line_items: z.array(z.object({ line_item_id: z.string(), quantity: z.number().int().positive() })).default([]),
  reason: z.string().optional(),
});
const orderPayload = z.object({ order_id: z.string() });
const addressPayload = z.object({
  order_id: z.string(),
  new_address: z.object({
    name: z.string(),
    address1: z.string(),
    address2: z.string().optional(),
    city: z.string(),
    province_code: z.string().optional(),
    zip: z.string(),
    country_code: z.string().optional(),
  }),
});

/** Runs the action in Shopify. Throws ActionFailed for permanent problems. */
export async function runAction(conn: ShopifyConn, action: ClaimedAction): Promise<Json> {
  const parse = <T,>(schema: z.ZodType<T>) => {
    const r = schema.safeParse(action.payload);
    if (!r.success) throw new ActionFailed("This request is missing details needed to run it.");
    return r.data;
  };
  switch (action.type) {
    case "refund": {
      const p = parse(refundPayload);
      return executeRefund(conn, p, {
        notifyCustomer: action.options.notifyCustomer,
        restock: action.options.restock,
        idempotencyKey: action.id,
        note: `Approved in AstaDesk${p.reason ? `: ${p.reason}` : ""}`,
      });
    }
    case "cancel":
      return executeCancel(conn, parse(orderPayload).order_id, action.options);
    case "address_change": {
      const p = parse(addressPayload);
      return executeAddressChange(conn, p.order_id, p.new_address);
    }
  }
}

function noteFor(action: ClaimedAction, outcome: Outcome): string {
  const s = summarizeAction(action.type, action.payload);
  if (!outcome.ok) return `Couldn't complete "${s.title}" for order ${s.orderNumber} in Shopify: ${outcome.error}`;
  const r = outcome.result && typeof outcome.result === "object" && !Array.isArray(outcome.result) ? outcome.result : {};
  if (action.type === "refund") return `Refund of ${String(r.amount ?? "")} ${String(r.currency ?? "")} for order ${s.orderNumber} was done in Shopify.`;
  if (action.type === "cancel") {
    return r.already_cancelled
      ? `Order ${s.orderNumber} was already cancelled in Shopify.`
      : `Order ${s.orderNumber} is being cancelled in Shopify.`;
  }
  return `The shipping address for order ${s.orderNumber} was updated in Shopify.`;
}

/** Records the outcome, leaves a note in the conversation, and updates its status. */
export async function finishAction(db: Db, action: ClaimedAction, outcome: Outcome): Promise<void> {
  const { data } = await db
    .from("action_requests")
    .update(
      outcome.ok
        ? { status: "executed", result: outcome.result, executed_at: new Date().toISOString(), error: null }
        : { status: "failed", error: outcome.error.slice(0, 1000) },
    )
    .eq("id", action.id)
    .eq("shop_id", action.shopId)
    .eq("status", "executing")
    .select("id");
  if (!data?.length) return; // already finished

  await db.from("messages").upsert(
    {
      shop_id: action.shopId,
      conversation_id: action.conversationId,
      role: "system",
      status: "received",
      body: noteFor(action, outcome),
      external_message_id: `action:${action.id}`,
    },
    { onConflict: "shop_id,external_message_id", ignoreDuplicates: true },
  );

  const { count } = await db
    .from("action_requests")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", action.shopId)
    .eq("conversation_id", action.conversationId)
    .in("status", ["pending", "approved", "executing"]);
  if ((count ?? 0) === 0) {
    await db
      .from("conversations")
      .update({ status: "open" })
      .eq("id", action.conversationId)
      .eq("shop_id", action.shopId)
      .eq("status", "awaiting_approval");
  }
}

/** After all retries: never leave an action stuck in approved/executing. */
export async function markActionFailed(db: Db, shopId: string, actionId: string, error: string): Promise<void> {
  const { data } = await db
    .from("action_requests")
    .select("id, shop_id, conversation_id, type, payload, status")
    .eq("id", actionId)
    .eq("shop_id", shopId)
    .in("status", ["approved", "executing"])
    .maybeSingle();
  if (!data) return;
  if (data.status === "approved") {
    await db.from("action_requests").update({ status: "executing" }).eq("id", actionId).eq("shop_id", shopId).eq("status", "approved");
  }
  await finishAction(
    db,
    {
      id: data.id,
      shopId: data.shop_id,
      conversationId: data.conversation_id,
      type: data.type,
      payload: data.payload,
      options: { notifyCustomer: false, restock: false },
    },
    { ok: false, error },
  );
}
