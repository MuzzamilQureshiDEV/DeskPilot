import { describe, expect, it } from "vitest";

import { decideOutcome, type AutomationSetting } from "@/lib/ai/outcome";
import { CATEGORIES, MONEY_CATEGORIES, type Category, type RespondOutput } from "@/lib/ai/schemas";
import type { ProposedAction } from "@/lib/ai/tools/types";

const response = (over: Partial<RespondOutput> = {}): RespondOutput => ({
  reply: "Hi",
  confidence: 0.95,
  category: "order_status",
  sentiment: "neutral",
  tags: [],
  escalate: false,
  escalate_reason: null,
  reasoning: "r",
  ...over,
});
const autopilot: AutomationSetting = { mode: "autopilot", confidenceThreshold: 0.85 };
const plan = { autopilotAllowedByPlan: true };
const proposal: ProposedAction = { type: "refund", orderId: "o1", payload: {} };

describe("decideOutcome", () => {
  it("auto-sends only with autopilot, plan support and enough confidence", () => {
    expect(decideOutcome({ response: response(), proposals: [] }, autopilot, plan)).toEqual({
      messageStatus: "sent",
      conversationStatus: "open",
      createActionRequests: false,
    });
    expect(decideOutcome({ response: response({ confidence: 0.84 }), proposals: [] }, autopilot, plan).messageStatus).toBe("draft");
    expect(decideOutcome({ response: response(), proposals: [] }, autopilot, { autopilotAllowedByPlan: false }).messageStatus).toBe("draft");
    expect(
      decideOutcome({ response: response(), proposals: [] }, { ...autopilot, mode: "copilot" }, plan),
    ).toMatchObject({ messageStatus: "draft", conversationStatus: "ai_drafted" });
  });

  it("escalations are drafts in the escalated state", () => {
    const out = decideOutcome({ response: response({ escalate: true, escalate_reason: "x" }), proposals: [] }, autopilot, plan);
    expect(out).toMatchObject({ messageStatus: "draft", conversationStatus: "escalated" });
  });

  it("proposals wait for approval and are stored as action requests", () => {
    const out = decideOutcome({ response: response({ category: "refund" }), proposals: [proposal] }, autopilot, plan);
    expect(out).toEqual({ messageStatus: "draft", conversationStatus: "awaiting_approval", createActionRequests: true });
  });

  it("mode off hands the conversation to a person", () => {
    const out = decideOutcome({ response: response(), proposals: [] }, { ...autopilot, mode: "off" }, plan);
    expect(out).toMatchObject({ messageStatus: "draft", conversationStatus: "human" });
  });

  it("never auto-sends anything involving money, whatever the settings", () => {
    const anything: AutomationSetting = { mode: "autopilot", confidenceThreshold: 0 };
    for (const category of CATEGORIES) {
      for (const proposals of [[], [proposal]]) {
        const out = decideOutcome({ response: response({ category, confidence: 1 }), proposals }, anything, plan);
        const money = (MONEY_CATEGORIES as readonly Category[]).includes(category) || proposals.length > 0;
        if (money) expect(out.messageStatus, `${category}/${proposals.length}`).toBe("draft");
      }
    }
  });
});
