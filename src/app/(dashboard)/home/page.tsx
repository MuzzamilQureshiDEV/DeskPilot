import { Store } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState, PageHeader, PageShell } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentShop } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Home · DeskPilot" };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

// Setup checklist and KPI cards arrive in task 2.6.
export default async function HomePage() {
  const shop = await getCurrentShop();

  if (!shop) {
    return (
      <PageShell>
        <EmptyState
          icon={Store}
          title="No store yet"
          description="Your account isn't linked to a store. Contact support if this looks wrong."
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={`Welcome to ${shop.name}`}
        description={`${shop.agentName} is ready to be set up.`}
      />
      <Card>
        <CardHeader>
          <CardTitle>Your account</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">AI agent</dt>
            <dd>{shop.agentName}</dd>
            <dt className="text-muted-foreground">Plan</dt>
            <dd className="capitalize">{shop.plan}</dd>
            {shop.trialEndsAt && (
              <>
                <dt className="text-muted-foreground">Trial ends</dt>
                <dd>{dateFormat.format(new Date(shop.trialEndsAt))}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Your role</dt>
            <dd className="capitalize">{shop.role}</dd>
          </dl>
        </CardContent>
      </Card>
    </PageShell>
  );
}
