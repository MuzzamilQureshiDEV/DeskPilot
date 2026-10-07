import { z } from "zod";

import type { Category } from "@/lib/ai/schemas";
import type { DataUsed, ExplainStep } from "@/lib/sandbox/explain";
import { SCENARIO_IDS, sandboxCustomer } from "@/lib/sandbox/scenarios";

export const MAX_HISTORY_TURNS = 10;
export const MAX_MESSAGE_LENGTH = 1000;

export const sandboxRunSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("scenario"), scenario: z.enum(SCENARIO_IDS) }),
  z.object({
    kind: z.literal("free_text"),
    customerEmail: z.string().refine((e) => sandboxCustomer(e) !== null, "Pick one of the sample customers"),
    message: z.string().trim().min(1, "Write a message").max(MAX_MESSAGE_LENGTH),
    /** Earlier turns of this test conversation (kept in the browser). */
    history: z
      .array(z.object({ role: z.enum(["customer", "ai"]), body: z.string().max(4000) }))
      .max(MAX_HISTORY_TURNS),
  }),
]);
export type SandboxRunInput = z.infer<typeof sandboxRunSchema>;

export type SandboxProposal = {
  type: "refund" | "cancel" | "address_change";
  orderNumber: string;
  title: string;
  details: string[];
};

/** What would happen to this reply on a real conversation. */
export type LiveOutcome = "sent" | "draft" | "awaiting_approval" | "escalated" | "human";

export type SandboxRunResult = {
  reply: string;
  confidence: number;
  category: Category;
  sentiment: string;
  tags: string[];
  escalate: boolean;
  escalateReason: string | null;
  reasoning: string;
  tools: { name: string; ok: boolean }[];
  proposals: SandboxProposal[];
  /** Plain-language steps ("What Ava did") and the sample data used. */
  steps: ExplainStep[];
  data: DataUsed;
  outcome: LiveOutcome;
  /** True when the agent didn't finish normally and a safe holding reply was used. */
  fallback: boolean;
  freeTextRemaining: number | null;
};

export type SandboxRunResponse =
  | { ok: true; result: SandboxRunResult }
  | {
      ok: false;
      code: "invalid" | "no_shop" | "not_configured" | "limit" | "ai_unavailable";
      message: string;
    };
