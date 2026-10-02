// Model-facing projections of store data: only what the agent needs, as plain JSON.

import type { OrderDetail, ProductSummary } from "@/lib/store/types";
import type { Json } from "@/types/database";

const price = (m: { amount: string; currency: string }) => `${m.amount} ${m.currency}`;

export function orderView(o: OrderDetail): Json {
  return {
    order_id: o.id,
    order_number: o.name,
    placed_at: o.createdAt,
    customer_name: o.customerName,
    email: o.email,
    payment_status: o.financialStatus,
    fulfillment_status: o.fulfillmentStatus,
    cancelled_at: o.cancelledAt,
    can_cancel_or_change_address: o.cancellable,
    items: o.lineItems.map((li) => ({
      line_item_id: li.id,
      title: li.title,
      size: li.variantTitle,
      quantity: li.quantity,
      unit_price: price(li.price),
      refundable_quantity: li.refundableQuantity,
      not_yet_shipped: li.unfulfilledQuantity,
    })),
    subtotal: price(o.subtotal),
    shipping: price(o.shipping),
    total: price(o.total),
    total_refunded: price(o.totalRefunded),
    refunds: o.refunds.map((r) => ({ date: r.createdAt, amount: price(r.amount), note: r.note })),
    shipping_address: { ...o.shippingAddress },
    shipment_count: o.fulfillments.length,
  };
}

export function trackingView(o: OrderDetail): Json {
  const titles = new Map(o.lineItems.map((li) => [li.id, li.title]));
  return {
    order_number: o.name,
    fulfillment_status: o.fulfillmentStatus,
    cancelled_at: o.cancelledAt,
    shipments: o.fulfillments.map((f) => ({
      status: f.status,
      delayed: f.delayed,
      carrier: f.carrier,
      tracking_number: f.trackingNumber,
      tracking_url: f.trackingUrl,
      shipped_at: f.shippedAt,
      estimated_delivery: f.estimatedDeliveryAt,
      delivered_at: f.deliveredAt,
      items: f.lineItems.map((li) => ({
        title: titles.get(li.lineItemId) ?? "Item",
        quantity: li.quantity,
      })),
    })),
    not_yet_shipped: o.lineItems
      .filter((li) => li.unfulfilledQuantity > 0)
      .map((li) => ({ title: li.title, size: li.variantTitle, quantity: li.unfulfilledQuantity })),
  };
}

export function productView(p: ProductSummary): Json {
  return {
    title: p.title,
    type: p.productType,
    description: p.description,
    price:
      p.priceRange.min.amount === p.priceRange.max.amount
        ? price(p.priceRange.min)
        : `${p.priceRange.min.amount}-${p.priceRange.max.amount} ${p.priceRange.min.currency}`,
    in_stock: p.available,
    sizes: p.variants.map((v) => ({
      size: v.title,
      price: price(v.price),
      in_stock: v.available,
      quantity_available: v.inventory,
    })),
  };
}
