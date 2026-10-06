import { NextResponse, type NextRequest } from "next/server";

import { normalizeShopDomain, shopifyAppConfig, verifyWebhookHmac } from "@/lib/shopify/oauth";
import { handleShopifyWebhook } from "@/lib/shopify/webhooks";
import { createAdminClient } from "@/lib/supabase/admin";

/** Shopify webhooks (rule 5): HMAC of the raw body is verified before anything else. */
export async function POST(req: NextRequest) {
  const cfg = shopifyAppConfig();
  if (!cfg) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const raw = await req.text();
  // 401 on a bad or missing HMAC (Shopify's review checks this).
  if (!verifyWebhookHmac(raw, req.headers.get("x-shopify-hmac-sha256"), cfg.apiSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const topic = req.headers.get("x-shopify-topic") ?? "";
  const webhookId = req.headers.get("x-shopify-webhook-id") ?? req.headers.get("x-shopify-event-id") ?? "";
  const domain = normalizeShopDomain(req.headers.get("x-shopify-shop-domain") ?? "");
  if (!topic || !webhookId || !domain) return NextResponse.json({ error: "bad request" }, { status: 400 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  try {
    const result = await handleShopifyWebhook(createAdminClient(), { webhookId, topic, domain, body });
    return NextResponse.json({ status: result.status });
  } catch {
    // Topic and id only (rule 4). A 500 makes Shopify retry.
    console.error("shopify webhook failed", topic, webhookId);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
