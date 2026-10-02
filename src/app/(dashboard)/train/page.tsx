import { GraduationCap } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState, PageHeader, PageShell } from "@/components/dashboard/page-header";
import { getCurrentShop } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Train · DeskPilot" };

export default async function TrainPage() {
  const agent = (await getCurrentShop())?.agentName ?? "your agent";
  return (
    <PageShell>
      <PageHeader
        title="Train"
        description="Policies, FAQs, brand details and example replies."
      />
      <EmptyState
        icon={GraduationCap}
        title={`Teach ${agent} about your store`}
        description={`Add your return policy, shipping details, FAQs and a few example replies. ${agent} only answers from what you add here and your live store data.`}
      />
    </PageShell>
  );
}
