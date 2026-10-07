import { FlaskConical, Mail, MessageCircle, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageHeader, PageShell } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentShop } from "@/lib/auth/session";
import { asStatus, STATUS_LABEL, timeAgo } from "@/lib/inbox/labels";
import { createClient } from "@/lib/supabase/server";

import { EscalationActions } from "./escalation-actions";

export const metadata: Metadata = { title: "Escalations · AstaDesk" };

const CHANNEL_ICON = { email: Mail, chat: MessageCircle, sandbox: FlaskConical } as const;
const SELECT = "id, channel, subject, status, escalation_reason, escalated_at, last_message_at, customers(name, email)";
const RECENT_DAYS = 7;

const sinceDays = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const snippet = (text: string, max = 160) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export default async function EscalationsPage() {
  const shop = await getCurrentShop();
  const agent = shop?.agentName ?? "Your agent";
  const supabase = await createClient();

  const [{ data: waiting }, { data: recent }] = shop
    ? await Promise.all([
        supabase
          .from("conversations")
          .select(SELECT)
          .eq("shop_id", shop.id)
          .eq("status", "escalated")
          .order("escalated_at", { ascending: true, nullsFirst: true })
          .limit(100),
        supabase
          .from("conversations")
          .select(SELECT)
          .eq("shop_id", shop.id)
          .neq("status", "escalated")
          .gte("escalated_at", sinceDays(RECENT_DAYS))
          .order("escalated_at", { ascending: false })
          .limit(20),
      ])
    : [{ data: [] }, { data: [] }];

  // Last customer message per waiting conversation (what they actually asked).
  const lastAsk = new Map<string, string>();
  const ids = (waiting ?? []).map((c) => c.id);
  if (shop && ids.length) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("conversation_id, body, created_at")
      .eq("shop_id", shop.id)
      .eq("role", "customer")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .limit(500);
    for (const m of msgs ?? []) if (!lastAsk.has(m.conversation_id)) lastAsk.set(m.conversation_id, m.body);
  }

  const who = (c: NonNullable<typeof waiting>[number]) => c.customers?.name || c.customers?.email || "Customer";

  return (
    <PageShell>
      <PageHeader title="Escalations" description="Conversations that need a person to step in, longest waiting first." />

      {(waiting ?? []).length === 0 ? (
        <EmptyState
          icon={TriangleAlert}
          title="No escalations"
          description={`When ${agent} isn't sure of an answer, it hands the conversation to you here instead of guessing.`}
        />
      ) : (
        <section className="flex flex-col gap-3" aria-label="Waiting for a person">
          {(waiting ?? []).map((c) => {
            const Icon = CHANNEL_ICON[c.channel as keyof typeof CHANNEL_ICON] ?? Mail;
            const ask = lastAsk.get(c.id);
            return (
              <Card key={c.id} className="border-destructive/30">
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Icon className="size-4 text-muted-foreground" aria-label={c.channel} />
                    <span className="font-medium">{who(c)}</span>
                    <span className="text-muted-foreground">· {c.subject ?? "(no subject)"}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      Escalated {timeAgo(c.escalated_at ?? c.last_message_at)}
                    </span>
                  </div>
                  <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                    <span>
                      <span className="font-medium">Why: </span>
                      {c.escalation_reason || "Needs a person."}
                    </span>
                  </p>
                  {ask && <p className="text-sm text-muted-foreground">&ldquo;{snippet(ask)}&rdquo;</p>}
                  <EscalationActions conversationId={c.id} />
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {(recent ?? []).length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="handled-heading">
          <h2 id="handled-heading" className="text-sm font-medium text-muted-foreground">
            Recently handled (last {RECENT_DAYS} days)
          </h2>
          <ul className="flex flex-col divide-y rounded-xl border text-sm">
            {(recent ?? []).map((c) => (
              <li key={c.id}>
                <Link href={`/inbox/${c.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-muted/50">
                  <span className="font-medium">{who(c)}</span>
                  <span className="text-muted-foreground">· {c.subject ?? "(no subject)"}</span>
                  <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">
                    {c.escalation_reason}
                  </span>
                  <Badge variant="secondary" className="ml-auto">
                    {STATUS_LABEL[asStatus(c.status)]}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}
