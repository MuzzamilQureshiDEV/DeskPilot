import {
  ArrowRight,
  CheckCircle2,
  Circle,
  CircleCheckBig,
  FilePenLine,
  Gauge,
  Inbox,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Store,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Greeting } from "@/components/dashboard/greeting";
import { EmptyState, PageShell } from "@/components/dashboard/page-header";
import { Sparkline } from "@/components/dashboard/sparkline";
import { Avatar, StatusPill } from "@/components/dashboard/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentShop } from "@/lib/auth/session";
import { aiAccess, PLANS, planOf } from "@/lib/billing/plans";
import { aiRepliesThisPeriod } from "@/lib/billing/usage";
import { buildChecklist, checklistProgress } from "@/lib/home/checklist";
import { loadHomeStats, loadTrends, STATS_WINDOW_DAYS, TREND_DAYS } from "@/lib/home/stats";
import { asStatus, NEEDS_ATTENTION, timeAgo } from "@/lib/inbox/labels";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Home · DeskPilot" };

const flag = (setup: unknown, key: string) =>
  !!setup && typeof setup === "object" && !Array.isArray(setup) && (setup as Record<string, unknown>)[key] === true;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

type Tile = { label: string; count: number; href: string; icon: LucideIcon; tone: string; empty: string; cta: string };

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
  const [
    { data: connection },
    { count: policyCount },
    { data: shopRow },
    { count: testRuns },
    used,
    stats,
    trends,
    { data: attention },
    { count: delivered },
  ] = await Promise.all([
    supabase.rpc("shopify_connection_status", { p_shop_id: shop.id }).maybeSingle(),
    supabase.from("knowledge").select("id", { count: "exact", head: true }).eq("shop_id", shop.id).eq("kind", "policy"),
    supabase.from("shops").select("setup").eq("id", shop.id).single(),
    supabase.from("usage_events").select("id", { count: "exact", head: true }).eq("shop_id", shop.id).in("kind", ["sandbox_preset", "sandbox_freetext"]),
    aiRepliesThisPeriod(supabase, shop.id, now, shop),
    loadHomeStats(supabase, shop.id, now),
    loadTrends(supabase, shop.id, now),
    supabase
      .from("conversations")
      .select("id, subject, status, last_message_at, customers(name, email)")
      .eq("shop_id", shop.id)
      .in("status", NEEDS_ATTENTION.filter((s) => s !== "open"))
      .order("last_message_at", { ascending: false })
      .limit(6),
    // Only email replies get delivered_at, so any row means a real customer got one.
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("shop_id", shop.id).not("delivered_at", "is", null),
  ]);

  const agent = shop.agentName;
  const items = buildChecklist(
    {
      storeConnected: !!connection?.domain && !connection.needs_reconnect,
      policyCount: policyCount ?? 0,
      emailConnected: flag(shopRow?.setup, "email_connected"),
      toneChosen: flag(shopRow?.setup, "tone_chosen"),
      testRuns: testRuns ?? 0,
      live: (delivered ?? 0) > 0,
    },
    agent,
  );
  const progress = checklistProgress(items);
  const allDone = progress.done === progress.total;
  const nextStep = items.find((i) => !i.done && !i.comingSoon);

  const plan = planOf(shop.plan);
  const limit = PLANS[plan].aiRepliesPerMonth;
  const access = aiAccess(shop, used, now);
  const trialDays =
    plan === "trial" && shop.trialEndsAt ? Math.max(0, Math.ceil((new Date(shop.trialEndsAt).getTime() - now.getTime()) / 86_400_000)) : null;
  const usedPct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  const waiting = stats.escalated + stats.pendingApprovals + stats.draftsToReview;
  const weekReplies = sum(trends.aiReplies.slice(-7));

  const tiles: Tile[] = [
    { label: "Escalations", count: stats.escalated, href: "/escalations", icon: TriangleAlert, tone: "text-destructive bg-destructive/10", empty: "Nothing escalated", cta: "Review" },
    { label: "Approvals", count: stats.pendingApprovals, href: "/approvals", icon: ShieldCheck, tone: "text-warning bg-warning/15", empty: "No refunds waiting", cta: "Decide" },
    { label: "Drafts to review", count: stats.draftsToReview, href: "/inbox?status=ai_drafted", icon: FilePenLine, tone: "text-primary bg-primary/10", empty: "All drafts handled", cta: "Send" },
  ];

  const kpis = [
    { label: "AI replies", value: sum(trends.aiReplies), icon: MessageSquareText, hint: `last ${TREND_DAYS} days`, trend: trends.aiReplies },
    { label: "New conversations", value: sum(trends.conversations), icon: Inbox, hint: `last ${TREND_DAYS} days`, trend: trends.conversations },
    { label: "Open now", value: stats.openConversations, icon: Inbox, hint: "not yet resolved", href: "/inbox?status=all" },
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
      {/* Greeting */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            <Greeting name={shop.name} />
          </h1>
          <p className="text-muted-foreground">
            {waiting > 0
              ? `${waiting} thing${waiting === 1 ? "" : "s"} need${waiting === 1 ? "s" : ""} you. ${agent} drafted ${weekReplies} repl${weekReplies === 1 ? "y" : "ies"} this week.`
              : allDone
                ? `You're all caught up. ${agent} drafted ${weekReplies} repl${weekReplies === 1 ? "y" : "ies"} this week.`
                : `Let's get ${agent} ready for your customers.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/inbox" className={buttonVariants()}>
            <Inbox aria-hidden />
            Open inbox
          </Link>
          <Link href="/test" className={buttonVariants({ variant: "outline" })}>
            <Sparkles aria-hidden />
            Try {agent}
          </Link>
        </div>
      </section>

      {/* Setup progress (until done) */}
      {!allDone && (
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-accent/60 to-card">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Get set up</CardTitle>
                <CardDescription>
                  {progress.done} of {progress.total} steps done
                  {nextStep ? ` · next: ${nextStep.title}` : ""}
                </CardDescription>
              </div>
              {nextStep && (
                <Link href={nextStep.href} className={buttonVariants({ size: "sm" })}>
                  {nextStep.cta}
                  <ArrowRight aria-hidden />
                </Link>
              )}
            </div>
            <div
              role="progressbar"
              aria-label="Setup progress"
              aria-valuenow={progress.done}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-background"
            >
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
            </div>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex h-full items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/40",
                      item.done && "opacity-60",
                    )}
                  >
                    {item.done ? (
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-label="Done" />
                    ) : (
                      <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="Not done" />
                    )}
                    <span className="flex flex-col">
                      <span className={cn("text-sm font-medium", item.done && "line-through")}>{item.title}</span>
                      <span className="text-xs text-muted-foreground">{item.description}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Needs you now */}
      <section aria-labelledby="needs-heading" className="flex flex-col gap-3">
        <h2 id="needs-heading" className="text-sm font-medium text-muted-foreground">
          Needs you now
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {tiles.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className="group rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Card size="sm" className="h-full shadow-soft transition-all group-hover:-translate-y-0.5 group-hover:shadow-lift">
                <CardContent className="flex items-center gap-3">
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", t.count ? t.tone : "bg-muted text-muted-foreground")}>
                    <t.icon className="size-5" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-2xl font-semibold tabular-nums">{t.count}</span>
                    <span className="truncate text-xs text-muted-foreground">{t.count ? t.label : t.empty}</span>
                  </span>
                  {t.count > 0 && (
                    <span className="flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      {t.cta}
                      <ArrowRight className="size-3.5" aria-hidden />
                    </span>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            {(attention ?? []).length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <CheckCircle2 className="size-8 text-success" aria-hidden />
                <p className="font-medium">All caught up</p>
                <p className="text-sm text-muted-foreground">New conversations that need a decision will show up here.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {(attention ?? []).map((c) => {
                  const status = asStatus(c.status);
                  const who = c.customers?.name || c.customers?.email || "Unknown customer";
                  return (
                    <li key={c.id}>
                      <Link href={`/inbox/${c.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                        <Avatar name={who} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium">{c.subject ?? "(no subject)"}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {who} · {timeAgo(c.last_message_at, now)}
                          </span>
                        </span>
                        <StatusPill status={status} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Performance */}
      <section aria-labelledby="perf-heading" className="flex flex-col gap-3">
        <h2 id="perf-heading" className="text-sm font-medium text-muted-foreground">
          How support is going
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {kpis.map((k) => {
            const body = (
              <Card size="sm" className={cn("h-full", k.href && "transition-colors hover:bg-muted/40")}>
                <CardContent className="flex h-full flex-col gap-1">
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <k.icon className="size-3.5" aria-hidden />
                    {k.label}
                  </span>
                  <span className="text-2xl font-semibold tabular-nums">{k.value}</span>
                  {k.trend ? (
                    <Sparkline values={k.trend} label={`${k.label} per day, last ${TREND_DAYS} days`} className="mt-auto h-8 w-full" />
                  ) : null}
                  <span className="text-[11px] text-muted-foreground">{k.hint}</span>
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
      </section>

      {/* Plan */}
      <Card size="sm">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              <span className="capitalize">{plan}</span> plan
              {trialDays !== null && ` · ${trialDays === 0 ? "trial ended" : `${trialDays} day${trialDays === 1 ? "" : "s"} left in your trial`}`}
            </span>
            <span className="text-xs text-muted-foreground">
              {limit === null ? `${used} AI replies this period` : `${used} of ${limit} AI replies used this period`}
              {!access.allowed && ` · ${agent} is paused until you upgrade`}
            </span>
          </div>
          {limit !== null && (
            <div className="flex items-center gap-3 sm:w-72">
              <div
                role="progressbar"
                aria-label="AI replies used this period"
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
    </PageShell>
  );
}
