import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { CATEGORIES, MONEY_CATEGORIES, type Category } from "@/lib/ai/schemas";
import { PLANS, planOf } from "@/lib/billing/plans";
import type { Database } from "@/types/database";

// Automation settings per category (CLAUDE.md §7 step 5, §11). Plain
// functions on a Supabase client (RLS client in user context).

type Db = SupabaseClient<Database>;

export const MODES = ["off", "copilot", "autopilot"] as const;
export type Mode = (typeof MODES)[number];

export const MIN_THRESHOLD = 0.5;
export const MAX_THRESHOLD = 0.99;
export const DEFAULT_THRESHOLD = 0.85;

export const CATEGORY_META: Record<Category, { label: string; description: string }> = {
  order_status: { label: "Order status & tracking", description: "Where is my order, delivery estimates, tracking links." },
  product: { label: "Product questions", description: "Sizes, stock, materials, prices." },
  shipping: { label: "Shipping", description: "Shipping costs, times and countries." },
  policy: { label: "Policies", description: "Returns, exchanges and other store rules." },
  general: { label: "Everything else", description: "Greetings, thanks and general questions." },
  refund: { label: "Refunds", description: "Requests for money back." },
  cancel: { label: "Cancellations", description: "Requests to cancel an order." },
  address_change: { label: "Address changes", description: "Requests to change where an order ships." },
};

export const MODE_META: Record<Mode, { label: string; description: string }> = {
  off: { label: "Off", description: "The AI stays out; your team replies." },
  copilot: { label: "Copilot", description: "The AI drafts, you review and send." },
  autopilot: { label: "Autopilot", description: "Sends automatically when confident enough." },
};

export const isMoneyCategory = (c: Category) => (MONEY_CATEGORIES as readonly Category[]).includes(c);

export const settingInputSchema = z.object({
  category: z.enum(CATEGORIES),
  mode: z.enum(MODES),
  threshold: z.number().min(MIN_THRESHOLD).max(MAX_THRESHOLD),
});
export type SettingInput = z.infer<typeof settingInputSchema>;

export type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * Saves one category's setting. Autopilot is refused for money categories
 * (also a DB check) and for plans without autopilot. The agent job re-checks
 * the plan at run time too, so a stale setting can't send anything.
 */
export async function saveSetting(db: Db, shop: { id: string; plan: string }, raw: unknown): Promise<SaveResult> {
  const parsed = settingInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid setting." };
  const { category, mode, threshold } = parsed.data;

  if (mode === "autopilot" && isMoneyCategory(category)) {
    return { ok: false, error: "Refunds, cancellations and address changes always need your approval." };
  }
  if (mode === "autopilot" && !PLANS[planOf(shop.plan)].autopilot) {
    return { ok: false, error: "Autopilot is available on the Growth and Scale plans." };
  }

  const { error } = await db
    .from("automation_settings")
    .upsert(
      { shop_id: shop.id, category, mode, confidence_threshold: Math.round(threshold * 100) / 100 },
      { onConflict: "shop_id,category" },
    );
  return error ? { ok: false, error: "Couldn't save this setting." } : { ok: true };
}

export type SettingRow = { category: Category; mode: Mode; threshold: number };

/** All 8 categories, filling gaps with the defaults (copilot, 0.85). */
export async function loadSettings(db: Db, shopId: string): Promise<SettingRow[]> {
  const { data } = await db
    .from("automation_settings")
    .select("category, mode, confidence_threshold")
    .eq("shop_id", shopId);
  const byCategory = new Map((data ?? []).map((r) => [r.category, r]));
  return CATEGORIES.map((category) => {
    const r = byCategory.get(category);
    return {
      category,
      mode: (r?.mode as Mode | undefined) ?? "copilot",
      threshold: r ? Number(r.confidence_threshold) : DEFAULT_THRESHOLD,
    };
  });
}
