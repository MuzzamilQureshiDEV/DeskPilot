// One-time PayPal setup (safe to re-run). Creates, in the PayPal account of the
// given credentials:
//   - the "AstaDesk" product
//   - monthly plans "AstaDesk Starter" ($29) and "AstaDesk Growth" ($79)
//   - the webhook for subscription + payment events
// Prints the env values to save (plan ids, webhook id). Never prints secrets.
//
//   npm run paypal:setup               (sandbox: PAYPAL_SANDBOX_CLIENT_ID/SECRET)
//   npm run paypal:setup -- --live     (live:    PAYPAL_LIVE_CLIENT_ID/SECRET)

const live = process.argv.includes("--live");
const env = process.env;
const clientId = live ? env.PAYPAL_LIVE_CLIENT_ID : env.PAYPAL_SANDBOX_CLIENT_ID;
const secret = live ? env.PAYPAL_LIVE_CLIENT_SECRET : env.PAYPAL_SANDBOX_CLIENT_SECRET;
if (!clientId || !secret) {
  console.error(`Missing ${live ? "PAYPAL_LIVE" : "PAYPAL_SANDBOX"}_CLIENT_ID / _CLIENT_SECRET in .env.local.`);
  process.exit(1);
}
const BASE = live ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const WEBHOOK_URL = "https://www.astadesk.com/api/paypal/webhook";
const EVENTS = [
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "BILLING.SUBSCRIPTION.RE-ACTIVATED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
  "PAYMENT.SALE.COMPLETED",
];
const PLANS = [
  { key: "STARTER", name: "AstaDesk Starter", description: "100 AI replies a month", price: "29.00" },
  { key: "GROWTH", name: "AstaDesk Growth", description: "250 AI replies a month, autopilot", price: "79.00" },
];

const tokenRes = await fetch(`${BASE}/v1/oauth2/token`, {
  method: "POST",
  headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
  body: "grant_type=client_credentials",
});
if (!tokenRes.ok) {
  console.error(`PayPal rejected the credentials (${tokenRes.status}). Check the Client ID and Secret.`);
  process.exit(1);
}
const { access_token: token } = (await tokenRes.json()) as { access_token: string };

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json", Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

console.log(`PayPal ${live ? "LIVE" : "SANDBOX"}`);

// 1. Product
type Product = { id: string; name: string };
const products = await api<{ products?: Product[] }>("/v1/catalogs/products?page_size=20");
let product = products.products?.find((p) => p.name === "AstaDesk");
if (product) console.log(`✓ product ${product.id}`);
else {
  product = await api<Product>("/v1/catalogs/products", "POST", { name: "AstaDesk", description: "AI customer support for Shopify stores", type: "SERVICE", category: "SOFTWARE", home_url: "https://www.astadesk.com" });
  console.log(`+ product ${product.id}`);
}

// 2. Plans
type Plan = { id: string; name: string; status: string };
const existing = await api<{ plans?: Plan[] }>(`/v1/billing/plans?product_id=${product.id}&page_size=20`);
const planIds: Record<string, string> = {};
for (const p of PLANS) {
  let plan = existing.plans?.find((x) => x.name === p.name && x.status === "ACTIVE");
  if (plan) console.log(`✓ plan ${p.name} ${plan.id}`);
  else {
    plan = await api<Plan>("/v1/billing/plans", "POST", {
      product_id: product.id,
      name: p.name,
      description: p.description,
      status: "ACTIVE",
      billing_cycles: [
        { frequency: { interval_unit: "MONTH", interval_count: 1 }, tenure_type: "REGULAR", sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: p.price, currency_code: "USD" } } },
      ],
      payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: "CONTINUE", payment_failure_threshold: 3 },
    });
    console.log(`+ plan ${p.name} $${p.price}/month ${plan.id}`);
  }
  planIds[p.key] = plan.id;
}

// 3. Webhook
type Hook = { id: string; url: string };
const hooks = await api<{ webhooks?: Hook[] }>("/v1/notifications/webhooks");
let hook = hooks.webhooks?.find((h) => h.url === WEBHOOK_URL);
if (hook) console.log(`✓ webhook ${hook.id}`);
else {
  hook = await api<Hook>("/v1/notifications/webhooks", "POST", { url: WEBHOOK_URL, event_types: EVENTS.map((name) => ({ name })) });
  console.log(`+ webhook ${hook.id} → ${WEBHOOK_URL}`);
}

console.log("\nSave these:");
console.log(`PAYPAL_ENV=${live ? "live" : "sandbox"}`);
console.log(`PAYPAL_PLAN_STARTER=${planIds.STARTER}`);
console.log(`PAYPAL_PLAN_GROWTH=${planIds.GROWTH}`);
console.log(`PAYPAL_WEBHOOK_ID=${hook.id}`);
