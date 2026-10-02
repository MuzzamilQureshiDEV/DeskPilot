// Sample store "Harbor & Pine Outfitters" for the Test page and for shops
// without Shopify connected. Entirely fictional. Dates are generated
// relative to `now` so scenarios (in transit, 45 days ago, ...) stay realistic.

import type {
  Address,
  Fulfillment,
  LineItem,
  Money,
  OrderDetail,
  ProductSummary,
  Refund,
  ShipmentStatus,
} from "@/lib/store/types";

export const SANDBOX_STORE_NAME = "Harbor & Pine Outfitters";
const CURRENCY = "USD";
const DOMESTIC_SHIPPING_CENTS = 800;
const INTERNATIONAL_SHIPPING_CENTS = 2500;
const FREE_SHIPPING_THRESHOLD_CENTS = 7500;

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

type RawProduct = {
  code: string;
  title: string;
  productType: string;
  price: string;
  description: string;
  tags: string[];
  /** size → stock */
  stock: Record<string, number>;
};

const RAW_PRODUCTS: RawProduct[] = [
  {
    code: "RRS",
    title: "Ridgeline Rain Shell",
    productType: "Jacket",
    price: "149.00",
    description:
      "Waterproof, breathable 3-layer rain jacket with taped seams, an adjustable hood and pit zips. Packs into its own chest pocket.",
    tags: ["rain", "waterproof", "jacket", "hiking", "shell"],
    stock: { XS: 4, S: 11, M: 18, L: 0, XL: 6 },
  },
  {
    code: "SDP",
    title: "Summit Down Parka",
    productType: "Jacket",
    price: "289.00",
    description:
      "Our warmest parka. 700-fill responsibly sourced down, water-resistant shell, fleece-lined handwarmer pockets. Rated to about -20°F.",
    tags: ["winter", "down", "parka", "insulated", "jacket", "warm"],
    stock: { S: 0, M: 0, L: 0, XL: 0 },
  },
  {
    code: "TFP",
    title: "Trailbreak Fleece Pullover",
    productType: "Fleece",
    price: "79.00",
    description:
      "Midweight recycled fleece quarter-zip. Great as a mid layer under a shell or on its own on cool mornings.",
    tags: ["fleece", "pullover", "layer", "recycled"],
    stock: { XS: 7, S: 14, M: 22, L: 9, XL: 3 },
  },
  {
    code: "BMT",
    title: "Basecamp Merino Tee",
    productType: "Shirt",
    price: "48.00",
    description:
      "Lightweight merino wool tee that resists odor and regulates temperature. Machine washable on cold.",
    tags: ["merino", "wool", "tee", "t-shirt", "base layer"],
    stock: { S: 25, M: 31, L: 17, XL: 2 },
  },
  {
    code: "SHP",
    title: "Switchback Hiking Pants",
    productType: "Pants",
    price: "89.00",
    description:
      "Stretch nylon hiking pants with a DWR finish, articulated knees and five pockets. Inseam 32 in.",
    tags: ["pants", "hiking", "trousers", "stretch"],
    stock: { "28": 5, "30": 12, "32": 15, "34": 8, "36": 0 },
  },
  {
    code: "CTS",
    title: "Cascade Trail Shorts",
    productType: "Shorts",
    price: "54.00",
    description: "Quick-dry trail shorts with a 7 in. inseam, built-in liner and zip pocket.",
    tags: ["shorts", "running", "hiking", "quick-dry", "summer"],
    stock: { S: 10, M: 13, L: 6, XL: 1 },
  },
  {
    code: "AWB",
    title: "Alpine Wool Beanie",
    productType: "Accessories",
    price: "28.00",
    description: "Rib-knit beanie in a soft wool blend. One size fits most.",
    tags: ["hat", "beanie", "wool", "winter", "accessories"],
    stock: { "One size": 40 },
  },
  {
    code: "TFS",
    title: "Timberline Flannel Shirt",
    productType: "Shirt",
    price: "69.00",
    description: "Brushed organic cotton flannel with a relaxed fit and chest pockets.",
    tags: ["flannel", "shirt", "cotton", "organic"],
    stock: { S: 8, M: 0, L: 12, XL: 5 },
  },
  {
    code: "TPV",
    title: "Tidewater Packable Vest",
    productType: "Vest",
    price: "99.00",
    description:
      "Synthetic-insulated vest that stays warm when damp and packs into its pocket.",
    tags: ["vest", "insulated", "packable", "layer"],
    stock: { S: 6, M: 9, L: 4, XL: 2 },
  },
  {
    code: "NDP",
    title: "Northbound Daypack 24L",
    productType: "Bags",
    price: "119.00",
    description:
      "24-liter daypack with a padded laptop sleeve, hydration port, hip belt and rain cover.",
    tags: ["backpack", "daypack", "bag", "hiking"],
    stock: { "One size": 13 },
  },
  {
    code: "CMS",
    title: "Coastal Merino Socks (3-pack)",
    productType: "Accessories",
    price: "32.00",
    description: "Cushioned merino hiking socks. Three pairs per pack.",
    tags: ["socks", "merino", "wool", "hiking", "accessories"],
    stock: { S: 20, M: 35, L: 18 },
  },
  {
    code: "GIG",
    title: "Granite Insulated Gloves",
    productType: "Accessories",
    price: "45.00",
    description: "Waterproof insulated gloves with touchscreen-compatible fingertips.",
    tags: ["gloves", "winter", "insulated", "waterproof", "accessories"],
    stock: { S: 0, M: 0, L: 0 },
  },
];

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

type CustomerKey =
  | "emma"
  | "marcus"
  | "priya"
  | "daniel"
  | "sofia"
  | "liam"
  | "hannah"
  | "noah"
  | "olivia"
  | "lucas";

type RawCustomer = { name: string; email: string; address: Omit<Address, "name"> };

const CUSTOMERS: Record<CustomerKey, RawCustomer> = {
  emma: {
    name: "Emma Larsen",
    email: "emma.larsen@example.com",
    address: { address1: "418 Alder St", city: "Portland", province: "OR", zip: "97205", country: "United States", countryCode: "US" },
  },
  marcus: {
    name: "Marcus Reid",
    email: "marcus.reid@example.com",
    address: { address1: "77 Granite Ave", address2: "Apt 3B", city: "Denver", province: "CO", zip: "80203", country: "United States", countryCode: "US" },
  },
  priya: {
    name: "Priya Nair",
    email: "priya.nair@example.com",
    address: { address1: "1290 Lakeview Dr", city: "Madison", province: "WI", zip: "53703", country: "United States", countryCode: "US" },
  },
  daniel: {
    name: "Daniel Okafor",
    email: "daniel.okafor@example.com",
    address: { address1: "52 Harbor Rd", city: "Portsmouth", province: "NH", zip: "03801", country: "United States", countryCode: "US" },
  },
  sofia: {
    name: "Sofia Martinez",
    email: "sofia.martinez@example.com",
    address: { address1: "905 Mesa Blvd", city: "Tucson", province: "AZ", zip: "85701", country: "United States", countryCode: "US" },
  },
  liam: {
    name: "Liam Chen",
    email: "liam.chen@example.com",
    address: { address1: "33 Spruce Ln", city: "Bend", province: "OR", zip: "97701", country: "United States", countryCode: "US" },
  },
  hannah: {
    name: "Hannah Weber",
    email: "hannah.weber@example.com",
    address: { address1: "610 Birch Ct", city: "Burlington", province: "VT", zip: "05401", country: "United States", countryCode: "US" },
  },
  noah: {
    name: "Noah Williams",
    email: "noah.williams@example.com",
    address: { address1: "2401 Ridge Rd", city: "Asheville", province: "NC", zip: "28801", country: "United States", countryCode: "US" },
  },
  olivia: {
    name: "Olivia Brown",
    email: "olivia.brown@example.com",
    address: { address1: "18 Shoreline Way", city: "Seattle", province: "WA", zip: "98101", country: "United States", countryCode: "US" },
  },
  lucas: {
    name: "Lucas Dubois",
    email: "lucas.dubois@example.com",
    address: { address1: "455 Rue Sainte-Catherine", city: "Montréal", province: "QC", zip: "H3B 1A7", country: "Canada", countryCode: "CA" },
  },
};

// ---------------------------------------------------------------------------
// Orders (one per support scenario)
// ---------------------------------------------------------------------------

type ItemRef = { sku: string; qty: number };

type RawFulfillment = {
  items?: ItemRef[]; // default: every line item, full quantity
  status: ShipmentStatus;
  carrier: "UPS" | "USPS" | "FedEx" | "Canada Post";
  trackingNumber: string;
  shippedDaysAgo: number;
  /** Days from now; negative means the estimate has passed. */
  etaInDays?: number;
  deliveredDaysAgo?: number;
};

type RawRefund = { daysAgo: number; items?: ItemRef[]; note: string };

type RawOrder = {
  number: number;
  customer: CustomerKey;
  placedDaysAgo: number;
  items: ItemRef[];
  fulfillments?: RawFulfillment[];
  refunds?: RawRefund[];
  cancelledDaysAgo?: number;
  /** What this order is for. Documentation only. */
  scenario: string;
};

const RAW_ORDERS: RawOrder[] = [
  {
    number: 1001,
    customer: "emma",
    placedDaysAgo: 0,
    items: [{ sku: "RRS-M", qty: 1 }],
    scenario: "Unfulfilled, placed today: can be cancelled",
  },
  {
    number: 1002,
    customer: "marcus",
    placedDaysAgo: 1,
    items: [
      { sku: "TFP-L", qty: 1 },
      { sku: "AWB-ONE-SIZE", qty: 2 },
    ],
    scenario: "Unfulfilled: address change or cancellation still possible",
  },
  {
    number: 1003,
    customer: "priya",
    placedDaysAgo: 4,
    items: [{ sku: "SHP-30", qty: 1 }, { sku: "CMS-M", qty: 1 }],
    fulfillments: [
      { status: "in_transit", carrier: "UPS", trackingNumber: "1Z999AA10123456784", shippedDaysAgo: 2, etaInDays: 2 },
    ],
    scenario: "In transit with UPS tracking, on time",
  },
  {
    number: 1004,
    customer: "daniel",
    placedDaysAgo: 3,
    items: [{ sku: "BMT-M", qty: 2 }],
    fulfillments: [
      { status: "out_for_delivery", carrier: "USPS", trackingNumber: "9400111202555842332669", shippedDaysAgo: 2, etaInDays: 0 },
    ],
    scenario: "Out for delivery today",
  },
  {
    number: 1005,
    customer: "sofia",
    placedDaysAgo: 9,
    items: [{ sku: "NDP-ONE-SIZE", qty: 1 }],
    fulfillments: [
      { status: "delivered", carrier: "FedEx", trackingNumber: "771234567890", shippedDaysAgo: 8, etaInDays: -5, deliveredDaysAgo: 5 },
    ],
    scenario: "Delivered 5 days ago",
  },
  {
    number: 1006,
    customer: "liam",
    placedDaysAgo: 24,
    items: [{ sku: "TFS-L", qty: 1 }, { sku: "CTS-M", qty: 1 }],
    fulfillments: [
      { status: "delivered", carrier: "UPS", trackingNumber: "1Z999AA10198765432", shippedDaysAgo: 23, etaInDays: -20, deliveredDaysAgo: 20 },
    ],
    scenario: "Delivered 20 days ago: inside the 30-day return window",
  },
  {
    number: 1007,
    customer: "hannah",
    placedDaysAgo: 50,
    items: [{ sku: "TPV-M", qty: 1 }],
    fulfillments: [
      { status: "delivered", carrier: "USPS", trackingNumber: "9400111202555811112222", shippedDaysAgo: 49, etaInDays: -45, deliveredDaysAgo: 45 },
    ],
    scenario: "Delivered 45 days ago: outside the 30-day return window",
  },
  {
    number: 1008,
    customer: "priya",
    placedDaysAgo: 11,
    items: [{ sku: "RRS-S", qty: 1 }],
    fulfillments: [
      { status: "in_transit", carrier: "FedEx", trackingNumber: "771298765432", shippedDaysAgo: 9, etaInDays: -3 },
    ],
    scenario: "Delayed: in transit, estimated delivery passed 3 days ago",
  },
  {
    number: 1009,
    customer: "noah",
    placedDaysAgo: 6,
    items: [
      { sku: "TFP-M", qty: 1 },
      { sku: "SHP-32", qty: 1 },
    ],
    fulfillments: [
      {
        items: [{ sku: "TFP-M", qty: 1 }],
        status: "in_transit",
        carrier: "UPS",
        trackingNumber: "1Z999AA10155566677",
        shippedDaysAgo: 3,
        etaInDays: 1,
      },
    ],
    scenario: "Partially fulfilled: fleece shipped, pants not yet",
  },
  {
    number: 1010,
    customer: "olivia",
    placedDaysAgo: 30,
    items: [{ sku: "TFP-XS", qty: 1 }],
    fulfillments: [
      { status: "delivered", carrier: "USPS", trackingNumber: "9400111202555833334444", shippedDaysAgo: 29, etaInDays: -26, deliveredDaysAgo: 26 },
    ],
    refunds: [{ daysAgo: 15, items: [{ sku: "TFP-XS", qty: 1 }], note: "Returned: too small" }],
    scenario: "Already fully refunded after a return",
  },
  {
    number: 1011,
    customer: "daniel",
    placedDaysAgo: 35,
    items: [
      { sku: "CTS-L", qty: 1 },
      { sku: "CMS-L", qty: 2 },
    ],
    fulfillments: [
      { status: "delivered", carrier: "UPS", trackingNumber: "1Z999AA10144433322", shippedDaysAgo: 34, etaInDays: -31, deliveredDaysAgo: 31 },
    ],
    refunds: [{ daysAgo: 20, items: [{ sku: "CTS-L", qty: 1 }], note: "Returned: wrong size" }],
    scenario: "Partially refunded: shorts returned, socks kept",
  },
  {
    number: 1012,
    customer: "olivia",
    placedDaysAgo: 12,
    items: [{ sku: "TPV-S", qty: 1 }],
    cancelledDaysAgo: 12,
    refunds: [{ daysAgo: 12, items: [{ sku: "TPV-S", qty: 1 }], note: "Cancelled by customer before shipping" }],
    scenario: "Cancelled before fulfillment and refunded",
  },
  {
    number: 1013,
    customer: "lucas",
    placedDaysAgo: 7,
    items: [{ sku: "TFP-S", qty: 1 }, { sku: "AWB-ONE-SIZE", qty: 1 }],
    fulfillments: [
      { status: "in_transit", carrier: "Canada Post", trackingNumber: "7023210039414604", shippedDaysAgo: 5, etaInDays: 4 },
    ],
    scenario: "International (Canada) in transit, paid shipping",
  },
  {
    number: 1014,
    customer: "emma",
    placedDaysAgo: 18,
    items: [{ sku: "CMS-S", qty: 1 }, { sku: "AWB-ONE-SIZE", qty: 1 }],
    fulfillments: [
      { status: "delivered", carrier: "USPS", trackingNumber: "9400111202555855556666", shippedDaysAgo: 17, etaInDays: -14, deliveredDaysAgo: 14 },
    ],
    scenario: "Small order under $75: paid domestic shipping",
  },
  {
    number: 1015,
    customer: "hannah",
    placedDaysAgo: 5,
    items: [{ sku: "SHP-34", qty: 1 }],
    fulfillments: [
      { status: "delivered", carrier: "UPS", trackingNumber: "1Z999AA10177788899", shippedDaysAgo: 4, etaInDays: -2, deliveredDaysAgo: 2 },
    ],
    scenario: "Marked delivered 2 days ago (customer says it didn't arrive)",
  },
];

// ---------------------------------------------------------------------------
// Policies (shaped like `knowledge` rows)
// ---------------------------------------------------------------------------

export const SANDBOX_SHIPPING_COUNTRIES = [
  "United States", "Canada", "Mexico", "United Kingdom", "Ireland", "France",
  "Germany", "Netherlands", "Belgium", "Spain", "Italy", "Portugal", "Sweden",
  "Norway", "Denmark", "Finland", "Switzerland", "Austria", "Australia", "New Zealand",
] as const;

export type SandboxKnowledge = {
  kind: "policy" | "faq" | "brand";
  title: string;
  content: string;
};

export const SANDBOX_KNOWLEDGE: SandboxKnowledge[] = [
  {
    kind: "policy",
    title: "Returns and exchanges",
    content:
      "Unworn items with tags can be returned within 30 days of delivery for a full refund to the original payment method. Exchanges for a different size are free. Items delivered more than 30 days ago can't be returned. Refunds are issued within 5 business days of the return arriving at our warehouse.",
  },
  {
    kind: "policy",
    title: "Shipping",
    content:
      "Free standard shipping on US orders of $75 or more. US orders under $75 ship for a flat $8. Orders ship within 1 to 2 business days, and US delivery takes 3 to 5 business days after shipping. International shipping is a flat $25 and takes 7 to 14 business days.",
  },
  {
    kind: "policy",
    title: "International shipping",
    content: `We ship to 20 countries: ${SANDBOX_SHIPPING_COUNTRIES.join(", ")}. International customers are responsible for any import duties or taxes.`,
  },
  {
    kind: "policy",
    title: "Cancellations and address changes",
    content:
      "Orders can be cancelled or have their shipping address changed only before they ship. Once an order has shipped it can't be cancelled, but it can be returned within 30 days of delivery.",
  },
  {
    kind: "faq",
    title: "Lost or missing packages",
    content:
      "If tracking shows delivered but the package hasn't arrived, check around the property and with neighbors, and wait one business day, since carriers sometimes mark packages delivered early. If it still hasn't turned up, we'll open a claim with the carrier and send a replacement or refund.",
  },
  {
    kind: "faq",
    title: "Sizing",
    content:
      "Our tops and jackets fit true to size with room for a layer underneath. If you're between sizes, size up for jackets and down for merino tees. Hiking pants are sized by waist in inches with a 32 in. inseam.",
  },
  {
    kind: "brand",
    title: "About Harbor & Pine",
    content:
      "Harbor & Pine Outfitters makes durable outdoor clothing for hiking, camping and wet coastal weather. We use recycled and responsibly sourced materials wherever we can.",
  },
];

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export type SandboxStore = {
  name: string;
  products: ProductSummary[];
  orders: OrderDetail[];
  knowledge: SandboxKnowledge[];
};

const toCents = (amount: string) => Math.round(Number(amount) * 100);
const money = (cents: number): Money => ({ amount: (cents / 100).toFixed(2), currency: CURRENCY });
const sizeSlug = (size: string) => size.toUpperCase().replace(/\s+/g, "-");

function buildProducts(): { products: ProductSummary[]; bySku: Map<string, { product: RawProduct; size: string }> } {
  const bySku = new Map<string, { product: RawProduct; size: string }>();
  const products = RAW_PRODUCTS.map((p): ProductSummary => {
    const variants = Object.entries(p.stock).map(([size, inventory]) => {
      const sku = `${p.code}-${sizeSlug(size)}`;
      bySku.set(sku, { product: p, size });
      return {
        id: `gid://sandbox/ProductVariant/${sku}`,
        title: size,
        sku,
        price: money(toCents(p.price)),
        inventory,
        available: inventory > 0,
      };
    });
    const totalInventory = variants.reduce((n, v) => n + v.inventory, 0);
    return {
      id: `gid://sandbox/Product/${p.code}`,
      title: p.title,
      description: p.description,
      productType: p.productType,
      tags: p.tags,
      priceRange: { min: money(toCents(p.price)), max: money(toCents(p.price)) },
      variants,
      totalInventory,
      available: totalInventory > 0,
    };
  });
  return { products, bySku };
}

export function buildSandboxStore(now: Date = new Date()): SandboxStore {
  const day = 24 * 60 * 60 * 1000;
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * day).toISOString();
  const { products, bySku } = buildProducts();

  const orders = RAW_ORDERS.map((raw): OrderDetail => {
    const customer = CUSTOMERS[raw.customer];
    const lineId = (sku: string) => `gid://sandbox/LineItem/${raw.number}-${sku}`;

    const fulfilledQty = new Map<string, number>();
    const fulfillments = (raw.fulfillments ?? []).map((f, i): Fulfillment => {
      const items = f.items ?? raw.items;
      for (const it of items) fulfilledQty.set(it.sku, (fulfilledQty.get(it.sku) ?? 0) + it.qty);
      const eta = f.etaInDays === undefined ? null : at(-f.etaInDays);
      const inTransit = f.status === "in_transit" || f.status === "label_created";
      return {
        id: `gid://sandbox/Fulfillment/${raw.number}-${i + 1}`,
        status: f.status,
        carrier: f.carrier,
        trackingNumber: f.trackingNumber,
        trackingUrl: `https://track.example.com/${f.carrier.toLowerCase().replace(/\s+/g, "-")}/${f.trackingNumber}`,
        shippedAt: at(f.shippedDaysAgo),
        estimatedDeliveryAt: eta,
        deliveredAt: f.deliveredDaysAgo === undefined ? null : at(f.deliveredDaysAgo),
        delayed: inTransit && eta !== null && new Date(eta) < now,
        lineItems: items.map((it) => ({ lineItemId: lineId(it.sku), quantity: it.qty })),
      };
    });

    const refundedQty = new Map<string, number>();
    const refunds = (raw.refunds ?? []).map((r, i): Refund => {
      const items = r.items ?? raw.items;
      let cents = 0;
      for (const it of items) {
        refundedQty.set(it.sku, (refundedQty.get(it.sku) ?? 0) + it.qty);
        const variant = bySku.get(it.sku);
        if (!variant) throw new Error(`Unknown SKU ${it.sku}`);
        cents += toCents(variant.product.price) * it.qty;
      }
      return { id: `gid://sandbox/Refund/${raw.number}-${i + 1}`, createdAt: at(r.daysAgo), amount: money(cents), note: r.note };
    });

    const lineItems = raw.items.map((it): LineItem => {
      const variant = bySku.get(it.sku);
      if (!variant) throw new Error(`Unknown SKU ${it.sku}`);
      return {
        id: lineId(it.sku),
        title: variant.product.title,
        variantTitle: variant.size === "One size" ? null : variant.size,
        sku: it.sku,
        quantity: it.qty,
        refundableQuantity: it.qty - (refundedQty.get(it.sku) ?? 0),
        unfulfilledQuantity: it.qty - (fulfilledQty.get(it.sku) ?? 0),
        price: money(toCents(variant.product.price)),
      };
    });

    const subtotalCents = lineItems.reduce((n, li) => n + toCents(li.price.amount) * li.quantity, 0);
    const domestic = customer.address.countryCode === "US";
    const shippingCents = !domestic
      ? INTERNATIONAL_SHIPPING_CENTS
      : subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS
        ? 0
        : DOMESTIC_SHIPPING_CENTS;
    // A cancellation refunds shipping too.
    const cancelled = raw.cancelledDaysAgo !== undefined;
    const refundedCents =
      refunds.reduce((n, r) => n + toCents(r.amount.amount), 0) + (cancelled ? shippingCents : 0);
    if (cancelled && refunds[0]) {
      refunds[0].amount = money(toCents(refunds[0].amount.amount) + shippingCents);
    }
    const totalCents = subtotalCents + shippingCents;

    const unshipped = lineItems.reduce((n, li) => n + li.unfulfilledQuantity, 0);
    const shipped = lineItems.reduce((n, li) => n + li.quantity, 0) - unshipped;
    const fulfillmentStatus =
      shipped === 0 ? "unfulfilled" : unshipped === 0 ? "fulfilled" : "partially_fulfilled";
    const financialStatus =
      refundedCents === 0 ? "paid" : refundedCents >= totalCents ? "refunded" : "partially_refunded";

    return {
      id: `gid://sandbox/Order/${raw.number}`,
      name: `#${raw.number}`,
      email: customer.email,
      customerName: customer.name,
      createdAt: at(raw.placedDaysAgo),
      financialStatus,
      fulfillmentStatus,
      cancelledAt: cancelled ? at(raw.cancelledDaysAgo ?? 0) : null,
      total: money(totalCents),
      lineItems,
      fulfillments,
      refunds,
      shippingAddress: { name: customer.name, ...customer.address },
      subtotal: money(subtotalCents),
      shipping: money(shippingCents),
      totalRefunded: money(refundedCents),
      cancellable: !cancelled && fulfillments.length === 0,
    };
  });

  return { name: SANDBOX_STORE_NAME, products, orders, knowledge: SANDBOX_KNOWLEDGE };
}

/** Scenario label per order number, for the Test page and tests. */
export const SANDBOX_SCENARIOS: Record<string, string> = Object.fromEntries(
  RAW_ORDERS.map((o) => [`#${o.number}`, o.scenario]),
);

export const SANDBOX_CUSTOMERS = Object.values(CUSTOMERS).map(({ name, email }) => ({ name, email }));
