import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState, PageHeader, PageShell } from "@/components/dashboard/page-header";
import { getCurrentShop } from "@/lib/auth/session";
import { toCardData } from "@/lib/actions/card";
import type { ActionType } from "@/lib/inbox/action-summary";
import { createClient } from "@/lib/supabase/server";

import { ActionCard } from "./action-card";

export const metadata: Metadata = { title: "Approvals · AstaDesk" };

const SELECT = "id, type, status, payload, result, error, decided_at, created_at, conversation_id, conversations(subject, customers(name, email))";

export default async function ApprovalsPage() {
  const shop = await getCurrentShop();
  const agent = shop?.agentName ?? "Your agent";
  const supabase = await createClient();

  const [{ data: open }, { data: recent }] = shop
    ? await Promise.all([
        supabase
          .from("action_requests")
          .select(SELECT)
          .eq("shop_id", shop.id)
          .in("status", ["pending", "approved", "executing"])
          .order("created_at", { ascending: true }),
        supabase
          .from("action_requests")
          .select(SELECT)
          .eq("shop_id", shop.id)
          .in("status", ["executed", "rejected", "failed"])
          .order("decided_at", { ascending: false })
          .limit(20),
      ])
    : [{ data: [] }, { data: [] }];

  type Row = NonNullable<typeof open>[number];
  const card = (r: Row) =>
    toCardData({ ...r, type: r.type as ActionType }, {
      id: r.conversation_id,
      label: `${r.conversations?.customers?.name || r.conversations?.customers?.email || "Customer"} · ${r.conversations?.subject ?? "(no subject)"}`,
    });

  return (
    <PageShell>
      <PageHeader
        title="Approvals"
        description="Refunds, cancellations and address changes waiting for your decision. Nothing happens in Shopify until you approve."
      />

      {(open ?? []).length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nothing waiting for approval"
          description={`When ${agent} proposes a refund, cancellation or address change, it lands here. Nothing happens in your store until you approve it.`}
        />
      ) : (
        <section className="flex flex-col gap-3" aria-label="Waiting for a decision">
          {(open ?? []).map((r) => (
            <ActionCard key={r.id} action={card(r)} />
          ))}
        </section>
      )}

      {(recent ?? []).length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="text-sm font-medium text-muted-foreground">
            Recently decided
          </h2>
          {(recent ?? []).map((r) => (
            <ActionCard key={r.id} action={card(r)} />
          ))}
        </section>
      )}
    </PageShell>
  );
}
