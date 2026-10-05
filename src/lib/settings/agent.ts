import { z } from "zod";

// Agent persona settings (Settings page). The tone text goes straight into the
// system prompt ("Your tone is …"), so presets are written as descriptions.

export const TONE_PRESETS = [
  { id: "friendly", label: "Friendly", tone: "friendly and warm" },
  { id: "professional", label: "Professional", tone: "professional and polite" },
  { id: "concise", label: "Short and clear", tone: "short, clear and to the point" },
  { id: "empathetic", label: "Calm and caring", tone: "calm, patient and empathetic" },
  { id: "playful", label: "Upbeat", tone: "upbeat and playful, but never flippant" },
] as const;

export const agentSettingsSchema = z
  .object({
    agentName: z
      .string()
      .trim()
      .min(1, "Give your agent a name")
      .max(40, "Keep the name under 40 characters")
      .regex(/^[\p{L}\p{N} .'-]+$/u, "Use letters, numbers, spaces, dots, apostrophes or dashes"),
    tonePreset: z.union([z.enum(TONE_PRESETS.map((t) => t.id) as [string, ...string[]]), z.literal("custom")]),
    customTone: z.string().trim().max(80, "Keep the tone under 80 characters").optional().default(""),
  })
  .refine((v) => v.tonePreset !== "custom" || v.customTone.length > 0, {
    message: "Describe the tone you want",
    path: ["customTone"],
  });

/** The tone text to store, from a preset id or the merchant's own words. */
export function toneText(preset: string, custom: string): string {
  return TONE_PRESETS.find((t) => t.id === preset)?.tone ?? custom.trim();
}

/** Which preset (if any) matches the stored tone. */
export function presetFor(tone: string): string {
  return TONE_PRESETS.find((t) => t.tone === tone || t.id === tone)?.id ?? "custom";
}
