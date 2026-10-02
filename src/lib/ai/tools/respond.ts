import type Anthropic from "@anthropic-ai/sdk";

import { CATEGORIES, SENTIMENTS } from "@/lib/ai/schemas";

/**
 * The final step of every run. Its input is validated with `respondSchema`
 * in the agent loop rather than executed like the other tools.
 */
export const RESPOND_TOOL: Anthropic.Tool = {
  name: "respond",
  description:
    "Submit your final reply. Call this exactly once, as your last step, after any lookups. Never answer the customer in plain text. The reply goes through this tool.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      reply: {
        type: "string",
        description: "The message to the customer: plain text, no markdown, short, signed with your name.",
      },
      confidence: {
        type: "number",
        description:
          "0 to 1: how sure you are the reply is correct and complete based only on tool results and store knowledge. Below 0.7 if anything is assumed.",
      },
      category: { type: "string", enum: [...CATEGORIES], description: "Main topic of the customer's request." },
      sentiment: { type: "string", enum: [...SENTIMENTS], description: "The customer's mood." },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Up to 5 short lowercase tags, e.g. \"delayed\", \"wrong-size\".",
      },
      escalate: {
        type: "boolean",
        description: "True if a person should handle this (missing data, unclear identity, angry or legal, outside policy, asks for a human).",
      },
      escalate_reason: {
        type: "string",
        description: "Why you escalated, for the merchant. Empty string when escalate is false.",
      },
      reasoning: {
        type: "string",
        description: "For the merchant: which facts you used and why you replied this way. One to three sentences.",
      },
    },
    required: ["reply", "confidence", "category", "sentiment", "tags", "escalate", "escalate_reason", "reasoning"],
    additionalProperties: false,
  },
};
