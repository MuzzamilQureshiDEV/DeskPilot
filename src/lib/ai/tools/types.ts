import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

import type { StoreProvider } from "@/lib/store/types";
import type { Json } from "@/types/database";

export type KnowledgeEntry = {
  kind: "policy" | "faq" | "brand" | "example_reply";
  title: string;
  content: string;
};

/** A money action the AI proposed. Becomes a `pending` action_request; never executed here. */
export type ProposedAction = {
  type: "refund" | "cancel" | "address_change";
  orderId: string;
  payload: { [key: string]: Json };
};

/** Per-run state shared by the tools. Built fresh for every agent run. */
export type ToolContext = {
  provider: StoreProvider;
  knowledge: KnowledgeEntry[];
  /**
   * The sender's address when we know it (email channel, sandbox scenarios).
   * Order lookups are pinned to it. Null on chat, where the customer must give
   * both order number and email.
   */
  customerEmail: string | null;
  /** Orders this customer proved they own during this run (via lookup_order). */
  verifiedOrderIds: Set<string>;
  proposals: ProposedAction[];
};

/** Expected failure. The message is shown to the model, so keep it safe and actionable. */
export class ToolError extends Error {}

export type AgentTool<S extends z.ZodType = z.ZodType> = {
  definition: Anthropic.Tool;
  schema: S;
  run(input: z.infer<S>, ctx: ToolContext): Promise<Json>;
};

export function defineTool<S extends z.ZodType>(tool: AgentTool<S>): AgentTool<S> {
  return tool;
}
