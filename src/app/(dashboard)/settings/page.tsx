import {
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Lock,
  Mail,
  MessageCircle,
  MessageSquareQuote,
  Palette,
  ShieldAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader, PageShell } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthUser, getCurrentShop } from "@/lib/auth/session";
import { shopAddress } from "@/lib/email/addresses";
import { emailConfig } from "@/lib/email/outbound";
import { serverEnv } from "@/lib/env";
import { publicEnv } from "@/lib/env-public";
import { presetFor } from "@/lib/settings/agent";
import { emailFilters } from "@/lib/settings/email-filters";
import { widgetSettings } from "@/lib/settings/widget";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { AgentForm } from "./agent-form";
import { CopyAddress, TestEmailButton } from "./email-card";
import { NotificationsForm } from "./notifications-card";
import { DataRequestActions } from "./privacy-card";
import { AccountForm, EmbedCode, FiltersForm, QuickRepliesManager, SignatureForm } from "./settings-forms";
import { WidgetEditor } from "./widget-editor";

export const metadata: Metadata = { title: "Settings · AstaDesk" };

const TABS = [
  { id: "email", label: "Email", icon: Mail },
  { id: "style", label: "Reply style", icon: Palette },
  { id: "widget", label: "Chat widget", icon: MessageCircle },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "filters", label: "Email filters", icon: Filter },
  { id: "quick-replies", label: "Quick replies", icon: MessageSquareQuote },
  { id: "account", label: "Account", icon: UserRound },
  { id: "privacy", label: "Privacy", icon: Lock },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[];
type TabId = (typeof TABS)[number]["id"];

const FILTER_LABELS: Record<string, string> = {
  auto_submitted: "Auto-reply",
  auto_reply_header: "Auto-reply",
  bulk_precedence: "Bulk mail",
  no_reply_sender: "No-reply sender",
  mailing_list: "Newsletter",
  notification_sender: "Automatic notification",
  blocked_sender: "Blocked by you",
  own_address: "Our own email",
  rate_limited: "Too many in a row",
  forwarding_confirmation: "Forwarding confirmation",
};

const PRIVACY_LABELS: Record<string, string> = {
  data_request: "Data request",
  customer_redact: "Customer data deleted",
  shop_redact: "Store data deleted",
};

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const shortDate = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" });

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString();
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** A titled section inside a tab. */
function Section({
  icon: Icon,
  title,
  description,
  badge,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Icon className="size-5 text-primary" aria-hidden />
          {title}
          {badge}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const requested = (await searchParams).tab;
  const tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : "email";

  const shop = await getCurrentShop();
  const user = await getAuthUser();
  const supabase = await createClient();
  const agent = shop?.agentName ?? "Ava";

  const { data: row } = shop
    ? await supabase
        .from("shops")
        .select("inbound_hash, setup, notify_escalations, notify_approvals, widget, email_filters, email_signature, widget_key")
        .eq("id", shop.id)
        .single()
    : { data: null };

  return (
    <PageShell>
      <PageHeader title="Settings" description={`Email, ${agent}'s reply style, your store chat and your account.`} />

      <nav aria-label="Settings sections" className="sticky top-14 z-10 -mx-4 overflow-x-auto bg-background/85 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <ul className="flex w-max gap-1 rounded-2xl border bg-card p-1 shadow-soft">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = id === tab;
            return (
              <li key={id}>
                <Link
                  href={`/settings?tab=${id}`}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                    active ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {!shop ? (
        <p className="text-sm text-muted-foreground">Your account isn&apos;t linked to a store.</p>
      ) : tab === "email" ? (
        <EmailTab shopId={shop.id} storeName={shop.name} agent={agent} row={row} />
      ) : tab === "style" ? (
        <Section icon={Palette} title="Reply style" description={`How ${agent} sounds in every reply. It never changes facts, prices or your policies.`}>
          <AgentForm preset={presetFor(shop.agentTone)} customTone={presetFor(shop.agentTone) === "custom" ? shop.agentTone : ""} />
          <p className="mt-6 rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
            Want {agent} to sound exactly like you? Add a few of your own replies in{" "}
            <Link href="/train?kind=example_reply" className="font-medium text-primary hover:underline">
              Train → Example replies
            </Link>
            . She copies their style, not their facts.
          </p>
        </Section>
      ) : tab === "widget" ? (
        <WidgetTab shopId={shop.id} storeName={shop.name} widget={row?.widget} widgetKey={row?.widget_key ?? null} />
      ) : tab === "notifications" ? (
        <Section icon={Bell} title="Notifications" description={`Get an email the moment ${agent} needs you, so no customer waits unnoticed.`}>
          <NotificationsForm
            initial={{ escalations: row?.notify_escalations ?? true, approvals: row?.notify_approvals ?? true }}
            canEdit={shop.role === "owner"}
            email={user?.email ?? "your login email"}
          />
        </Section>
      ) : tab === "filters" ? (
        <FiltersTab shopId={shop.id} agent={agent} filters={row?.email_filters} />
      ) : tab === "quick-replies" ? (
        <QuickRepliesTab shopId={shop.id} />
      ) : tab === "account" ? (
        <AccountTab />
      ) : (
        <PrivacyTab shopId={shop.id} />
      )}
    </PageShell>
  );
}

type ShopRow = { inbound_hash: string; setup: unknown; email_signature: string } | null;

async function EmailTab({ shopId, storeName, agent, row }: { shopId: string; storeName: string; agent: string; row: ShopRow }) {
  const supabase = await createClient();
  const { count: skipped } = await supabase
    .from("filtered_emails")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .gte("created_at", thirtyDaysAgo());
  const inboundBase = serverEnv().POSTMARK_INBOUND_ADDRESS;
  const sending = emailConfig();
  const setup = obj(row?.setup);
  const connected = setup.email_connected === true;
  const confirmation = obj(setup.forwarding_confirmation);
  const address = inboundBase && row ? shopAddress(inboundBase, row.inbound_hash) : null;

  return (
    <>
      <Section
        icon={Mail}
        title="Support email"
        badge={
          connected ? (
            <Badge>
              <CheckCircle2 aria-hidden /> Receiving email
            </Badge>
          ) : (
            <Badge variant="secondary">
              <Clock aria-hidden /> Waiting for the first email
            </Badge>
          )
        }
        description={`Forward your support inbox to the address below. Customer emails then arrive in your AstaDesk inbox and ${agent} drafts replies.`}
      >
        <div className="flex flex-col gap-6">
          {address ? <CopyAddress address={address} /> : <p className="text-sm text-muted-foreground">Email isn&apos;t set up on this server yet.</p>}

          {!connected && (typeof confirmation.code === "string" || typeof confirmation.link === "string") && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
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
            <details className="rounded-xl border px-4 py-3 text-sm" open={!connected}>
              <summary className="cursor-pointer font-medium">Gmail or Google Workspace</summary>
              <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
                <li>Open Gmail, then Settings (gear) → See all settings → Forwarding and POP/IMAP.</li>
                <li>Click &ldquo;Add a forwarding address&rdquo; and paste the address above.</li>
                <li>Gmail sends a confirmation code to that address. It appears on this page within a minute. Refresh to see it.</li>
                <li>Enter the code in Gmail, then choose &ldquo;Forward a copy of incoming mail&rdquo; and save.</li>
              </ol>
              <p className="mt-2 text-xs text-muted-foreground">
                Tip: use a separate support inbox. Forwarding a personal inbox sends all your mail to {agent}.
              </p>
            </details>
            <details className="rounded-xl border px-4 py-3 text-sm">
              <summary className="cursor-pointer font-medium">Outlook or Microsoft 365</summary>
              <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
                <li>Open Outlook, then Settings → Mail → Forwarding.</li>
                <li>Turn on forwarding and paste the address above.</li>
                <li>Tick &ldquo;Keep a copy of forwarded messages&rdquo; and save.</li>
              </ol>
            </details>
          </div>

          {(skipped ?? 0) > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <ShieldAlert className="size-4 text-muted-foreground" aria-hidden />
              {skipped} email{skipped === 1 ? "" : "s"} skipped in the last 30 days.
              <Link href="/settings?tab=filters" scroll={false} className="font-medium text-primary hover:underline">
                See which and why
              </Link>
            </p>
          )}
        </div>
      </Section>

      <Section icon={MessageSquareQuote} title="Sending replies" description="How replies reach your customers by email.">
        <div className="flex flex-col gap-5">
          {sending ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Replies are emailed from <span className="font-medium text-foreground">{sending.from}</span> as &ldquo;{agent} at {storeName}&rdquo;,
                and customer replies come straight back to this inbox.
              </p>
              <TestEmailButton />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Email sending isn&apos;t set up yet. Replies you send are recorded in AstaDesk but not emailed.</p>
          )}
          <div className="border-t pt-5">
            <SignatureForm initial={row?.email_signature ?? ""} storeName={storeName} />
          </div>
        </div>
      </Section>
    </>
  );
}

async function WidgetTab({ shopId, storeName, widget, widgetKey }: { shopId: string; storeName: string; widget: unknown; widgetKey: string | null }) {
  const supabase = await createClient();
  const [{ count: chats }, { data: store }] = await Promise.all([
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("channel", "chat"),
    supabase.rpc("shopify_connection_status", { p_shop_id: shopId }).maybeSingle(),
  ]);
  const apiKey = serverEnv().SHOPIFY_API_KEY;
  const viaApp = store?.domain && store.auth === "oauth";
  const themeEditorUrl =
    viaApp && !store.uninstalled_at && apiKey ? `https://${store.domain}/admin/themes/current/editor?context=apps&activateAppId=${apiKey}/chat` : null;
  const appUrl = publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  const embed = widgetKey ? `<script src="${appUrl}/astadesk-chat.js" data-key="${widgetKey}" async></script>` : null;

  return (
    <>
      <Section
        icon={MessageCircle}
        title="Chat widget"
        badge={(chats ?? 0) > 0 ? <Badge>Live on your store</Badge> : <Badge variant="secondary">Not seen yet</Badge>}
        description="The chat bubble on your Shopify store. Change it here and your store updates within a few minutes."
      >
        <WidgetEditor initial={widgetSettings(widget)} storeName={storeName} />
      </Section>
      {viaApp ? (
        <Section icon={ExternalLink} title="Turn it on in Shopify" description="The chat appears once the AstaDesk app embed is on in your theme.">
          <div className="flex flex-col gap-4 text-sm">
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
              <li>Open your theme editor with the button below (or Online Store → Themes → Customize → App embeds).</li>
              <li>
                Turn on <span className="font-medium text-foreground">AstaDesk chat</span> and click Save.
              </li>
              <li>The look comes from this page. The theme editor fields are optional overrides for one theme. Leave them empty to use these settings.</li>
            </ol>
            {themeEditorUrl && (
              <a href={themeEditorUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ className: "self-start" })}>
                <ExternalLink aria-hidden />
                Open Shopify theme editor
              </a>
            )}
          </div>
        </Section>
      ) : (
        <Section icon={ExternalLink} title="Add the chat to your store" description="Paste this one line into your theme once. Changes you make on this page then appear on your store automatically.">
          <div className="flex flex-col gap-4 text-sm">
            {embed && <EmbedCode code={embed} />}
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
              <li>In Shopify admin, open Online Store → Themes.</li>
              <li>
                On your live theme click <span className="font-medium text-foreground">⋯ → Edit code</span>, then open{" "}
                <span className="font-mono text-foreground">layout/theme.liquid</span>.
              </li>
              <li>
                Paste the code just before <span className="font-mono text-foreground">&lt;/body&gt;</span> and click Save.
              </li>
            </ol>
            <p className="text-xs text-muted-foreground">Works on any Shopify theme. To remove the chat, delete the line again.</p>
          </div>
        </Section>
      )}
    </>
  );
}

async function FiltersTab({ shopId, agent, filters }: { shopId: string; agent: string; filters: unknown }) {
  const supabase = await createClient();
  const { data: skipped } = await supabase
    .from("filtered_emails")
    .select("from_email, subject, reason, created_at")
    .eq("shop_id", shopId)
    .gte("created_at", thirtyDaysAgo())
    .order("created_at", { ascending: false })
    .limit(25);

  return (
    <>
      <Section icon={Filter} title="Email filters" description={`Decide which incoming emails reach ${agent}. Auto-replies are always ignored, so ${agent} never gets into a reply loop.`}>
        <FiltersForm initial={emailFilters(filters)} />
      </Section>
      <Section icon={ShieldAlert} title="Skipped emails" description="Emails from the last 30 days that weren't answered, and why. Add a sender to “Always allow” if one was skipped by mistake.">
        {(skipped ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing skipped in the last 30 days.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border text-sm">
            {(skipped ?? []).map((s, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.subject || "(no subject)"}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{s.from_email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary">{FILTER_LABELS[s.reason ?? ""] ?? "Other"}</Badge>
                  <span className="text-xs text-muted-foreground">{s.created_at ? shortDate.format(new Date(s.created_at)) : ""}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

async function QuickRepliesTab({ shopId }: { shopId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("quick_replies").select("id, title, body").eq("shop_id", shopId).order("created_at", { ascending: false });
  return (
    <Section
      icon={MessageSquareQuote}
      title="Quick replies"
      description="Saved answers you use often. Insert one from the reply box in any conversation, edit it if needed, then send."
    >
      <QuickRepliesManager replies={data ?? []} />
    </Section>
  );
}

async function AccountTab() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const meta = obj(data.user?.user_metadata);
  const name = typeof meta.full_name === "string" ? meta.full_name : "";
  return (
    <Section icon={UserRound} title="Account" description="Your personal login details.">
      <AccountForm name={name} email={data.user?.email ?? ""} />
    </Section>
  );
}

async function PrivacyTab({ shopId }: { shopId: string }) {
  const supabase = await createClient();
  const { data: privacy } = await supabase
    .from("privacy_requests")
    .select("id, kind, customer_email, shopify_customer_id, status, created_at")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (
    <Section
      icon={Lock}
      title="Privacy requests"
      description="When a customer asks your store what data it holds, Shopify forwards the request here. Download the data and send it to the customer. Deletion requests are handled automatically."
    >
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
    </Section>
  );
}
