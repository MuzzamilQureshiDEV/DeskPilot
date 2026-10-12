import { NextResponse, type NextRequest } from "next/server";

import { paypalConfig, paypalFetch, type PayPalSubscription } from "@/lib/paypal/client";
import { handlePayPalEvent, type PayPalEvent } from "@/lib/paypal/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

// PayPal webhook (rule 5): every event is verified with PayPal's
// verify-webhook-signature API (our webhook id + PayPal's signature headers)
// before anything else happens.

const HEADERS = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"] as const;

export async function POST(req: NextRequest) {
  const cfg = paypalConfig();
  if (!cfg?.webhookId) return NextResponse.json({ error: "billing not configured" }, { status: 503 });

  const h = Object.fromEntries(HEADERS.map((k) => [k, req.headers.get(k)]));
  if (HEADERS.some((k) => !h[k])) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const raw = await req.text();
  let event: PayPalEvent;
  try {
    event = JSON.parse(raw) as PayPalEvent;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  let verified = false;
  try {
    const res = await paypalFetch<{ verification_status: string }>(cfg, "/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: {
        auth_algo: h["paypal-auth-algo"],
        cert_url: h["paypal-cert-url"],
        transmission_id: h["paypal-transmission-id"],
        transmission_sig: h["paypal-transmission-sig"],
        transmission_time: h["paypal-transmission-time"],
        webhook_id: cfg.webhookId,
        webhook_event: event,
      },
    });
    verified = res.verification_status === "SUCCESS";
  } catch {
    console.error("paypal webhook: verification call failed");
    return NextResponse.json({ error: "verification unavailable" }, { status: 500 });
  }
  if (!verified) return NextResponse.json({ error: "invalid signature" }, { status: 400 });

  try {
    const result = await handlePayPalEvent(createAdminClient(), event, {
      getSubscription: (id) => paypalFetch<PayPalSubscription>(cfg, `/v1/billing/subscriptions/${encodeURIComponent(id)}`),
      plans: cfg.plans,
    });
    return NextResponse.json(result);
  } catch {
    console.error("paypal webhook failed", event.id, event.event_type);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
