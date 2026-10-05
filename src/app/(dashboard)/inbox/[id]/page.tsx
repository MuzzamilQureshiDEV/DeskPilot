import { ArrowLeft, Info, MailCheck, MailX, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentShop } from "@/lib/auth/session";
import { emailSendingEnabled } from "@/lib/email/outbound";
import { toCardData } from "@/lib/actions/card";
import type { ActionType } from "@/lib/inbox/action-summary";
import { asStatus, STATUS_LABEL, STATUS_VARIANT, timeAgo } from "@/lib/inbox/labels";
import { idSchema, unansweredCustomerMessage } from "@/lib/inbox/mutations";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { ActionCard } from "../../approvals/action-card";
import { ConversationControls, DraftCard, ReplyComposer, ResendButton } from "./conversation-actions";

export const metadata: Metadata = { title: "Conversation · DeskPilot" };


export default async function ConversationPage({ params }: PageProps<"/inbox/[id]">) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const shop = await getCurrentShop();
  if (!shop) notFound();
  const supabase = await createClient();

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, channel, subject, status, sentiment, tags, ai_paused, created_at, customers(name, email)")
    .eq("id", id)
    .eq("shop_id", shop.id)
    .maybeSingle();
  if (!conv) notFound();

  const [{ data: messages }, { data: actions }, unanswered] = await Promise.all([
    supabase
      .from("messages")
      .select("id, role, status, body, confidence, reasoning, created_at, delivered_at, delivery_error")
      .eq("conversation_id", id)
      .eq("shop_id", shop.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("action_requests")
      .select("id, type, status, payload, result, error, decided_at, created_at")
      .eq("conversation_id", id)
      .eq("shop_id", shop.id)
      .order("created_at", { ascending: false }),
    unansweredCustomerMessage(supabase, shop.id, id),
  ]);

  const all = messages ?? [];
  const latestDraft = [...all].reverse().find((m) => m.role === "ai" && m.status === "draft");
  const status = asStatus(conv.status);
  const isEmail = conv.channel === "email";
  const sending = emailSendingEnabled();
  const agent = shop.agentName;
  const customerName = conv.customers?.name || conv.customers?.email || "Customer";

  return (
    <PageShell>
      <div className="flex flex-col gap-2">
        <Link href="/inbox" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          Inbox
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{conv.subject ?? "(no subject)"}</h1>
          <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
        </div>
      </div>

      {isEmail && !sending && (
        <p className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Email sending isn&apos;t set up yet. Replies you send are recorded here but not emailed to the customer.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-4">
          <ol className="flex flex-col gap-4" aria-label="Messages">
            {all.map((m) => {
              if (m.id === latestDraft?.id) return null;
              if (m.role === "system") {
                return (
                  <li key={m.id} className="mx-auto max-w-lg rounded-lg bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
                    {m.body}
                  </li>
                );
              }
              const mine = m.role !== "customer";
              const label = m.role === "customer" ? customerName : m.role === "ai" ? agent : "You";
              const muted = m.status === "draft" || m.status === "rejected";
              return (
                <li key={m.id} className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
                  <span className="text-xs text-muted-foreground">
                    {label} · {timeAgo(m.created_at)}
                    {m.status === "rejected" && " · rejected draft"}
                    {m.status === "draft" && " · older draft"}
                  </span>
                  <p
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap",
                      mine ? "rounded-tr-sm bg-primary/10" : "rounded-tl-sm bg-muted",
                      muted && "opacity-60 line-through decoration-muted-foreground/40",
                    )}
                  >
                    {m.body}
                  </p>
                  {isEmail && mine && m.status === "sent" && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {m.delivered_at ? (
                        <>
                          <MailCheck className="size-3.5 text-primary" aria-hidden /> Emailed
                        </>
                      ) : (
                        <>
                          <MailX className="size-3.5" aria-hidden />
                          {m.delivery_error ? `Not emailed: ${m.delivery_error}` : "Not emailed"}
                          {sending && <ResendButton messageId={m.id} />}
                        </>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          {latestDraft && (
            <DraftCard
              agentName={agent}
              draft={{
                id: latestDraft.id,
                body: latestDraft.body,
                confidence: latestDraft.confidence === null ? null : Number(latestDraft.confidence),
                reasoning: latestDraft.reasoning,
              }}
            />
          )}

          <ReplyComposer conversationId={conv.id} />
        </div>

        <aside className="flex flex-col gap-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{conv.customers?.name ?? "Unknown"}</span>
              {conv.customers?.email && <span className="text-muted-foreground">{conv.customers.email}</span>}
              <span className="text-xs text-muted-foreground capitalize">via {conv.channel}</span>
              {(conv.sentiment || conv.tags.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {conv.sentiment && <Badge variant="outline">{conv.sentiment}</Badge>}
                  {conv.tags.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Conversation</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                {conv.ai_paused ? `You're handling this. ${agent} won't reply.` : `${agent} drafts replies here.`}
              </p>
              <ConversationControls
                conversationId={conv.id}
                aiPaused={conv.ai_paused}
                resolved={status === "resolved"}
                canAskAi={!!unanswered && !latestDraft}
                agentName={agent}
              />
            </CardContent>
          </Card>

          {(actions ?? []).length > 0 && (
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" aria-hidden />
                  Proposed actions
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {(actions ?? []).map((a) => (
                  <ActionCard key={a.id} compact action={toCardData({ ...a, type: a.type as ActionType })} />
                ))}
                <p className="text-xs text-muted-foreground">Nothing changes in Shopify until you approve.</p>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </PageShell>
  );
}
