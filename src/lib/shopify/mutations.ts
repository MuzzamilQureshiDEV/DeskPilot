import { z } from "zod";

import { shopifyGraphql } from "@/lib/shopify/client";

// Shopify write operations for APPROVED action requests only (CLAUDE.md §8).
// Validated against API 2026-10 on 2026-10-05:
// - refundCreate requires @idempotent(key) since 2026-04; we use the action id,
//   so a retry can never refund twice.
// - Money transactions come from Order.suggestedRefund (OrderTransactionInput).
// - MailingAddressInput takes countryCode/provinceCode (names are deprecated).

export type ShopifyConn = {
  domain: string;
  accessToken: string;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

/** A permanent failure with a message safe to show the merchant. Never retried. */
export class ActionFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionFailed";
  }
}

const money = z.object({ shopMoney: z.object({ amount: z.string(), currencyCode: z.string() }) });
const userErrors = z.array(z.object({ field: z.array(z.string()).nullable().optional(), message: z.string() }));

const ORDER_STATE = `
  query OrderState($id: ID!) {
    order(id: $id) {
      id
      name
      cancelledAt
      displayFinancialStatus
      fulfillments(first: 10) { status }
      lineItems(first: 50) { nodes { id quantity unfulfilledQuantity } }
      transactions(first: 20) { id kind status gateway amountSet { ${"shopMoney { amount currencyCode }"} } }
    }
  }
`;

const orderStateSchema = z.object({
  order: z
    .object({
      id: z.string(),
      name: z.string(),
      cancelledAt: z.string().nullable(),
      displayFinancialStatus: z.string().nullable(),
      fulfillments: z.array(z.object({ status: z.string() })),
      lineItems: z.object({ nodes: z.array(z.object({ id: z.string(), quantity: z.number(), unfulfilledQuantity: z.number() })) }),
      transactions: z.array(
        z.object({ id: z.string(), kind: z.string(), status: z.string(), gateway: z.string().nullable(), amountSet: money }),
      ),
    })
    .nullable(),
});
type OrderState = NonNullable<z.infer<typeof orderStateSchema>["order"]>;

async function gql<T>(conn: ShopifyConn, query: string, variables: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  const data = await shopifyGraphql<unknown>({ ...conn, query, variables });
  return schema.parse(data);
}

export async function loadOrderState(conn: ShopifyConn, orderId: string): Promise<OrderState> {
  if (!/^gid:\/\/shopify\/Order\/\d+$/.test(orderId)) throw new ActionFailed("This isn't a Shopify order.");
  const { order } = await gql(conn, ORDER_STATE, { id: orderId }, orderStateSchema);
  if (!order) throw new ActionFailed("The order no longer exists in Shopify.");
  return order;
}

/** Anything already shipped (or being shipped). */
export function hasShipped(o: OrderState): boolean {
  const live = o.fulfillments.some((f) => !["CANCELLED", "ERROR", "FAILURE"].includes(f.status));
  const unshipped = o.lineItems.nodes.reduce((s, li) => s + li.unfulfilledQuantity, 0);
  const total = o.lineItems.nodes.reduce((s, li) => s + li.quantity, 0);
  return live || unshipped < total;
}

const cents = (amount: string) => Math.round(Number(amount) * 100);
const decimal = (c: number) => (c / 100).toFixed(2);

function firstUserError(errors: { message: string }[] | undefined): string | null {
  return errors && errors.length > 0 ? errors.map((e) => e.message).join("; ") : null;
}

// ---------------------------------------------------------------------------
// Refund
// ---------------------------------------------------------------------------

export type RefundPayload = {
  order_id: string;
  amount: string;
  currency: string;
  line_items: { line_item_id: string; quantity: number }[];
};

const SUGGESTED_REFUND = `
  query SuggestedRefund($id: ID!, $items: [RefundLineItemInput!]) {
    order(id: $id) {
      suggestedRefund(refundLineItems: $items) {
        amountSet { shopMoney { amount currencyCode } }
        maximumRefundableSet { shopMoney { amount currencyCode } }
        suggestedTransactions { parentTransaction { id } gateway kind amountSet { shopMoney { amount currencyCode } } }
      }
    }
  }
`;
const suggestedSchema = z.object({
  order: z
    .object({
      suggestedRefund: z.object({
        amountSet: money,
        maximumRefundableSet: money,
        suggestedTransactions: z.array(
          z.object({ parentTransaction: z.object({ id: z.string() }).nullable(), gateway: z.string().nullable(), kind: z.string(), amountSet: money }),
        ),
      }),
    })
    .nullable(),
});

const REFUND_CREATE = `
  mutation RefundCreate($input: RefundInput!, $key: String!) {
    refundCreate(input: $input) @idempotent(key: $key) {
      refund { id totalRefundedSet { shopMoney { amount currencyCode } } }
      userErrors { field message }
    }
  }
`;
const refundCreateSchema = z.object({
  refundCreate: z.object({
    refund: z.object({ id: z.string(), totalRefundedSet: money }).nullable(),
    userErrors,
  }),
});

export async function executeRefund(
  conn: ShopifyConn,
  payload: RefundPayload,
  opts: { notifyCustomer: boolean; restock: boolean; idempotencyKey: string; note: string },
) {
  const order = await loadOrderState(conn, payload.order_id);
  if (order.cancelledAt && order.displayFinancialStatus === "REFUNDED") throw new ActionFailed("This order was already cancelled and refunded.");

  const items = payload.line_items.map((li) => ({ lineItemId: li.line_item_id, quantity: li.quantity }));
  const { order: suggested } = await gql(conn, SUGGESTED_REFUND, { id: order.id, items }, suggestedSchema);
  if (!suggested) throw new ActionFailed("The order no longer exists in Shopify.");
  const s = suggested.suggestedRefund;
  const currency = s.maximumRefundableSet.shopMoney.currencyCode;
  const maxCents = cents(s.maximumRefundableSet.shopMoney.amount);

  let transactions: { orderId: string; gateway: string; kind: string; parentId: string; amount: string }[];
  if (items.length > 0) {
    // Item refunds: Shopify's own calculation for exactly the approved items (includes their tax).
    transactions = s.suggestedTransactions
      .filter((t) => t.parentTransaction && t.gateway)
      .map((t) => ({
        orderId: order.id,
        gateway: t.gateway ?? "",
        kind: "REFUND",
        parentId: t.parentTransaction?.id ?? "",
        amount: t.amountSet.shopMoney.amount,
      }));
  } else {
    // Amount-only refund: exactly the approved amount, from the original payment.
    const wanted = cents(payload.amount);
    if (wanted > maxCents) {
      throw new ActionFailed(`Only ${decimal(maxCents)} ${currency} can still be refunded on this order.`);
    }
    const parent = order.transactions.find((t) => (t.kind === "SALE" || t.kind === "CAPTURE") && t.status === "SUCCESS");
    if (!parent?.gateway) throw new ActionFailed("No successful payment was found on this order to refund.");
    transactions = [{ orderId: order.id, gateway: parent.gateway, kind: "REFUND", parentId: parent.id, amount: decimal(wanted) }];
  }

  const totalCents = transactions.reduce((sum, t) => sum + cents(t.amount), 0);
  if (transactions.length === 0 || totalCents <= 0) {
    throw new ActionFailed("Shopify found nothing left to refund for these items (already refunded or unpaid).");
  }
  if (totalCents > maxCents) throw new ActionFailed(`Only ${decimal(maxCents)} ${currency} can still be refunded on this order.`);

  const res = await gql(
    conn,
    REFUND_CREATE,
    {
      key: opts.idempotencyKey,
      input: {
        orderId: order.id,
        notify: opts.notifyCustomer,
        note: opts.note.slice(0, 255),
        transactions,
        ...(items.length > 0
          ? { refundLineItems: items.map((i) => ({ ...i, restockType: opts.restock ? "RETURN" : "NO_RESTOCK" })) }
          : {}),
      },
    },
    refundCreateSchema,
  );
  const error = firstUserError(res.refundCreate.userErrors);
  if (error || !res.refundCreate.refund) throw new ActionFailed(`Shopify refused the refund: ${error ?? "no refund created"}`);
  const refunded = res.refundCreate.refund.totalRefundedSet.shopMoney;
  return { refund_id: res.refundCreate.refund.id, amount: decimal(cents(refunded.amount)), currency: refunded.currencyCode };
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

const ORDER_CANCEL = `
  mutation OrderCancel($id: ID!, $restock: Boolean!, $notify: Boolean!, $note: String) {
    orderCancel(
      orderId: $id
      reason: CUSTOMER
      restock: $restock
      notifyCustomer: $notify
      refundMethod: { originalPaymentMethodsRefund: true }
      staffNote: $note
    ) {
      job { id done }
      orderCancelUserErrors { field message code }
    }
  }
`;
const orderCancelSchema = z.object({
  orderCancel: z.object({
    job: z.object({ id: z.string(), done: z.boolean() }).nullable(),
    orderCancelUserErrors: userErrors,
  }),
});

export async function executeCancel(conn: ShopifyConn, orderId: string, opts: { notifyCustomer: boolean; restock: boolean }) {
  const order = await loadOrderState(conn, orderId);
  if (order.cancelledAt) return { already_cancelled: true }; // idempotent: done before
  if (hasShipped(order)) throw new ActionFailed("This order has already shipped, so it can't be cancelled.");

  const res = await gql(
    conn,
    ORDER_CANCEL,
    { id: order.id, restock: opts.restock, notify: opts.notifyCustomer, note: "Cancellation approved in AstaDesk" },
    orderCancelSchema,
  );
  const error = firstUserError(res.orderCancel.orderCancelUserErrors);
  if (error) throw new ActionFailed(`Shopify refused the cancellation: ${error}`);
  return { job_id: res.orderCancel.job?.id ?? null };
}

// ---------------------------------------------------------------------------
// Address change
// ---------------------------------------------------------------------------

export type NewAddress = {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  province_code?: string;
  zip: string;
  country_code?: string;
};

/** "Jane van der Berg" → first "Jane", last "van der Berg". */
export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

const ORDER_UPDATE = `
  mutation OrderUpdate($input: OrderInput!) {
    orderUpdate(input: $input) { order { id } userErrors { field message } }
  }
`;
const orderUpdateSchema = z.object({ orderUpdate: z.object({ order: z.object({ id: z.string() }).nullable(), userErrors }) });

export async function executeAddressChange(conn: ShopifyConn, orderId: string, address: NewAddress) {
  if (!address.country_code) throw new ActionFailed("The new address has no country code. Ask the customer to confirm the country.");
  const order = await loadOrderState(conn, orderId);
  if (order.cancelledAt) throw new ActionFailed("This order was cancelled.");
  if (hasShipped(order)) throw new ActionFailed("This order has already shipped, so its address can't be changed.");

  const shippingAddress = {
    ...splitName(address.name),
    address1: address.address1,
    ...(address.address2 ? { address2: address.address2 } : {}),
    city: address.city,
    ...(address.province_code ? { provinceCode: address.province_code } : {}),
    zip: address.zip,
    countryCode: address.country_code,
  };
  const res = await gql(conn, ORDER_UPDATE, { input: { id: order.id, shippingAddress } }, orderUpdateSchema);
  const error = firstUserError(res.orderUpdate.userErrors);
  if (error) throw new ActionFailed(`Shopify refused the address change: ${error}`);
  return { shipping_address: shippingAddress };
}
