import { CheckCircle2, Clock, Lock, Mail, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentShop } from "@/lib/auth/session";
import { shopAddress } from "@/lib/email/addresses";
import { emailConfig } from "@/lib/email/outbound";
import { serverEnv } from "@/lib/env";
import { presetFor } from "@/lib/settings/agent";
import { createClient } from "@/lib/supabase/server";

import { AgentForm } from "./agent-form";
import { CopyAddress, TestEmailButton } from "./email-card";
import { DataRequestActions } from "./privacy-card";

export const metadata: Metadata = { title: "Settings · DeskPilot" };

const FILTER_LABELS: Record<string, string> = {
  auto_submitted: "auto-reply",
  auto_reply_header: "auto-reply",
  bulk_precedence: "newsletter or bulk mail",
  no_reply_sender: "no-reply sender",
  own_address: "our own email",
  rate_limited: "too many in a row",
  forwarding_confirmation: "forwarding confirmation",
};

const PRIVACY_LABELS: Record<string, string> = {
  data_request: "Data request",
  customer_redact: "Customer data deleted",
  shop_redact: "Store data deleted",
};

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export default async function SettingsPage() {
  const shop = await getCurrentShop();
  const preset = presetFor(shop?.agentTone ?? "");
  const supabase = await createClient();
  const inboundBase = serverEnv().POSTMARK_INBOUND_ADDRESS;
  const sending = emailConfig();

  const [{ data: row }, { data: filtered }, { data: privacy }] = shop
    ? await Promise.all([
        supabase.from("shops").select("inbound_hash, setup").eq("id", shop.id).single(),
        supabase
          .from("filtered_emails")
          .select("reason, created_at")
          .eq("shop_id", shop.id)
          .gte("created_at", daysAgo(30))
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("privacy_requests")
          .select("id, kind, customer_email, shopify_customer_id, status, created_at")
          .eq("shop_id", shop.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ])
    : [{ data: null }, { data: [] }, { data: [] }];

  const setup = obj(row?.setup);
  const connected = setup.email_connected === true;
  const confirmation = obj(setup.forwarding_confirmation);
  const address = inboundBase && row ? shopAddress(inboundBase, row.inbound_hash) : null;
  const agent = shop?.agentName ?? "your agent";

  return (
    <PageShell>
      <PageHeader title="Settings" description="Your agent's name and tone, email forwarding, and team." />

      <Card>
        <CardHeader>
          <CardTitle>Your AI agent</CardTitle>
          <CardDescription>How your agent introduces itself and sounds in every reply.</CardDescription>
        </CardHeader>
        <CardContent>
          <AgentForm agentName={shop?.agentName ?? "Ava"} preset={preset} customTone={preset === "custom" ? (shop?.agentTone ?? "") : ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Mail className="size-5 text-primary" aria-hidden />
            Support email
            {connected ? (
              <Badge>
                <CheckCircle2 aria-hidden /> Receiving email
              </Badge>
            ) : (
              <Badge variant="secondary">
                <Clock aria-hidden /> Waiting for the first email
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Forward your support inbox to the address below. Customer emails then arrive in your DeskPilot inbox and {agent} drafts replies.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {address ? <CopyAddress address={address} /> : <p className="text-sm text-muted-foreground">Email isn&apos;t set up on this server yet.</p>}

          {(typeof confirmation.code === "string" || typeof confirmation.link === "string") && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="font-medium">Gmail sent a forwarding confirmation</p>
              {typeof confirmation.code === "string" && (
                <p>
                  Confirmation code: <code className="font-semibold">{confirmation.code}</code>
                </p>
              )}
              {typeof confirmation.link === "string" && (
                <p>
                  Or confirm with this link:{" "}
                  <a href={confirmation.link} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">
                    {confirmation.link}
                  </a>
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <details className="rounded-lg border px-3 py-2 text-sm" open={!connected}>
              <summary className="cursor-pointer font-medium">Gmail or Google Workspace</summary>
              <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
                <li>Open Gmail, then Settings (gear) → See all settings → Forwarding and POP/IMAP.</li>
                <li>Click &ldquo;Add a forwarding address&rdquo; and paste the address above.</li>
                <li>Gmail sends a confirmation code to that address. It appears on this page within a minute. Refresh to see it.</li>
                <li>Enter the code in Gmail, then choose &ldquo;Forward a copy of incoming mail&rdquo; and save.</li>
              </ol>
            </details>
            <details className="rounded-lg border px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium">Outlook or Microsoft 365</summary>
              <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
                <li>Open Outlook, then Settings → Mail → Forwarding.</li>
                <li>Turn on forwarding and paste the address above.</li>
                <li>Tick &ldquo;Keep a copy of forwarded messages&rdquo; and save.</li>
              </ol>
            </details>
          </div>

          <div className="flex flex-col gap-2 border-t pt-4">
            <p className="text-sm font-medium">Sending replies</p>
            {sending ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Replies are emailed from <span className="font-medium text-foreground">{sending.from}</span>, and customer replies come
                  straight back to this inbox.
                </p>
                <TestEmailButton />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Email sending isn&apos;t set up yet. Replies you send are recorded in DeskPilot but not emailed.
              </p>
            )}
          </div>

          {(filtered ?? []).length > 0 && (
            <div className="flex flex-col gap-1 border-t pt-4 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <ShieldAlert className="size-4 text-muted-foreground" aria-hidden />
                {(filtered ?? []).length} email{(filtered ?? []).length === 1 ? "" : "s"} skipped in the last 30 days
              </p>
              <p className="text-xs text-muted-foreground">
                To avoid reply loops, {agent} never answers{" "}
                {[...new Set((filtered ?? []).map((f) => FILTER_LABELS[f.reason ?? ""] ?? "other"))].join(", ")}.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="size-5 text-primary" aria-hidden />
            Privacy requests
          </CardTitle>
          <CardDescription>
            When a customer asks your store what data it holds, Shopify forwards the request here. Download the data and send it
            to the customer. Deletion requests are handled automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(privacy ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No privacy requests yet.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {(privacy ?? []).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{PRIVACY_LABELS[r.kind] ?? r.kind}</span>
                    {r.customer_email ? ` · ${r.customer_email}` : r.shopify_customer_id ? ` · customer ${r.shopify_customer_id}` : ""}
                    <span className="text-muted-foreground"> · {dateFormat.format(new Date(r.created_at))}</span>
                  </span>
                  {r.kind === "data_request" && r.status === "received" ? (
                    <DataRequestActions id={r.id} />
                  ) : (
                    <Badge variant="secondary">{r.status === "no_data" ? "No data held" : r.kind === "data_request" ? "Sent" : "Deleted"}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
