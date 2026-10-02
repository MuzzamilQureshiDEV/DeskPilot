import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageHeader, PageShell } from "@/components/dashboard/page-header";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Inbox · DeskPilot" };

export default function InboxPage() {
  return (
    <PageShell>
      <PageHeader
        title="Inbox"
        description="Every customer conversation, with AI drafts ready for review."
      />
      <EmptyState
        icon={Inbox}
        title="No conversations yet"
        description="Once you forward your support email, customer messages will show up here."
      >
        <Link href="/settings" className={buttonVariants()}>
          Set up email
        </Link>
      </EmptyState>
    </PageShell>
  );
}
