import { shopifyGraphql } from "@/lib/shopify/client";

// Per-store webhook subscriptions made from code. The privacy (compliance)
// webhooks can't be subscribed this way; they're set in the app's settings.

export const SHOPIFY_WEBHOOK_PATH = "/api/shopify/webhooks";

const CREATE = `mutation Register($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
    webhookSubscription { id }
    userErrors { field message }
  }
}`;

type CreateResult = {
  webhookSubscriptionCreate: { webhookSubscription: { id: string } | null; userErrors: { field: string[] | null; message: string }[] };
};

/** Subscribe the store's app/uninstalled webhook. Idempotent: "already taken" counts as done. */
export async function registerUninstallWebhook(
  conn: { domain: string; accessToken: string },
  appUrl: string,
  fetchFn?: typeof fetch,
): Promise<"created" | "exists"> {
  const res = await shopifyGraphql<CreateResult>({
    ...conn,
    fetchFn,
    query: CREATE,
    variables: { topic: "APP_UNINSTALLED", sub: { uri: `${appUrl.replace(/\/$/, "")}${SHOPIFY_WEBHOOK_PATH}` } },
  });
  const { webhookSubscription, userErrors } = res.webhookSubscriptionCreate;
  if (webhookSubscription) return "created";
  if (userErrors.some((e) => /taken|already/i.test(e.message))) return "exists";
  throw new Error(`Shopify rejected the webhook subscription: ${userErrors.map((e) => e.message).join("; ")}`);
}
