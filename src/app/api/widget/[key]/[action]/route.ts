import { NextResponse, type NextRequest } from "next/server";

import { enqueueMessage } from "@/inngest/events";
import { postChat, readChat, type ChatError } from "@/lib/chat/handlers";
import { getSchema, postSchema } from "@/lib/chat/session";
import { widgetSettings } from "@/lib/settings/widget";
import { createAdminClient } from "@/lib/supabase/admin";

// Storefront chat for the copy-paste embed (stores connected with their own
// Shopify app, so there's no app proxy). The store is found by its public
// widget key. Same handlers and rate limits as the app-proxy route; a shopper
// only ever sees their own thread (their secret visitor token).

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

const json = (body: unknown, status = 200, cache = "no-store") =>
  NextResponse.json(body, { status, headers: { ...CORS, "cache-control": cache } });

const KEY = /^[A-Za-z0-9_-]{16,64}$/;

async function shopFor(key: string): Promise<string | null> {
  if (!KEY.test(key)) return null;
  const { data } = await createAdminClient().from("shops").select("id").eq("widget_key", key).maybeSingle();
  return data?.id ?? null;
}

const isError = (r: object): r is ChatError => "error" in r;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/widget/[key]/[action]">) {
  const { key, action } = await ctx.params;
  if (action !== "messages" && action !== "config") return json({ error: "not found" }, 404);
  const shopId = await shopFor(key);
  if (!shopId) return json({ error: "This store isn't set up for chat." }, 404);

  if (action === "config") {
    const { data } = await createAdminClient().from("shops").select("widget").eq("id", shopId).maybeSingle();
    return json(widgetSettings(data?.widget), 200, "public, max-age=300");
  }
  const params = req.nextUrl.searchParams;
  const parsed = getSchema.safeParse({ token: params.get("token"), after: params.get("after") || undefined });
  if (!parsed.success) return json({ error: "bad request" }, 400);
  return json(await readChat(createAdminClient(), shopId, parsed.data.token, parsed.data.after));
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/widget/[key]/[action]">) {
  const { key, action } = await ctx.params;
  if (action !== "messages") return json({ error: "not found" }, 404);
  const shopId = await shopFor(key);
  if (!shopId) return json({ error: "This store isn't set up for chat." }, 404);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "bad request" }, 400);
  try {
    const result = await postChat(createAdminClient(), shopId, parsed.data, { enqueue: enqueueMessage });
    return isError(result) ? json({ error: result.error }, result.status) : json(result);
  } catch {
    console.error("widget chat: post failed", shopId);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
