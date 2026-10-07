import { cookies } from "next/headers";
import Link from "next/link";

import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { PageTitle } from "@/components/dashboard/page-title";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getCurrentShop, requireUser } from "@/lib/auth/session";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { LiveRefresh } from "@/components/dashboard/live-refresh";
import { loadAiAccess } from "@/lib/billing/usage";
import { createClient } from "@/lib/supabase/server";

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const shop = await getCurrentShop();
  const supabase = await createClient();
  const { data: connection } = shop
    ? await supabase.rpc("shopify_connection_status", { p_shop_id: shop.id }).maybeSingle()
    : { data: null };
  const storeConnected = !!connection?.domain && !connection.needs_reconnect;
  const [{ count: escalations }, { count: approvals }] = shop
    ? await Promise.all([
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("shop_id", shop.id).eq("status", "escalated"),
        supabase.from("action_requests").select("id", { count: "exact", head: true }).eq("shop_id", shop.id).eq("status", "pending"),
      ])
    : [{ count: 0 }, { count: 0 }];
  // Rule 7: over the limit (or trial ended), messages still arrive but the AI stops.
  const access = shop ? (await loadAiAccess(supabase, shop.id, shop, new Date())).access : null;
  const pastDue = shop?.subscriptionStatus === "past_due";
  // Remember collapsed/expanded across reloads (cookie set by SidebarProvider).
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar
        shopName={shop?.name ?? null}
        email={user.email}
        storeConnected={storeConnected}
        counts={{ escalations: escalations ?? 0, approvals: approvals ?? 0 }}
      />
      {shop && <LiveRefresh shopId={shop.id} />}
      <CommandPalette />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4 data-vertical:self-center" />
          <PageTitle />
          {shop?.plan === "trial" && shop.trialEndsAt && (
            <Badge variant="secondary" className="ml-auto">
              Trial ends {dateFormat.format(new Date(shop.trialEndsAt))}
            </Badge>
          )}
        </header>
        {access && !access.allowed && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
            <span>
              {access.reason === "trial_ended"
                ? "Your free trial has ended."
                : access.reason === "subscription_inactive"
                  ? "Your subscription isn't active."
                  : "You've used all your AI replies for this billing period."}{" "}
              New messages still arrive, but {shop?.agentName ?? "your agent"} won&apos;t draft replies until{" "}
              {access.reason === "usage_limit" ? "you upgrade or the period resets" : "you choose a plan"}.
            </span>
            <Link href="/billing" className="font-medium underline underline-offset-2">
              See plans
            </Link>
          </div>
        )}
        {access?.allowed && pastDue && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
            <span>Your last payment failed. Update your card to keep {shop?.agentName ?? "your agent"} running.</span>
            <Link href="/billing" className="font-medium underline underline-offset-2">
              Update card
            </Link>
          </div>
        )}
        <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
