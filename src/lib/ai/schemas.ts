import { z } from "zod";

// Zod schemas validate every tool input and the final `respond` output.
// The JSON schemas sent to Claude live next to each tool; these are the
// authoritative runtime check (CLAUDE.md rule: Zod for every external input,
// and AI output counts as external).

export const CATEGORIES = [
  "order_status",
  "product",
  "shipping",
  "policy",
  "general",
  "refund",
  "cancel",
  "address_change",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const MONEY_CATEGORIES = ["refund", "cancel", "address_change"] as const satisfies readonly Category[];

export const SENTIMENTS = ["positive", "neutral", "negative", "angry"] as const;

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const respondSchema = z
  .object({
    reply: shortText(4000),
    confidence: z.number().min(0).max(1),
    category: z.enum(CATEGORIES),
    sentiment: z.enum(SENTIMENTS),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(5),
    escalate: z.boolean(),
    // Empty string from the model means "no reason".
    escalate_reason: z
      .string()
      .trim()
      .max(500)
      .transform((v) => (v === "" ? null : v)),
    reasoning: shortText(2000),
  })
  .refine((v) => !v.escalate || v.escalate_reason !== null, {
    message: "escalate_reason is required when escalate is true",
    path: ["escalate_reason"],
  });
export type RespondOutput = z.infer<typeof respondSchema>;

export const lookupOrderSchema = z
  .object({
    order_number: z.string().trim().max(32).optional(),
    email: z.string().trim().max(254).optional(),
  })
  .refine((v) => !!v.order_number || !!v.email, {
    message: "Provide order_number, email, or both",
  });

export const orderIdSchema = z.object({ order_id: z.string().trim().min(1).max(200) });

export const searchProductsSchema = z.object({ query: shortText(200) });

export const getPolicySchema = z.object({ topic: shortText(200) });

export const proposeRefundSchema = z
  .object({
    order_id: z.string().trim().min(1).max(200),
    line_items: z
      .array(
        z.object({
          line_item_id: z.string().trim().min(1).max(200),
          quantity: z.number().int().min(1).max(100),
        }),
      )
      .max(50)
      .optional(),
    amount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, "amount must be a decimal like 12.50")
      .optional(),
    reason: shortText(500),
  })
  .refine((v) => (v.line_items?.length ?? 0) > 0 || v.amount !== undefined, {
    message: "Provide line_items or amount",
  });

export const proposeCancellationSchema = z.object({
  order_id: z.string().trim().min(1).max(200),
  reason: shortText(500),
});

export const addressSchema = z.object({
  name: shortText(200),
  address1: shortText(200),
  address2: z.string().trim().max(200).optional(),
  city: shortText(100),
  province: z.string().trim().max(100).optional(),
  zip: shortText(20),
  country: shortText(100),
});

export const proposeAddressChangeSchema = z.object({
  order_id: z.string().trim().min(1).max(200),
  new_address: addressSchema,
  reason: shortText(500),
});
