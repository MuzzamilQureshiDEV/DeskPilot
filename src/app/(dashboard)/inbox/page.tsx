import { FlaskConical, Inbox, Mail, MessageCircle, Search, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageHeader, PageShell } from "@/components/dashboard/page-header";
import { Avatar, STATUS_TONE, StatusPill } from "@/components/dashboard/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentShop } from "@/lib/auth/session";
import { asStatus, FILTER_LABEL, INBOX_FILTERS, NEEDS_ATTENTION, parseFilter, timeAgo, type InboxFilter } from "@/lib/inbox/labels";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inbox · AstaDesk" };

const CHANNEL = {
  email: { icon: Mail, label: "Email" },
  chat: { icon: MessageCircle, label: "Chat" },
  sandbox: { icon: FlaskConical, label: "Test" },
} as const;
const PAGE_SIZE = 50;
const SENTIMENT_DOT: Record<string, string> = {
  angry: "bg-destructive",
  negative: "bg-warning",
  neutral: "bg-muted-foreground/40",
  positive: "bg-success",
};

/** Keeps only characters that are safe inside a PostgREST filter value. */
const cleanSearch = (q: string) => q.replace(/[^\p{L}\p{N}@.\-_ ]/gu, "").trim().slice(0, 80);

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const params = await searchParams;
  const filter = parseFilter(params.status);
  const q = typeof params.q === "string" ? cleanSearch(params.q) : "";
  const shop = await getCurrentShop();
  const supabase = await createClient();

  let rows: {
    id: string;
    channel: string;
    subject: string | null;
    status: string;
    sentiment: string | null;
    tags: string[];
    last_message_at: string | null;
    customers: { name: string | null; email: string | null } | null;
  }[] = [];
  const counts: Partial<Record<InboxFilter, number>> = {};

  if (shop) {
    // Counts per status for the tab bar (statuses only, small payload).
    const { data: statuses } = await supabase.from("conversations").select("status").eq("shop_id", shop.id).limit(10_000);
    for (const { status } of statuses ?? []) {
      const s = asStatus(status);
      counts[s] = (counts[s] ?? 0) + 1;
      counts.all = (counts.all ?? 0) + 1;
      if (NEEDS_ATTENTION.includes(s)) counts.attention = (counts.attention ?? 0) + 1;
    }

    let query = supabase
      .from("conversations")
      .select("id, channel, subject, status, sentiment, tags, last_message_at, customers(name, email)")
      .eq("shop_id", shop.id)
      .order("last_message_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (filter === "attention") query = query.in("status", NEEDS_ATTENTION);
    else if (filter !== "all") query = query.eq("status", filter);
    if (q) {
      const { data: matches } = await supabase
        .from("customers")
        .select("id")
        .eq("shop_id", shop.id)
        .or(`email.ilike.%${q}%,name.ilike.%${q}%`)
        .limit(100);
      const ids = (matches ?? []).map((c) => c.id);
      query = query.or(ids.length ? `subject.ilike.%${q}%,customer_id.in.(${ids.join(",")})` : `subject.ilike.%${q}%`);
    }
    rows = (await query).data ?? [];
  }

  // Latest message per conversation, for the preview line.
  const previews = new Map<string, { role: string; body: string }>();
  if (rows.length > 0) {
    const { data: recent } = await supabase
      .from("messages")
      .select("conversation_id, role, body, created_at")
      .in("conversation_id", rows.map((r) => r.id))
      .in("role", ["customer", "ai", "human"])
      .order("created_at", { ascending: false })
      .limit(500);
    for (const m of recent ?? []) {
      if (!previews.has(m.conversation_id)) previews.set(m.conversation_id, m);
    }
  }

  const href = (status: string) => `/inbox?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const anyConversations = (counts.all ?? 0) > 0;

  return (
    <PageShell>
      <PageHeader
        title="Inbox"
        description="Every customer conversation, with AI drafts ready for review."
        actions={
          anyConversations ? (
            <form action="/inbox" method="get" className="relative w-full sm:w-72">
              <input type="hidden" name="status" value={filter} />
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                name="q"
                defaultValue={q}
                placeholder="Search name, email or subject"
                aria-label="Search conversations"
                className="h-10 w-full rounded-xl border bg-card pr-3 pl-9 text-sm shadow-soft outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
              />
            </form>
          ) : undefined
        }
      />

      {!anyConversations ? (
        <EmptyState
          icon={Inbox}
          title="No conversations yet"
          description="Once you forward your support email or turn on store chat, customer messages show up here."
        >
          <Link href="/settings" className={buttonVariants()}>
            Set up email or chat
          </Link>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Toolbar: status tabs + search */}
          <div className="rounded-xl border bg-card p-1 shadow-soft">
            <nav
              aria-label="Filter by status"
              className="flex gap-0.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none] xl:[mask-image:none]"
            >
              {INBOX_FILTERS.map((f) => {
                const active = f === filter;
                const n = counts[f] ?? 0;
                return (
                  <Link
                    key={f}
                    href={href(f)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors",
                      active ? "bg-primary font-medium text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {f !== "attention" && f !== "all" && (
                      <span className={cn("size-1.5 rounded-full", active ? "bg-primary-foreground/80" : STATUS_TONE[f].dot)} aria-hidden />
                    )}
                    {FILTER_LABEL[f]}
                    <span
                      className={cn(
                        "min-w-[1.125rem] rounded-full px-1 text-center text-[11px] font-medium tabular-nums",
                        active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {n}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* List */}
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-card/50 px-6 py-14 text-center">
              <Inbox className="size-8 text-muted-foreground" aria-hidden />
              <p className="font-medium">Nothing here</p>
              <p className="text-sm text-muted-foreground">
                No conversations {q ? `match “${q}” in` : "in"} {FILTER_LABEL[filter]}.
              </p>
            </div>
          ) : (
            <ul className="overflow-hidden rounded-2xl border bg-card shadow-soft">
              {rows.map((c) => {
                const channel = CHANNEL[c.channel as keyof typeof CHANNEL] ?? CHANNEL.email;
                const status = asStatus(c.status);
                const preview = previews.get(c.id);
                const who = c.customers?.name || c.customers?.email || "Unknown customer";
                const email = c.customers?.name ? c.customers?.email : null;
                return (
                  <li key={c.id} className="relative border-b last:border-b-0">
                    <span className={cn("absolute inset-y-0 left-0 w-0.5", STATUS_TONE[status].bar)} aria-hidden />
                    <Link
                      href={`/inbox/${c.id}`}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none sm:px-5 md:grid-cols-[auto_minmax(0,14rem)_minmax(0,1fr)_auto]"
                    >
                      <Avatar name={who} />

                      {/* Customer */}
                      <span className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-medium">{who}</span>
                          <channel.icon className="size-3.5 shrink-0 text-muted-foreground" aria-label={channel.label} />
                        </span>
                        <span className="truncate text-xs text-muted-foreground md:block">{email ?? channel.label}</span>
                        {/* Subject shows under the name on small screens */}
                        <span className="truncate text-sm md:hidden">{c.subject ?? "(no subject)"}</span>
                      </span>

                      {/* Conversation */}
                      <span className="hidden min-w-0 flex-col md:flex">
                        <span className="truncate text-sm font-medium">{c.subject ?? "(no subject)"}</span>
                        {preview && (
                          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                            {preview.role === "ai" && (
                              <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">
                                <Sparkles className="size-2.5" aria-hidden />
                                AI
                              </span>
                            )}
                            {preview.role === "human" && <span className="shrink-0 font-medium text-foreground/70">You:</span>}
                            <span className="truncate">{preview.body}</span>
                          </span>
                        )}
                      </span>

                      {/* Status + meta */}
                      <span className="flex flex-col items-end gap-1.5">
                        <StatusPill status={status} />
                        <span className="flex items-center gap-2 text-xs whitespace-nowrap text-muted-foreground">
                          {c.sentiment && (
                            <span className="flex items-center gap-1" title={`Mood: ${c.sentiment}`}>
                              <span className={cn("size-1.5 rounded-full", SENTIMENT_DOT[c.sentiment] ?? "bg-muted-foreground/40")} aria-hidden />
                              <span className="hidden capitalize xl:inline">{c.sentiment}</span>
                            </span>
                          )}
                          {timeAgo(c.last_message_at)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </PageShell>
  );
}
