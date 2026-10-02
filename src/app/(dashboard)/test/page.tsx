import { FlaskConical } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState, PageHeader, PageShell } from "@/components/dashboard/page-header";
import { getCurrentShop } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Test · DeskPilot" };

export default async function TestPage() {
  const agent = (await getCurrentShop())?.agentName ?? "your agent";
  return (
    <PageShell>
      <PageHeader
        title="Test"
        description="A safe playground with a sample store. Nothing here touches real orders."
      />
      <EmptyState
        icon={FlaskConical}
        title={`Try ${agent} before going live`}
        description="Run common requests, like where is my order, a refund, or a product question, against a demo outdoor apparel store and see exactly how replies come out."
      />
    </PageShell>
  );
}
