import { z } from "zod";

// Knowledge the merchant teaches the agent (Train page). Pure: shared by the
// page, the server actions and tests.

export const KNOWLEDGE_KINDS = ["policy", "faq", "brand", "example_reply"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export const MAX_TITLE = 120;
export const MAX_CONTENT = 4000;

type KindMeta = {
  label: string;
  singular: string;
  description: string;
  /** Max entries per shop. Brand info and example replies go into every prompt, so keep them few. */
  max: number;
  titlePlaceholder: string;
  contentPlaceholder: string;
};

export const KIND_META: Record<KnowledgeKind, KindMeta> = {
  policy: {
    label: "Policies",
    singular: "policy",
    description:
      "Rules for returns, shipping, cancellations and similar. The agent checks these before answering policy questions or proposing refunds.",
    max: 30,
    titlePlaceholder: "e.g. Returns and exchanges",
    contentPlaceholder: "e.g. Unworn items can be returned within 30 days of delivery for a full refund…",
  },
  faq: {
    label: "FAQs",
    singular: "FAQ",
    description: "Common questions and the answers you want customers to get.",
    max: 100,
    titlePlaceholder: "e.g. Do you ship to Canada?",
    contentPlaceholder: "e.g. Yes. Canadian orders arrive in 7–10 business days and shipping is a flat $15.",
  },
  brand: {
    label: "Brand",
    singular: "brand note",
    description:
      "Who you are and how you talk: your story, voice, and things to always or never say. Included in every reply, so keep it short.",
    max: 5,
    titlePlaceholder: "e.g. About us",
    contentPlaceholder: "e.g. We're a family-run shop making handmade candles. We keep things warm and personal…",
  },
  example_reply: {
    label: "Example replies",
    singular: "example reply",
    description:
      "Replies you've written and liked. The agent copies their style and tone, not their facts. The 5 most recent are used.",
    max: 10,
    titlePlaceholder: "e.g. Late delivery apology",
    contentPlaceholder: "e.g. Hi Sam, I'm so sorry your order is running late. I've checked with the carrier and…",
  },
};

export const knowledgeInputSchema = z.object({
  kind: z.enum(KNOWLEDGE_KINDS),
  title: z.string().trim().min(1, "Add a title").max(MAX_TITLE, `Keep the title under ${MAX_TITLE} characters`),
  content: z
    .string()
    .trim()
    .min(1, "Add some content")
    .max(MAX_CONTENT, `Keep it under ${MAX_CONTENT} characters`),
});
export type KnowledgeInput = z.infer<typeof knowledgeInputSchema>;

export const knowledgeIdSchema = z.uuid();

export function parseKind(value: unknown): KnowledgeKind {
  return KNOWLEDGE_KINDS.find((k) => k === value) ?? "policy";
}

/** Starter templates: generic wording with [brackets] for the merchant to fill in. */
export const TEMPLATES: Partial<Record<KnowledgeKind, { title: string; content: string }[]>> = {
  policy: [
    {
      title: "Returns and exchanges",
      content:
        "Items can be returned within [30] days of delivery if they're unused and in their original packaging. Refunds go back to the original payment method within [5] business days of the return arriving. Exchanges for a different size or color are [free]. [Sale items / gift cards] can't be returned.",
    },
    {
      title: "Shipping",
      content:
        "Orders ship within [1–2] business days. Standard delivery takes [3–5] business days after shipping. Shipping is free on orders over [$50]; otherwise it's a flat [$5.99]. We ship to [list of countries].",
    },
    {
      title: "Cancellations and address changes",
      content:
        "Orders can be cancelled or have their shipping address changed until they ship, usually within [24 hours] of ordering. Once an order has shipped it can't be cancelled, but it can be returned under our returns policy.",
    },
  ],
  faq: [
    {
      title: "My package says delivered but I don't have it",
      content:
        "Please check around your property and with neighbors, and wait one business day, since carriers sometimes mark packages delivered early. If it still hasn't arrived, reply to us and we'll open a claim with the carrier and arrange a [replacement or refund].",
    },
    {
      title: "How do I know my size?",
      content: "Our items fit [true to size]. If you're between sizes, we recommend [sizing up]. Measurements for each item are on its product page.",
    },
  ],
};
