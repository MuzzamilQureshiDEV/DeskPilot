import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState, PageHeader, PageShell } from "@/components/dashboard/page-header";
import { getCurrentShop } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Approvals · DeskPilot" };

export default async function ApprovalsPage() {
  const agent = (await getCurrentShop())?.agentName ?? "Your agent";
  return (
    <PageShell>
      <PageHeader
        title="Approvals"
        description="Refunds, cancellations and address changes waiting for your decision."
      />
      <EmptyState
        icon={ShieldCheck}
        title="Nothing waiting for approval"
        description={`When ${agent} proposes a refund, cancellation or address change, it lands here. Nothing happens in your store until you approve it.`}
      />
    </PageShell>
  );
}
