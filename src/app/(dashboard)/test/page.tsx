import { PlugZap } from "lucide-react";
import type { Metadata } from "next";

import { PageShell } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentShop } from "@/lib/auth/session";
import { aiConfigured } from "@/lib/ai/client";
import { buildSandboxStore, SANDBOX_SCENARIOS, SANDBOX_STORE_NAME } from "@/lib/sandbox/data";
import { SANDBOX_FREE_TEXT_DAILY_LIMIT } from "@/lib/sandbox/scenarios";
import { createClient } from "@/lib/supabase/server";

import { Playground } from "./playground";

export const metadata: Metadata = { title: "Test · AstaDesk" };

async function freeTextRunsToday(shopId: string): Promise<number> {
  const supabase = await createClient();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("kind", "sandbox_freetext")
    .gte("created_at", startOfDay.toISOString());
  return count ?? 0;
}

export default async function TestPage() {
  const shop = await getCurrentShop();
  const agentName = shop?.agentName ?? "Your agent";
  const aiReady = aiConfigured();
  const used = shop ? await freeTextRunsToday(shop.id) : SANDBOX_FREE_TEXT_DAILY_LIMIT;
  const orders = buildSandboxStore().orders;

  return (
    <PageShell>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Test {agentName}</h1>
          <span className="rounded-lg bg-warning/15 px-2.5 py-1 text-xs font-medium text-[color-mix(in_oklch,var(--warning),var(--foreground)_45%)]">
            Sandbox mode
          </span>
        </div>
        <p className="text-muted-foreground">
          See how {agentName} handles real support requests using a sample Shopify store. No Shopify or email connection required.
        </p>
        <p className="text-xs text-muted-foreground">
          Sample store · {SANDBOX_STORE_NAME}. It has sample customers and orders. No real store, inbox or customer is connected, and
          nothing here can change or email anyone real.
        </p>
      </div>

      {!aiReady && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-dashed p-4">
          <PlugZap className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
          <div className="text-sm">
            <p className="font-medium">The AI isn&apos;t connected yet</p>
            <p className="text-muted-foreground">
              Test runs turn on once an Anthropic API key is added to the server settings.
            </p>
          </div>
        </div>
      )}

      <Playground
        agentName={agentName}
        aiReady={aiReady && !!shop}
        initialRemaining={Math.max(SANDBOX_FREE_TEXT_DAILY_LIMIT - used, 0)}
      />

      <Card>
        <CardHeader>
          <CardTitle>Sample store orders</CardTitle>
          <CardDescription>
            Use these when writing your own messages. Write as the customer who placed the order. {agentName} won&apos;t
            share an order with anyone else.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden md:table-cell">Situation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell>
                    {o.customerName}
                    <span className="block text-xs text-muted-foreground">{o.email}</span>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal text-muted-foreground md:table-cell">
                    {SANDBOX_SCENARIOS[o.name]}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
