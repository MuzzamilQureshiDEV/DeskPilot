import { NextResponse, type NextRequest } from "next/server";

import { enqueueMessage } from "@/inngest/events";
import { chatShop, postChat, readChat, type ChatError } from "@/lib/chat/handlers";
import { verifyProxyRequest } from "@/lib/chat/proxy-auth";
import { getSchema, postSchema } from "@/lib/chat/session";
import { normalizeShopDomain, shopifyAppConfig } from "@/lib/shopify/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

// Storefront chat via Shopify's App Proxy: {shop}/apps/deskpilot/* → /api/proxy/*.
// Shopify signs every request; we verify it before touching anything.

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

type Verified = { shopId: string; params: URLSearchParams } | NextResponse;

async function verify(req: NextRequest, path: string[]): Promise<Verified> {
  const cfg = shopifyAppConfig();
  if (!cfg) return json({ error: "Chat isn't available right now." }, 503);
  const params = req.nextUrl.searchParams;
  if (!verifyProxyRequest(params, cfg.apiSecret)) return json({ error: "unauthorized" }, 401);
  if (path.join("/") !== "messages") return json({ error: "not found" }, 404);
  const domain = normalizeShopDomain(params.get("shop") ?? "");
  if (!domain) return json({ error: "unauthorized" }, 401);
  const shop = await chatShop(createAdminClient(), domain);
  if ("error" in shop) return json({ error: shop.error }, shop.status);
  return { shopId: shop.id, params };
}

const isError = (r: object): r is ChatError => "error" in r;

export async function GET(req: NextRequest, ctx: RouteContext<"/api/proxy/[...path]">) {
  const v = await verify(req, (await ctx.params).path);
  if (v instanceof NextResponse) return v;
  const parsed = getSchema.safeParse({ token: v.params.get("token"), after: v.params.get("after") || undefined });
  if (!parsed.success) return json({ error: "bad request" }, 400);
  return json(await readChat(createAdminClient(), v.shopId, parsed.data.token, parsed.data.after));
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/proxy/[...path]">) {
  const v = await verify(req, (await ctx.params).path);
  if (v instanceof NextResponse) return v;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "bad request" }, 400);
  try {
    const result = await postChat(createAdminClient(), v.shopId, parsed.data, { enqueue: enqueueMessage });
    return isError(result) ? json({ error: result.error }, result.status) : json(result);
  } catch {
    console.error("chat: post failed", v.shopId);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
