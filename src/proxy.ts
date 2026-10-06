import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static assets and webhook/background endpoints (no user session there).
    "/((?!_next/static|_next/image|favicon.ico|api/inngest|api/shopify/webhooks|api/email/inbound|api/stripe/webhook|api/proxy|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
