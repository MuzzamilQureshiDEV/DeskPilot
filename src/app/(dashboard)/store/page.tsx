import { Plug } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState, PageHeader, PageShell } from "@/components/dashboard/page-header";
import { getCurrentShop } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Store · DeskPilot" };

export default async function StorePage() {
  const agent = (await getCurrentShop())?.agentName ?? "your agent";
  return (
    <PageShell>
      <PageHeader title="Store" description="Your Shopify connection." />
      <EmptyState
        icon={Plug}
        title="No store connected"
        description={`Connect Shopify so ${agent} can look up orders, tracking and products. Until then, it uses the sample store on the Test page.`}
      />
    </PageShell>
  );
}
