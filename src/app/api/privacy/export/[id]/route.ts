import { NextResponse, type NextRequest } from "next/server";

import { getCurrentShop } from "@/lib/auth/session";
import { buildCustomerExport } from "@/lib/privacy/export";
import { createClient } from "@/lib/supabase/server";

/** Download a customer's data for a privacy request (members only, through RLS). */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/privacy/export/[id]">) {
  const { id } = await ctx.params;
  const shop = await getCurrentShop();
  if (!shop || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const data = await buildCustomerExport(await createClient(), shop.id, id);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="customer-data-${id.slice(0, 8)}.json"`,
      "cache-control": "no-store",
    },
  });
}
