// One-time Stripe setup (safe to re-run). Creates, in the account of
// STRIPE_SECRET_KEY:
//   - Starter and Growth products with monthly prices (found later by lookup key)
//   - a Customer Portal configuration (switch plan, cancel at period end, card, invoices)
//   - the webhook endpoint for the live site (prints its signing secret once)
//
//   npm run stripe:setup [-- --webhook-url https://example.com/api/stripe/webhook]

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Missing STRIPE_SECRET_KEY (.env.local).");
  process.exit(1);
}
const urlFlag = process.argv.indexOf("--webhook-url");
const webhookUrl = urlFlag > -1 ? process.argv[urlFlag + 1] : "https://deskpilot-seven.vercel.app/api/stripe/webhook";
if (!webhookUrl?.startsWith("https://")) {
  console.error("The webhook URL must be https.");
  process.exit(1);
}

const stripe = new Stripe(key);
const mode = key.startsWith("sk_live_") ? "LIVE" : "TEST";
console.log(`Stripe ${mode} mode`);

// Kept in sync with PRICE_LOOKUP_KEYS in src/lib/billing/plans.ts.
const PLANS = [
  { lookupKey: "deskpilot_starter_monthly", name: "AstaDesk Starter", description: "100 AI replies a month", amount: 2900 },
  { lookupKey: "deskpilot_growth_monthly", name: "AstaDesk Growth", description: "250 AI replies a month, autopilot", amount: 7900 },
];
const EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
];

// 1. Products + prices.
const existing = await stripe.prices.list({ lookup_keys: PLANS.map((p) => p.lookupKey), active: true, expand: ["data.product"] });
const portalProducts: { product: string; prices: string[] }[] = [];
for (const plan of PLANS) {
  let price = existing.data.find((p) => p.lookup_key === plan.lookupKey);
  if (price) {
    console.log(`✓ ${plan.name}: price exists (${(price.unit_amount ?? 0) / 100} ${price.currency})`);
  } else {
    const product = await stripe.products.create({ name: plan.name, description: plan.description, metadata: { app: "deskpilot" } });
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.amount,
      currency: "usd",
      recurring: { interval: "month" },
      lookup_key: plan.lookupKey,
      transfer_lookup_key: true,
    });
    console.log(`+ ${plan.name}: created $${plan.amount / 100}/month`);
  }
  const productId = typeof price.product === "string" ? price.product : price.product.id;
  portalProducts.push({ product: productId, prices: [price.id] });
}

// 2. Customer Portal configuration.
const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
  invoice_history: { enabled: true },
  payment_method_update: { enabled: true },
  customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id"] },
  subscription_cancel: { enabled: true, mode: "at_period_end" },
  subscription_update: {
    enabled: true,
    default_allowed_updates: ["price"],
    products: portalProducts,
    proration_behavior: "create_prorations",
  },
};
const configs = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
const ours = configs.data.find((c) => c.metadata?.app === "deskpilot");
if (ours) {
  await stripe.billingPortal.configurations.update(ours.id, { features });
  console.log(`✓ Customer Portal: updated ${ours.id}`);
} else {
  const created = await stripe.billingPortal.configurations.create({
    features,
    business_profile: { headline: "Manage your AstaDesk plan" },
    metadata: { app: "deskpilot" },
  });
  console.log(`+ Customer Portal: created ${created.id}`);
}

// 3. Webhook endpoint.
const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
const hook = endpoints.data.find((e) => e.url === webhookUrl);
if (hook) {
  await stripe.webhookEndpoints.update(hook.id, { enabled_events: EVENTS, disabled: false });
  console.log(`✓ Webhook: updated ${hook.id} (its signing secret was printed when it was created)`);
} else {
  const created = await stripe.webhookEndpoints.create({ url: webhookUrl, enabled_events: EVENTS, description: "AstaDesk billing" });
  console.log(`+ Webhook: created ${created.id} → ${webhookUrl}`);
  console.log(`\nSTRIPE_WEBHOOK_SECRET=${created.secret}\n(Save this in .env.local and Vercel. It is shown only once.)`);
}
