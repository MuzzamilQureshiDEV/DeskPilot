import { MONEY_CATEGORIES, type Category } from "@/lib/ai/schemas";
import type { AgentResult } from "@/lib/ai/agent";

export type AutomationMode = "off" | "copilot" | "autopilot";

export type AutomationSetting = { mode: AutomationMode; confidenceThreshold: number };

export type Outcome = {
  /** Status of the AI's message row. Only "sent" goes out to the customer. */
  messageStatus: "draft" | "sent";
  conversationStatus: "open" | "ai_drafted" | "awaiting_approval" | "escalated" | "human";
  /** Proposed money actions to store as `pending` action_requests. */
  createActionRequests: boolean;
};

const isMoney = (c: Category) => (MONEY_CATEGORIES as readonly Category[]).includes(c);

/**
 * CLAUDE.md §7 step 5: what happens to an agent result. Pure, so it can be
 * tested exhaustively. Money actions are never sent automatically, whatever
 * the mode, plan or confidence.
 */
export function decideOutcome(
  result: Pick<AgentResult, "response" | "proposals">,
  setting: AutomationSetting,
  opts: { autopilotAllowedByPlan: boolean },
): Outcome {
  const { response, proposals } = result;

  if (response.escalate) {
    return { messageStatus: "draft", conversationStatus: "escalated", createActionRequests: proposals.length > 0 };
  }
  if (proposals.length > 0) {
    return { messageStatus: "draft", conversationStatus: "awaiting_approval", createActionRequests: true };
  }
  // "off": the merchant handles this category personally; keep the draft as a suggestion.
  if (setting.mode === "off") {
    return { messageStatus: "draft", conversationStatus: "human", createActionRequests: false };
  }

  const canAutoSend =
    setting.mode === "autopilot" &&
    opts.autopilotAllowedByPlan &&
    !isMoney(response.category) &&
    response.confidence >= setting.confidenceThreshold;

  return canAutoSend
    ? { messageStatus: "sent", conversationStatus: "open", createActionRequests: false }
    : { messageStatus: "draft", conversationStatus: "ai_drafted", createActionRequests: false };
}
