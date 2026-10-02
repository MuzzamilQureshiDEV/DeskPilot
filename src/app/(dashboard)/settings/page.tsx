import { SlidersHorizontal } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState, PageHeader, PageShell } from "@/components/dashboard/page-header";

export const metadata: Metadata = { title: "Settings · DeskPilot" };

export default function SettingsPage() {
  return (
    <PageShell>
      <PageHeader
        title="Settings"
        description="Your agent's name and tone, email forwarding, and team."
      />
      <EmptyState
        icon={SlidersHorizontal}
        title="Settings are on the way"
        description="This is where you'll rename your agent, pick its tone, and get the address to forward your support email to."
      />
    </PageShell>
  );
}
