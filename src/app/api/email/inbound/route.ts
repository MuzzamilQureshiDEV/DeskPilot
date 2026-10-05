import { NextResponse, type NextRequest } from "next/server";

import { enqueueMessage } from "@/inngest/events";
import { handleInbound, postmarkInboundSchema } from "@/lib/email/inbound";
import { authorized } from "@/lib/email/webhook-auth";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/** Postmark inbound webhook (CLAUDE.md §9). Verified by Basic auth before anything else. */
export async function POST(req: NextRequest) {
  const env = serverEnv();
  // 403 tells Postmark to stop retrying (bad credentials won't fix themselves).
  if (!authorized(req.headers.get("authorization"), env.POSTMARK_INBOUND_TOKEN)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = postmarkInboundSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid payload" }, { status: 400 });

  const result = await handleInbound(createAdminClient(), parsed.data, {
    ownAddresses: [env.POSTMARK_FROM_EMAIL, env.POSTMARK_INBOUND_ADDRESS].filter((a): a is string => !!a),
    enqueue: enqueueMessage,
  });
  return NextResponse.json({ status: result.status });
}
