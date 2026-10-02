import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState, PageHeader, PageShell } from "@/components/dashboard/page-header";
import { getCurrentShop } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Escalations · DeskPilot" };

export default async function EscalationsPage() {
  const agent = (await getCurrentShop())?.agentName ?? "Your agent";
  return (
    <PageShell>
      <PageHeader
        title="Escalations"
        description="Conversations that need a person to step in."
      />
      <EmptyState
        icon={TriangleAlert}
        title="No escalations"
        description={`When ${agent} isn't sure of an answer, it hands the conversation to you here instead of guessing.`}
      />
    </PageShell>
  );
}
