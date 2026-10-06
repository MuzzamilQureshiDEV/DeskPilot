"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import { createClient } from "@/lib/supabase/client";

import { debounce, LIVE_TABLES, noticeFor, type LiveChange } from "./live-events";

/**
 * Keeps the dashboard live: any change to the shop's conversations, messages or
 * actions re-renders the current page (server data, client state kept).
 * Realtime applies RLS per subscriber, so only this shop's rows arrive.
 */
export function LiveRefresh({ shopId }: { shopId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const refresh = debounce(() => router.refresh(), 700);
    let channel = supabase.channel(`shop-${shopId}`);
    for (const table of LIVE_TABLES) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `shop_id=eq.${shopId}` }, (payload) => {
        const notice = noticeFor({
          table,
          eventType: payload.eventType,
          new: (payload.new ?? null) as Record<string, unknown> | null,
          old: (payload.old ?? null) as Record<string, unknown> | null,
        } satisfies LiveChange);
        if (notice) toast(notice.title, { action: { label: "View", onClick: () => router.push(notice.kind === "escalation" ? "/escalations" : "/approvals") } });
        refresh();
      });
    }
    channel.subscribe();
    return () => {
      refresh.cancel();
      void supabase.removeChannel(channel);
    };
  }, [router, shopId]);

  return <Toaster position="bottom-right" />;
}
