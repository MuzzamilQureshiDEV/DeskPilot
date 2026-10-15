import { ArrowRight, CheckCircle2, Mail, Plug, ScrollText, Sparkles, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader, PageShell } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentShop } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { shopifyAppConfig } from "@/lib/shopify/oauth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { ConnectForm, DisconnectButton } from "./connect-form";
import { OwnAppConnectForm, StoreNameForm, TestConnectionButton } from "./store-widgets";

export const metadata: Metadata = { title: "Store · AstaDesk" };

const ERRORS: Record<string, string> = {
  not_configured: "Connecting Shopify isn't available just yet. Please try again a little later.",
  no_shop: "Your account isn't linked to a AstaDesk store.",
  invalid_domain: "That doesn't look like a Shopify store address. Use the form your-store.myshopify.com.",
  already_connected: "A store is already connected. Disconnect it first.",
  invalid: "The connection couldn't be verified. Please start again from this page.",
  session: "Your session expired during the connection. Log in and try again.",
  denied: "The connection was cancelled in Shopify.",
  scopes: "Some required permissions weren't granted. Connect again and approve all of them.",
  domain_taken: "That Shopify store is already connected to another AstaDesk account.",
  failed: "Shopify didn't complete the connection. Please try again.",
};

const SCOPE_LABELS: Record<string, string> = {
  read_orders: "Read orders",
  write_orders: "Update orders (only after you approve a request)",
  read_products: "Read products and stock",
  read_customers: "Read customers",
  read_fulfillments: "Read shipments and tracking",
  read_merchant_managed_fulfillment_orders: "Read fulfillment orders",
  read_all_orders: "Read orders older than 60 days",
};

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

/** Start of the "last 30 days" conversation count. */
function thirtyDaysAgo(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString();
}

export default async function StorePage({ searchParams }: PageProps<"/store">) {
  const params = await searchParams;
  const shop = await getCurrentShop();
  const configured = shopifyAppConfig() !== null;
  const installUrl = configured ? serverEnv().SHOPIFY_INSTALL_URL : undefined;
  const agent = shop?.agentName ?? "your agent";

  const supabase = await createClient();
  const since = thirtyDaysAgo();
  const [{ data: status }, { data: row }, { count: conversations }, { count: policies }] = shop
    ? await Promise.all([
        supabase.rpc("shopify_connection_status", { p_shop_id: shop.id }).maybeSingle(),
        supabase.from("shops").select("setup").eq("id", shop.id).single(),
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("shop_id", shop.id).gte("created_at", since),
        supabase.from("knowledge").select("id", { count: "exact", head: true }).eq("shop_id", shop.id).eq("kind", "policy"),
      ])
    : [{ data: null }, { data: null }, { count: 0 }, { count: 0 }];
  const setup = row?.setup && typeof row.setup === "object" && !Array.isArray(row.setup) ? row.setup : {};
  const emailConnected = (setup as Record<string, unknown>).email_connected === true;
  const state = !status?.domain ? "none" : status.needs_reconnect ? "reconnect" : "connected";
  const STATE = {
    none: { label: "Not connected", dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
    reconnect: { label: status?.uninstalled_at ? "Uninstalled in Shopify" : "Needs reconnecting", dot: "bg-destructive", text: "text-destructive" },
    connected: { label: "Connected", dot: "bg-success", text: "text-success" },
  }[state];

  const error = typeof params.error === "string" ? (ERRORS[params.error] ?? ERRORS.failed) : null;
  const connectedNow = params.connected === "1";
  const welcome = params.welcome === "1" && !status?.domain;

  return (
    <PageShell>
      <PageHeader title="Your Shopify store" description={`Your store's details and the connections ${agent} works with.`} />

      {shop && (
        <section aria-label="Store overview" className="overflow-hidden rounded-2xl border bg-card shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
            <div className="flex flex-col gap-1">
              <p className="flex items-center gap-2 text-lg font-semibold">
                <span className={cn("size-2.5 rounded-full", STATE.dot)} aria-hidden />
                {shop.name}
              </p>
              <p className="font-mono text-sm text-muted-foreground">{status?.domain ?? "No store connected"}</p>
            </div>
            <div className="flex flex-col items-end gap-1 text-sm">
              <p>
                <span className="font-semibold tabular-nums">{conversations ?? 0}</span>{" "}
                <span className="text-muted-foreground">conversations · last 30 days</span>
              </p>
              <p className={cn("flex items-center gap-1.5 font-medium", STATE.text)}>
                <span className={cn("size-2 rounded-full", STATE.dot)} aria-hidden />
                {STATE.label}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t bg-muted/30 px-5 py-4 text-sm sm:px-6 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Store</dt>
              <dd className="truncate font-mono">{status?.domain ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Connected since</dt>
              <dd>{status?.connected_at ? dateFormat.format(new Date(status.connected_at)) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Support email</dt>
              <dd>{emailConnected ? "Receiving email" : "Not set up yet"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Store policies</dt>
              <dd>{policies ? `${policies} added` : "None yet"}</dd>
            </div>
          </dl>
          <div className="border-t p-5 sm:p-6">
            <StoreNameForm initial={shop.name} agentName={shop.agentName} />
          </div>
        </section>
      )}

      {welcome && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <strong>Welcome to AstaDesk!</strong> Connect your Shopify store so {agent} can answer with real order
            data. It takes about a minute.
          </span>
        </p>
      )}

      {connectedNow && status?.domain && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
          <CheckCircle2 className="size-4" aria-hidden />
          Shopify connected. {agent} can now look up your orders and products.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {status?.domain ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Plug className="size-5 text-primary" aria-hidden />
              Shopify connection
              {status.uninstalled_at ? (
                <Badge variant="destructive">Uninstalled in Shopify</Badge>
              ) : status.needs_reconnect ? (
                <Badge variant="destructive">Needs reconnecting</Badge>
              ) : (
                <Badge>Connected</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Check that {agent} can read your products and orders. The test only reads; it never changes anything in Shopify.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {status.needs_reconnect && (
              <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 p-4">
                <p className="flex items-center gap-2 text-sm">
                  <TriangleAlert className="size-4 text-destructive" aria-hidden />
                  {status.uninstalled_at
                    ? `AstaDesk was uninstalled from this store in Shopify on ${dateFormat.format(new Date(status.uninstalled_at))}. Reconnect so ${agent} can see orders again. Customer data from this store is deleted 48 hours after uninstalling unless you reconnect.`
                    : status.auth === "own_app"
                      ? `Shopify stopped accepting your app's credentials (the app may have been uninstalled or its secret changed). Paste the current Client ID and secret to reconnect.`
                      : `Shopify access expired. Reconnect so ${agent} can see live orders again.`}
                </p>
                {status.auth === "own_app" ? (
                  <OwnAppConnectForm defaultDomain={status.domain} label="Reconnect" />
                ) : (
                  configured && <ConnectForm defaultDomain={status.domain} label="Reconnect" />
                )}
              </div>
            )}
            {!status.needs_reconnect && <TestConnectionButton />}
            {status.scopes && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">What {agent} can access</p>
                <ul className="flex flex-wrap gap-2">
                  {status.scopes.split(",").map((s) => (
                    <li key={s} className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
                      {SCOPE_LABELS[s] ?? s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <DisconnectButton />
              <p className="text-xs text-muted-foreground">
                {status.auth === "own_app"
                  ? "To fully remove access, also uninstall or delete your private AstaDesk app in your Shopify Dev Dashboard."
                  : "To fully remove access, also uninstall AstaDesk from your Shopify admin under Settings, then Apps."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="size-5 text-primary" aria-hidden />
              Connect your Shopify store
            </CardTitle>
            <CardDescription>
              {agent} uses your store data to answer questions about orders, tracking and products. Until you connect,
              the Test page uses a sample store.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <OwnAppConnectForm />

            <details className="rounded-xl border px-4 py-3 text-sm">
              <summary className="cursor-pointer font-medium">Installed AstaDesk from the Shopify App Store instead?</summary>
              <div className="mt-3 flex flex-col gap-3">
                <p className="text-muted-foreground">If AstaDesk is already installed in your Shopify admin, connect with one click.</p>
                {installUrl ? (
                  <a href={installUrl} className={buttonVariants({ variant: "outline", className: "self-start" })}>
                    <Plug aria-hidden />
                    Connect with Shopify
                  </a>
                ) : (
                  configured && <ConnectForm label="Connect with Shopify" />
                )}
              </div>
            </details>

            <p className="text-sm text-muted-foreground">
              {agent} reads orders, products, customers and shipments. Write access is used only to carry out refunds, cancellations or
              address changes you approve yourself.
            </p>
            <p className="text-sm">
              <Link href="/test" className="font-medium text-primary hover:underline">
                Skip for now and try {agent} on the sample store
              </Link>
            </p>
          </CardContent>
        </Card>
      )}

      {shop && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="size-5 text-primary" aria-hidden />
                Email inbox
              </CardTitle>
              <CardDescription>
                {emailConnected
                  ? `Customer emails reach AstaDesk and ${agent} replies from support@astadesk.com.`
                  : "Forward your support inbox (Gmail or Outlook) so customer emails land in AstaDesk."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>
                {emailConnected ? "Email settings" : "Set up email forwarding"}
                <ArrowRight aria-hidden />
              </Link>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ScrollText className="size-5 text-primary" aria-hidden />
                Refund and return policy
              </CardTitle>
              <CardDescription>
                {agent} quotes your policies word for word and checks them before proposing a refund. Refunds always wait for your approval.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/train?kind=policy" className={buttonVariants({ variant: "outline", size: "sm" })}>
                {policies ? "Edit policies" : "Add your policies"}
                <ArrowRight aria-hidden />
              </Link>
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
