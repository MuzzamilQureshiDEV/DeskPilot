import type { Json } from "@/types/database";

// Human-readable summary of a proposed money action (refund / cancel / address
// change), from its stored payload. Shared by the Test page and the inbox.

export type ActionType = "refund" | "cancel" | "address_change";

export type ActionSummary = {
  type: ActionType;
  orderNumber: string;
  title: string;
  details: string[];
};

type JsonObject = { [key: string]: Json | undefined };

const asObject = (v: Json | undefined): JsonObject | null =>
  v && typeof v === "object" && !Array.isArray(v) ? v : null;

function str(v: Json | undefined): string {
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
}

function addressLine(v: Json | undefined): string {
  const a = asObject(v);
  if (!a) return "no address on file";
  return [a.address1, a.address2, a.city, a.province, a.zip, a.country].map(str).filter(Boolean).join(", ");
}

export function summarizeAction(type: ActionType, payload: Json): ActionSummary {
  const p = asObject(payload) ?? {};
  const orderNumber = str(p.order_number);
  const reason = `Reason: ${str(p.reason) || "not given"}`;

  if (type === "refund") {
    const items = Array.isArray(p.line_items) ? p.line_items : [];
    return {
      type,
      orderNumber,
      title: `Refund ${str(p.amount)} ${str(p.currency)}`.trim(),
      details: [
        ...items
          .map((li) => {
            const o = asObject(li);
            return o ? `${str(o.quantity)} × ${str(o.title)}${o.size ? ` (${str(o.size)})` : ""}` : "";
          })
          .filter(Boolean),
        reason,
      ],
    };
  }
  if (type === "cancel") {
    return {
      type,
      orderNumber,
      title: "Cancel order",
      details: [`Refund ${str(p.refund_amount)} ${str(p.currency)} on cancel`, reason],
    };
  }
  return {
    type,
    orderNumber,
    title: "Change shipping address",
    details: [`From: ${addressLine(p.current_address)}`, `To: ${addressLine(p.new_address)}`, reason],
  };
}
