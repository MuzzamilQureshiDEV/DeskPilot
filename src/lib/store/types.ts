// Store data shapes shared by every StoreProvider (Shopify and sandbox).
// The AI tools only ever see these types, never raw Shopify responses.

/** Decimal amount as a string ("68.00") to avoid float rounding. */
export type Money = { amount: string; currency: string };

export type FinancialStatus =
  | "pending"
  | "paid"
  | "partially_refunded"
  | "refunded"
  | "voided";

export type FulfillmentStatus = "unfulfilled" | "partially_fulfilled" | "fulfilled";

export type ShipmentStatus =
  | "label_created"
  | "in_transit"
  | "out_for_delivery"
  | "attempted_delivery"
  | "delivered"
  | "failure";

export type Address = {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  zip: string;
  country: string;
  countryCode: string;
};

export type OrderSummary = {
  id: string;
  /** Customer-facing order number, e.g. "#1001". */
  name: string;
  email: string;
  customerName: string;
  createdAt: string;
  financialStatus: FinancialStatus;
  fulfillmentStatus: FulfillmentStatus;
  cancelledAt: string | null;
  total: Money;
};

export type LineItem = {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string;
  quantity: number;
  /** Units not yet refunded. */
  refundableQuantity: number;
  /** Units not yet shipped. */
  unfulfilledQuantity: number;
  price: Money;
};

export type Fulfillment = {
  id: string;
  status: ShipmentStatus;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string;
  shippedAt: string;
  estimatedDeliveryAt: string | null;
  deliveredAt: string | null;
  /** In transit and past its estimated delivery date. Computed by the provider. */
  delayed: boolean;
  lineItems: { lineItemId: string; quantity: number }[];
};

export type Refund = { id: string; createdAt: string; amount: Money; note: string | null };

export type OrderDetail = OrderSummary & {
  lineItems: LineItem[];
  fulfillments: Fulfillment[];
  refunds: Refund[];
  shippingAddress: Address;
  subtotal: Money;
  shipping: Money;
  totalRefunded: Money;
  /** True only if nothing has shipped and the order isn't cancelled. */
  cancellable: boolean;
};

export type ProductVariant = {
  id: string;
  title: string;
  sku: string;
  price: Money;
  inventory: number;
  available: boolean;
};

export type ProductSummary = {
  id: string;
  title: string;
  description: string;
  productType: string;
  tags: string[];
  priceRange: { min: Money; max: Money };
  variants: ProductVariant[];
  totalInventory: number;
  available: boolean;
};

export type OrderQuery = { orderNumber?: string; email?: string };

/**
 * Read-only access to a store. Tools call this, never Shopify directly.
 * Implementations: ShopifyProvider (task 2.2) and SandboxProvider.
 */
export interface StoreProvider {
  readonly kind: "shopify" | "sandbox";
  /**
   * Filters are combined with AND. With no filters it returns [] rather than
   * listing every order.
   */
  findOrders(query: OrderQuery): Promise<OrderSummary[]>;
  /** Includes fulfillments and tracking. */
  getOrder(id: string): Promise<OrderDetail | null>;
  /** Includes variants and inventory. */
  searchProducts(query: string): Promise<ProductSummary[]>;
}
