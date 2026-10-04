import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader, PageShell } from "@/components/dashboard/page-header";
import { getCurrentShop } from "@/lib/auth/session";
import { KIND_META, KNOWLEDGE_KINDS, parseKind } from "@/lib/knowledge/schema";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { KnowledgeEditor } from "./knowledge-editor";

export const metadata: Metadata = { title: "Train · DeskPilot" };

export default async function TrainPage({ searchParams }: PageProps<"/train">) {
  const kind = parseKind((await searchParams).kind);
  const shop = await getCurrentShop();
  const agent = shop?.agentName ?? "Your agent";

  const supabase = await createClient();
  const { data: rows } = shop
    ? await supabase
        .from("knowledge")
        .select("id, kind, title, content, updated_at")
        .eq("shop_id", shop.id)
        .order("updated_at", { ascending: false })
    : { data: [] };
  const all = rows ?? [];
  const counts = Object.fromEntries(KNOWLEDGE_KINDS.map((k) => [k, all.filter((r) => r.kind === k).length]));
  const entries = all
    .filter((r) => r.kind === kind)
    .map((r) => ({ id: r.id, title: r.title, content: r.content, updatedAt: r.updated_at }));

  return (
    <PageShell>
      <PageHeader
        title="Train"
        description={`Teach ${agent} about your store. ${agent} only answers from what you add here and your live store data.`}
      />

      <nav aria-label="Knowledge types" className="flex flex-wrap gap-1 border-b">
        {KNOWLEDGE_KINDS.map((k) => (
          <Link
            key={k}
            href={`/train?kind=${k}`}
            aria-current={k === kind ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors",
              k === kind
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {KIND_META[k].label}
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{counts[k]}</span>
          </Link>
        ))}
      </nav>

      <p className="text-sm text-muted-foreground">{KIND_META[kind].description}</p>

      {/* key resets the editor's open form when switching tabs */}
      <KnowledgeEditor key={kind} kind={kind} entries={entries} />
    </PageShell>
  );
}
