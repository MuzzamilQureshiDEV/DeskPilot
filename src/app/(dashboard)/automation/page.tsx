import { Info, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader, PageShell } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CHANNEL_CAN_SEND } from "@/lib/ai/process-message";
import { getCurrentShop } from "@/lib/auth/session";
import { isMoneyCategory, loadSettings, MODE_META } from "@/lib/automation/settings";
import { PLANS, planOf } from "@/lib/billing/plans";
import { createClient } from "@/lib/supabase/server";

import { SettingRow } from "./setting-row";

export const metadata: Metadata = { title: "Automation · DeskPilot" };

export default async function AutomationPage() {
  const shop = await getCurrentShop();
  const agent = shop?.agentName ?? "your agent";
  const settings = shop ? await loadSettings(await createClient(), shop.id) : [];
  const autopilotAllowed = shop ? PLANS[planOf(shop.plan)].autopilot : false;
  const support = settings.filter((s) => !isMoneyCategory(s.category));
  const money = settings.filter((s) => isMoneyCategory(s.category));

  return (
    <PageShell>
      <PageHeader
        title="Automation"
        description={`Decide how much ${agent} handles on its own, topic by topic. Changes save automatically.`}
      />

      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        {(["off", "copilot", "autopilot"] as const).map((m) => (
          <div key={m} className="rounded-lg border p-3">
            <dt className="font-medium">{MODE_META[m].label}</dt>
            <dd className="text-xs text-muted-foreground">{MODE_META[m].description}</dd>
          </div>
        ))}
      </dl>

      {!autopilotAllowed && (
        <p className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Autopilot is available on the Growth and Scale plans. On your plan, {agent} drafts replies for you to send.{" "}
            <Link href="/billing" className="font-medium text-primary hover:underline">
              See plans
            </Link>
          </span>
        </p>
      )}
      {autopilotAllowed && !CHANNEL_CAN_SEND && (
        <p className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Autopilot replies are saved as drafts until your support email is connected.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Customer questions</CardTitle>
          <CardDescription>Answers {agent} can give from your store data and policies.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {support.map((s) => (
              <SettingRow key={s.category} {...s} money={false} autopilotAllowed={autopilotAllowed} />
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Money actions</CardTitle>
          <CardDescription>
            {agent} can only propose these. Nothing happens in Shopify until someone on your team approves it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {money.map((s) => (
              <SettingRow key={s.category} {...s} money autopilotAllowed={false} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </PageShell>
  );
}
