import { Mail } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentShop } from "@/lib/auth/session";
import { presetFor } from "@/lib/settings/agent";

import { AgentForm } from "./agent-form";

export const metadata: Metadata = { title: "Settings · DeskPilot" };

export default async function SettingsPage() {
  const shop = await getCurrentShop();
  const preset = presetFor(shop?.agentTone ?? "");

  return (
    <PageShell>
      <PageHeader title="Settings" description="Your agent's name and tone, email forwarding, and team." />

      <Card>
        <CardHeader>
          <CardTitle>Your AI agent</CardTitle>
          <CardDescription>How your agent introduces itself and sounds in every reply.</CardDescription>
        </CardHeader>
        <CardContent>
          <AgentForm
            agentName={shop?.agentName ?? "Ava"}
            preset={preset}
            customTone={preset === "custom" ? (shop?.agentTone ?? "") : ""}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-5 text-primary" aria-hidden />
            Support email
          </CardTitle>
          <CardDescription>
            Soon you&apos;ll get a forwarding address here. Forward your support inbox to it and customer emails will
            arrive in DeskPilot, with replies sent back from your store.
          </CardDescription>
        </CardHeader>
      </Card>
    </PageShell>
  );
}
