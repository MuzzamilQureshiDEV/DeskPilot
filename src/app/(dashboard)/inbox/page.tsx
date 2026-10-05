import { FlaskConical, Inbox, Mail, MessageCircle, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageHeader, PageShell } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentShop } from "@/lib/auth/session";
import {
  asStatus,
  FILTER_LABEL,
  INBOX_FILTERS,
  NEEDS_ATTENTION,
  parseFilter,
  STATUS_LABEL,
  STATUS_VARIANT,
  timeAgo,
} from "@/lib/inbox/labels";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inbox · DeskPilot" };

const CHANNEL_ICON = { email: Mail, chat: MessageCircle, sandbox: FlaskConical } as const;
const PAGE_SIZE = 50;

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
  let anyConversations = false;

  if (shop) {
    const { count } = await supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shop.id);
    anyConversations = (count ?? 0) > 0;

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

  return (
    <PageShell>
      <PageHeader title="Inbox" description="Every customer conversation, with AI drafts ready for review." />

      {!anyConversations ? (
        <EmptyState
          icon={Inbox}
          title="No conversations yet"
          description="Once you forward your support email, customer messages will show up here."
        >
          <Link href="/settings" className={buttonVariants()}>
            Set up email
          </Link>
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <nav aria-label="Filter by status" className="flex flex-wrap gap-1">
              {INBOX_FILTERS.map((f) => (
                <Link
                  key={f}
                  href={href(f)}
                  aria-current={f === filter ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3 py-1 text-sm transition-colors",
                    f === filter ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {FILTER_LABEL[f]}
                </Link>
              ))}
            </nav>
            <form action="/inbox" method="get" className="relative md:w-72">
              <input type="hidden" name="status" value={filter} />
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input name="q" defaultValue={q} placeholder="Search customer or subject" aria-label="Search" className="pl-8" />
            </form>
          </div>

          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
              No conversations match {q ? `"${q}" in ` : ""}&ldquo;{FILTER_LABEL[filter]}&rdquo;.
            </p>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="hidden md:table-cell">Last message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Mood / tags</TableHead>
                    <TableHead className="text-right">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => {
                    const Icon = CHANNEL_ICON[c.channel as keyof typeof CHANNEL_ICON] ?? Mail;
                    const status = asStatus(c.status);
                    const preview = previews.get(c.id);
                    const who = c.customers?.name || c.customers?.email || "Unknown customer";
                    return (
                      <TableRow key={c.id} className="relative">
                        <TableCell className="max-w-48">
                          <Link
                            href={`/inbox/${c.id}`}
                            className="flex items-center gap-2 font-medium after:absolute after:inset-0 focus-visible:outline-none"
                          >
                            <Icon className="size-4 shrink-0 text-muted-foreground" aria-label={c.channel} />
                            <span className="truncate">{who}</span>
                          </Link>
                          {c.customers?.name && c.customers.email && (
                            <span className="block truncate pl-6 text-xs text-muted-foreground">{c.customers.email}</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden max-w-md md:table-cell">
                          <span className="block truncate font-medium">{c.subject ?? "(no subject)"}</span>
                          {preview && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {preview.role === "customer" ? "" : preview.role === "ai" ? "AI: " : "You: "}
                              {preview.body}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {c.sentiment && <Badge variant="outline">{c.sentiment}</Badge>}
                            {c.tags.slice(0, 3).map((t) => (
                              <Badge key={t} variant="secondary">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs whitespace-nowrap text-muted-foreground">
                          {timeAgo(c.last_message_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
