import { Workflow } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState, PageHeader, PageShell } from "@/components/dashboard/page-header";

export const metadata: Metadata = { title: "Automation · DeskPilot" };

export default function AutomationPage() {
  return (
    <PageShell>
      <PageHeader
        title="Automation"
        description="Decide how much the agent handles on its own, topic by topic."
      />
      <EmptyState
        icon={Workflow}
        title="Everything starts in copilot mode"
        description="For now, every reply is drafted for you to review. Soon you'll be able to set each topic to off, copilot or autopilot. Refunds, cancellations and address changes will always need your approval."
      />
    </PageShell>
  );
}
