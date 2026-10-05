import {
  CheckCircle2,
  Circle,
  CircleCheckBig,
  Gauge,
  Inbox,
  MessageSquareText,
  ShieldCheck,
  Store,
  TriangleAlert,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageHeader, PageShell } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentShop } from "@/lib/auth/session";
import { aiAccess, PLANS, planOf } from "@/lib/billing/plans";
import { aiRepliesThisPeriod } from "@/lib/billing/usage";
import { buildChecklist, checklistProgress } from "@/lib/home/checklist";
import { loadHomeStats, STATS_WINDOW_DAYS } from "@/lib/home/stats";
import { asStatus, NEEDS_ATTENTION, STATUS_LABEL, STATUS_VARIANT, timeAgo } from "@/lib/inbox/labels";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Home · DeskPilot" };

const flag = (setup: unknown, key: string) =>
  !!setup && typeof setup === "object" && !Array.isArray(setup) && (setup as Record<string, unknown>)[key] === true;

export default async function HomePage() {
  const shop = await getCurrentShop();
  if (!shop) {
    return (
      <PageShell>
        <EmptyState icon={Store} title="No store yet" description="Your account isn't linked to a store. Contact support if this looks wrong." />
      </PageShell>
    );
  }

  const supabase = await createClient();
  const now = new Date();
  const [{ data: connection }, { count: policyCount }, { data: shopRow }, { count: testRuns }, used, stats, { data: attention }] =
    await Promise.all([
      supabase.rpc("shopify_connection_status", { p_shop_id: shop.id }).maybeSingle(),
      supabase.from("knowledge").select("id", { count: "exact", head: true }).eq("shop_id", shop.id).eq("kind", "policy"),
      supabase.from("shops").select("setup").eq("id", shop.id).single(),
      supabase
        .from("usage_events")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shop.id)
        .in("kind", ["sandbox_preset", "sandbox_freetext"]),
      aiRepliesThisPeriod(supabase, shop.id, now),
      loadHomeStats(supabase, shop.id, now),
      supabase
        .from("conversations")
        .select("id, subject, status, last_message_at, customers(name, email)")
        .eq("shop_id", shop.id)
        .in("status", NEEDS_ATTENTION.filter((s) => s !== "open"))
        .order("last_message_at", { ascending: false })
        .limit(5),
    ]);

  const agent = shop.agentName;
  const items = buildChecklist(
    {
      storeConnected: !!connection?.domain && !connection.needs_reconnect,
      policyCount: policyCount ?? 0,
      emailConnected: false, // arrives with email forwarding (3.3)
      toneChosen: flag(shopRow?.setup, "tone_chosen"),
      testRuns: testRuns ?? 0,
      live: flag(shopRow?.setup, "live"),
    },
    agent,
  );
  const progress = checklistProgress(items);
  const allDone = progress.done === progress.total;

  const plan = planOf(shop.plan);
  const limit = PLANS[plan].aiRepliesPerMonth;
  const access = aiAccess({ plan: shop.plan, trialEndsAt: shop.trialEndsAt }, used, now);
  const trialDays =
    plan === "trial" && shop.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(shop.trialEndsAt).getTime() - now.getTime()) / 86_400_000))
      : null;
  const usedPct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  const kpis = [
    { label: "Open conversations", value: stats.openConversations, icon: Inbox, href: "/inbox?status=all" },
    { label: "AI replies sent", value: stats.aiRepliesSent, icon: MessageSquareText, hint: `last ${STATS_WINDOW_DAYS} days` },
    { label: "Escalated", value: stats.escalated, icon: TriangleAlert, href: "/inbox?status=escalated" },
    { label: "Pending approvals", value: stats.pendingApprovals, icon: ShieldCheck, href: "/inbox?status=awaiting_approval" },
    { label: "Resolved", value: stats.resolved, icon: CircleCheckBig, hint: `last ${STATS_WINDOW_DAYS} days` },
    {
      label: "Average confidence",
      value: stats.avgConfidence === null ? "–" : `${Math.round(stats.avgConfidence * 100)}%`,
      icon: Gauge,
      hint: `AI drafts, last ${STATS_WINDOW_DAYS} days`,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title={`Welcome to ${shop.name}`}
        description={allDone ? `${agent} is set up. Here's how support is going.` : `Let's get ${agent} ready for your customers.`}
      />

      <Card size="sm">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              <span className="capitalize">{plan}</span> plan
              {trialDays !== null && ` · ${trialDays === 0 ? "trial ended" : `${trialDays} day${trialDays === 1 ? "" : "s"} left in your trial`}`}
            </span>
            <span className="text-xs text-muted-foreground">
              {limit === null ? `${used} AI replies this month` : `${used} of ${limit} AI replies used this month`}
              {!access.allowed && ` · ${agent} is paused until you upgrade`}
            </span>
          </div>
          {limit !== null && (
            <div className="flex items-center gap-3 sm:w-72">
              <div
                role="progressbar"
                aria-label="AI replies used this month"
                aria-valuenow={used}
                aria-valuemin={0}
                aria-valuemax={limit}
                className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
              >
                <div className={cn("h-full rounded-full", usedPct >= 90 ? "bg-destructive" : "bg-primary")} style={{ width: `${usedPct}%` }} />
              </div>
              <Link href="/billing" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Plans
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {!allDone && (
        <Card>
          <CardHeader>
            <CardTitle>Get set up</CardTitle>
            <CardDescription>
              {progress.done} of {progress.total} steps done
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col divide-y">
              {items.map((item) => (
                <li key={item.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <span className="flex flex-1 items-start gap-3">
                    {item.done ? (
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-label="Done" />
                    ) : (
                      <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="Not done" />
                    )}
                    <span className="flex flex-col">
                      <span className={cn("text-sm font-medium", item.done && "text-muted-foreground line-through")}>{item.title}</span>
                      <span className="text-xs text-muted-foreground">{item.description}</span>
                    </span>
                  </span>
                  {!item.done &&
                    (item.comingSoon ? (
                      <Badge variant="secondary" className="self-start sm:self-center">
                        Coming soon
                      </Badge>
                    ) : (
                      <Link href={item.href} className={cn(buttonVariants({ size: "sm" }), "self-start sm:self-center")}>
                        {item.cta}
                      </Link>
                    ))}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => {
          const body = (
            <Card size="sm" className={cn("h-full", k.href && "transition-colors hover:bg-muted/50")}>
              <CardContent className="flex flex-col gap-1">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <k.icon className="size-4" aria-hidden />
                  {k.label}
                </span>
                <span className="text-2xl font-semibold tabular-nums">{k.value}</span>
                {k.hint && <span className="text-xs text-muted-foreground">{k.hint}</span>}
              </CardContent>
            </Card>
          );
          return k.href ? (
            <Link key={k.label} href={k.href} className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              {body}
            </Link>
          ) : (
            <div key={k.label}>{body}</div>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Needs your attention</CardTitle>
          <Link href="/inbox" className="text-sm font-medium text-primary hover:underline">
            Open inbox
          </Link>
        </CardHeader>
        <CardContent>
          {(attention ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing waiting on you right now.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {(attention ?? []).map((c) => {
                const status = asStatus(c.status);
                return (
                  <li key={c.id}>
                    <Link href={`/inbox/${c.id}`} className="flex items-center gap-3 py-3 hover:text-primary">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{c.subject ?? "(no subject)"}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {c.customers?.name || c.customers?.email || "Unknown customer"} · {timeAgo(c.last_message_at, now)}
                        </span>
                      </span>
                      <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
