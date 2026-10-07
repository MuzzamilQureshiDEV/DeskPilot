import { CheckCircle2, Plug, PlugZap, Sparkles, Store, TriangleAlert } from "lucide-react";
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

import { ConnectForm, DisconnectButton } from "./connect-form";

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

const STEPS = ["Click Connect", "Approve in Shopify", "You're connected"];

export default async function StorePage({ searchParams }: PageProps<"/store">) {
  const params = await searchParams;
  const shop = await getCurrentShop();
  const configured = shopifyAppConfig() !== null;
  const installUrl = configured ? serverEnv().SHOPIFY_INSTALL_URL : undefined;
  const agent = shop?.agentName ?? "your agent";

  const supabase = await createClient();
  const { data: status } = shop
    ? await supabase.rpc("shopify_connection_status", { p_shop_id: shop.id }).maybeSingle()
    : { data: null };

  const error = typeof params.error === "string" ? (ERRORS[params.error] ?? ERRORS.failed) : null;
  const connectedNow = params.connected === "1";
  const welcome = params.welcome === "1" && !status?.domain;

  return (
    <PageShell>
      <PageHeader title="Store" description="Your Shopify connection." />

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
            <CardTitle className="flex items-center gap-2">
              <Store className="size-5 text-primary" aria-hidden />
              {status.domain}
              {status.uninstalled_at ? (
                <Badge variant="destructive">Uninstalled in Shopify</Badge>
              ) : status.needs_reconnect ? (
                <Badge variant="destructive">Needs reconnecting</Badge>
              ) : (
                <Badge>Connected</Badge>
              )}
            </CardTitle>
            {status.connected_at && (
              <CardDescription>Connected {dateFormat.format(new Date(status.connected_at))}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {status.needs_reconnect && (
              <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 p-4">
                <p className="flex items-center gap-2 text-sm">
                  <TriangleAlert className="size-4 text-destructive" aria-hidden />
                  {status.uninstalled_at
                    ? `AstaDesk was uninstalled from this store in Shopify on ${dateFormat.format(new Date(status.uninstalled_at))}. Reconnect so ${agent} can see orders again. Customer data from this store is deleted 48 hours after uninstalling unless you reconnect.`
                    : `Shopify access expired. Reconnect so ${agent} can see live orders again.`}
                </p>
                {configured && <ConnectForm defaultDomain={status.domain} label="Reconnect" />}
              </div>
            )}
            {status.scopes && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">What {agent} can access</p>
                <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {status.scopes.split(",").map((s) => (
                    <li key={s}>{SCOPE_LABELS[s] ?? s}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <DisconnectButton />
              <p className="text-xs text-muted-foreground">
                To fully remove access, also uninstall AstaDesk from your Shopify admin under Settings, then Apps.
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
            {installUrl ? (
              <div className="flex flex-col gap-3">
                <a href={installUrl} className={buttonVariants({ size: "lg", className: "h-11 self-start px-6 text-base" })}>
                  <Plug aria-hidden />
                  Connect with Shopify
                </a>
                <p className="text-sm text-muted-foreground">
                  Shopify asks which store to connect, then brings you back here.
                </p>
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">Or enter your store address</summary>
                  <div className="mt-3">
                    <ConnectForm label="Connect" />
                  </div>
                </details>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <ConnectForm label="Connect with Shopify" />
                <p className="text-sm text-muted-foreground">
                  You&apos;ll go to Shopify to approve access, then come straight back here.
                </p>
              </div>
            )}

            {!configured && process.env.NODE_ENV !== "production" && (
              <p className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                <PlugZap className="mt-0.5 size-4 shrink-0" aria-hidden />
                Developer note (not shown to merchants): add SHOPIFY_API_KEY and SHOPIFY_API_SECRET to the server
                environment so this button can reach Shopify.
              </p>
            )}

            <ol className="flex flex-col gap-2 text-sm sm:flex-row sm:gap-6">
              {STEPS.map((step, i) => (
                <li key={step} className="flex items-center gap-2 text-muted-foreground">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            <details className="rounded-lg border px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium">Where do I find my store address?</summary>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
                <li>
                  Open your Shopify admin and copy the address from the browser. Links like{" "}
                  <code className="text-foreground">admin.shopify.com/store/your-store</code> work too.
                </li>
                <li>
                  Or go to <strong className="text-foreground">Settings → Domains</strong> in Shopify and use the address
                  ending in <code className="text-foreground">.myshopify.com</code>, not your custom domain.
                </li>
              </ul>
            </details>

            <p className="text-sm text-muted-foreground">
              You&apos;ll approve read access to orders, products, customers and shipments. Write access is used only to
              carry out refunds, cancellations or address changes you approve yourself.
            </p>
            <p className="text-sm">
              <Link href="/test" className="font-medium text-primary hover:underline">
                Skip for now and try {agent} on the sample store
              </Link>
            </p>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
