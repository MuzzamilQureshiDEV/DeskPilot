import type Anthropic from "@anthropic-ai/sdk";

import { getPolicy } from "@/lib/ai/tools/get-policy";
import { getTracking } from "@/lib/ai/tools/get-tracking";
import { lookupOrder } from "@/lib/ai/tools/lookup-order";
import { proposeAddressChange } from "@/lib/ai/tools/propose-address-change";
import { proposeCancellation } from "@/lib/ai/tools/propose-cancellation";
import { proposeRefund } from "@/lib/ai/tools/propose-refund";
import { RESPOND_TOOL } from "@/lib/ai/tools/respond";
import { searchProducts } from "@/lib/ai/tools/search-products";
import type { AgentTool } from "@/lib/ai/tools/types";

/** Executable tools by name. Order is fixed so the tools prefix stays cacheable. */
export const AGENT_TOOLS: Record<string, AgentTool> = {
  lookup_order: lookupOrder,
  get_tracking: getTracking,
  search_products: searchProducts,
  get_policy: getPolicy,
  propose_refund: proposeRefund,
  propose_cancellation: proposeCancellation,
  propose_address_change: proposeAddressChange,
};

/** Tool definitions sent to Claude: the executable tools, then `respond` last. */
export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  ...Object.values(AGENT_TOOLS).map((t) => t.definition),
  RESPOND_TOOL,
];
