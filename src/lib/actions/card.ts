import { summarizeAction, type ActionSummary, type ActionType } from "@/lib/inbox/action-summary";
import type { Json } from "@/types/database";

// Plain-language text for action cards (Approvals page + conversation view).

type Row = {
  id: string;
  type: ActionType;
  status: string;
  payload: Json;
  result: Json | null;
  error: string | null;
  decided_at: string | null;
};

const obj = (v: Json | null | undefined): Record<string, Json | undefined> =>
  v && typeof v === "object" && !Array.isArray(v) ? v : {};

/** What approving will do. */
export function consequence(type: ActionType, payload: Json, summary: ActionSummary): string {
  const p = obj(payload);
  if (type === "refund") {
    const items = Array.isArray(p.line_items) ? p.line_items.length : 0;
    return items > 0
      ? `Refund the items above to the customer's original payment method. Shopify includes any tax on those items.`
      : `Refund ${String(p.amount ?? "")} ${String(p.currency ?? "")} to the customer's original payment method.`;
  }
  if (type === "cancel") return `Cancel order ${summary.orderNumber} in Shopify and refund the customer's payment.`;
  return `Change the shipping address of order ${summary.orderNumber} in Shopify.`;
}

/** Result line for executed / failed actions. */
export function outcomeText(type: ActionType, status: string, result: Json | null, error: string | null): string | null {
  if (status === "failed") return error ?? "Something went wrong in Shopify.";
  if (status !== "executed") return null;
  const r = obj(result);
  if (type === "refund") return `Refunded ${String(r.amount ?? "")} ${String(r.currency ?? "")} in Shopify.`;
  if (type === "cancel") return r.already_cancelled ? "The order was already cancelled in Shopify." : "Cancellation submitted to Shopify.";
  return "Shipping address updated in Shopify.";
}

export function toCardData(row: Row, conversation?: { id: string; label: string }) {
  const summary = summarizeAction(row.type, row.payload);
  return {
    id: row.id,
    status: row.status,
    summary,
    consequence: consequence(row.type, row.payload, summary),
    outcome: outcomeText(row.type, row.status, row.result, row.error),
    decidedAt: row.decided_at,
    ...(conversation ? { conversation } : {}),
  };
}
