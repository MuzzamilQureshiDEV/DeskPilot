import { getPolicySchema } from "@/lib/ai/schemas";
import { defineTool } from "@/lib/ai/tools/types";

const MAX_ENTRIES = 3;
const STOP_WORDS = new Set(["the", "a", "an", "and", "or", "of", "to", "for", "is", "my", "do", "you", "what", "how", "can", "i"]);
const tokens = (text: string) =>
  (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => !STOP_WORDS.has(t));
const stem = (t: string) => (t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t);

export const getPolicy = defineTool({
  schema: getPolicySchema,
  definition: {
    name: "get_policy",
    description:
      "Look up the store's policies and FAQs (returns, exchanges, shipping, international shipping, cancellations, lost packages, sizing...). Always check the relevant policy before answering a policy question or proposing a refund, cancellation or address change.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "What you need, e.g. \"return window\" or \"international shipping\"." },
      },
      required: ["topic"],
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    const entries = ctx.knowledge.filter((k) => k.kind === "policy" || k.kind === "faq");
    if (entries.length === 0) {
      return { entries: [], note: "This store has no policies on file. Escalate if the answer depends on a policy." };
    }

    const wanted = new Set(tokens(input.topic).map(stem));
    const ranked = entries
      .map((e) => {
        const titleHits = tokens(e.title).map(stem).filter((t) => wanted.has(t)).length;
        const bodyHits = new Set(tokens(e.content).map(stem).filter((t) => wanted.has(t))).size;
        return { e, score: titleHits * 3 + bodyHits };
      })
      .filter((r) => r.score > 0)
      .toSorted((a, b) => b.score - a.score)
      .slice(0, MAX_ENTRIES);

    if (ranked.length === 0) {
      return {
        entries: [],
        available_topics: entries.map((e) => e.title),
        note: "No policy matched. Try one of the available topics. If none applies, escalate.",
      };
    }
    return { entries: ranked.map(({ e }) => ({ kind: e.kind, title: e.title, content: e.content })) };
  },
});
