import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env";
import { stripeClient } from "@/lib/stripe/client";
import { handleStripeEvent } from "@/lib/stripe/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

/** Stripe webhook (rule 5): signature verified on the raw body before anything else. */
export async function POST(req: NextRequest) {
  const stripe = stripeClient();
  const secret = serverEnv().STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!stripe || !secret) return NextResponse.json({ error: "billing not configured" }, { status: 503 });
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  let event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    const result = await handleStripeEvent(createAdminClient(), event, {
      retrieveSubscription: (id) => stripe.subscriptions.retrieve(id),
    });
    return NextResponse.json(result);
  } catch {
    // Ids and types only (rule 4). A 500 makes Stripe retry.
    console.error("stripe webhook failed", event.id, event.type);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
