// Verify IDs against Anthropic docs before changing.
export const MODELS = {
  /** Main support agent. */
  agent: "claude-sonnet-5",
  /** Cheap classification: spam/auto-reply detection, tagging. */
  classifier: "claude-haiku-4-5-20251001",
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];
