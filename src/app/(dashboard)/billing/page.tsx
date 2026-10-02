import { CreditCard } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState, PageHeader, PageShell } from "@/components/dashboard/page-header";
import { getCurrentShop } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Billing · DeskPilot" };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "long" });

export default async function BillingPage() {
  const shop = await getCurrentShop();
  const onTrial = shop?.plan === "trial";
  return (
    <PageShell>
      <PageHeader title="Billing" description="Your plan, usage and invoices." />
      <EmptyState
        icon={CreditCard}
        title={onTrial ? "You're on the free trial" : `You're on the ${shop?.plan ?? ""} plan`}
        description={
          onTrial && shop?.trialEndsAt
            ? `Your trial runs until ${dateFormat.format(new Date(shop.trialEndsAt))}. Plans and invoices will appear here.`
            : "Plans and invoices will appear here."
        }
      />
    </PageShell>
  );
}
