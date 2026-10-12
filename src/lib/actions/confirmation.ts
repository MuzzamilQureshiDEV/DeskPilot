import type { ActionType } from "@/lib/inbox/action-summary";
import type { Json } from "@/types/database";

// The message Ava sends the customer once an APPROVED money action has really
// finished in Shopify. A fixed template (no AI): facts come only from the
// stored action and Shopify's result, so nothing can be invented. Pure.

type JsonObject = { [key: string]: Json | undefined };

const asObject = (v: Json | undefined): JsonObject => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const str = (v: Json | undefined): string => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");

const SIGN_OFF = "If anything looks wrong, just reply here.";

function orderRef(payload: JsonObject): string {
  const n = str(payload.order_number);
  return n ? `order ${n.startsWith("#") ? n : `#${n}`}` : "your order";
}

function money(amount: string, currency: string): string {
  return [amount, currency].filter(Boolean).join(" ");
}

function addressText(v: Json | undefined): string {
  const a = asObject(v);
  return [a.name, a.address1, a.address2, a.city, a.province_code ?? a.province, a.zip, a.country_code ?? a.country]
    .map(str)
    .filter(Boolean)
    .join(", ");
}

/** The confirmation for a successful action, or null when there's nothing safe to say. */
export function confirmationText(type: ActionType, payloadJson: Json, resultJson: Json): string | null {
  const payload = asObject(payloadJson);
  const result = asObject(resultJson);
  const order = orderRef(payload);

  if (type === "refund") {
    const amount = money(str(result.amount) || str(payload.amount), str(result.currency) || str(payload.currency));
    if (!amount) return null;
    return `Good news: your refund of ${amount} for ${order} has been processed. It goes back to your original payment method, and depending on your bank it can take a few business days to show. ${SIGN_OFF}`;
  }
  if (type === "cancel") {
    if (result.already_cancelled === true) return `${capitalize(order)} is cancelled. ${SIGN_OFF}`;
    return `${capitalize(order)} has been cancelled. Any payment goes back to your original payment method, and depending on your bank it can take a few business days to show. ${SIGN_OFF}`;
  }
  const address = addressText(payload.new_address);
  if (!address) return null;
  return `The shipping address for ${order} has been updated to: ${address}. ${SIGN_OFF}`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
