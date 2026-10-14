import { z } from "zod";

// How the storefront chat looks, edited in Settings → Chat widget and stored
// in shops.widget. The theme editor can still override any field per theme
// (blank there = use these). Pure and safe for client code.

const text = (max: number) => z.string().trim().max(max);

export const widgetSchema = z.object({
  accent: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #0f766e."),
  title: text(40).min(1, "Add a title."),
  subtitle: text(40),
  greeting: text(200),
  position: z.enum(["right", "left"]),
  chips: z.array(text(40).min(1)).max(4, "Up to 4 quick questions."),
});

export type WidgetSettings = z.infer<typeof widgetSchema>;

export const WIDGET_DEFAULTS: WidgetSettings = {
  accent: "#0f766e",
  title: "Chat with us",
  subtitle: "Ava · AI support",
  greeting: "Hi! I'm Ava. Ask me about your order, shipping or our products.",
  position: "right",
  chips: ["Where's my order?", "Shipping times", "Returns"],
};

/** Stored JSON → full settings; anything missing or invalid falls back to the default. */
export function widgetSettings(stored: unknown): WidgetSettings {
  const obj = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const out = { ...WIDGET_DEFAULTS };
  for (const key of Object.keys(WIDGET_DEFAULTS) as (keyof WidgetSettings)[]) {
    const field = widgetSchema.shape[key].safeParse(obj[key]);
    if (field.success) (out as Record<string, unknown>)[key] = field.data;
  }
  return out;
}

/** What the widget shows: a theme-editor value wins when set, then AstaDesk, then the default. */
export function mergeWidget(theme: Partial<Record<keyof WidgetSettings, string>>, settings: WidgetSettings): WidgetSettings {
  const pick = <K extends "accent" | "title" | "subtitle" | "greeting">(k: K) => {
    const v = theme[k]?.trim();
    return v ? widgetSchema.shape[k].safeParse(v).data ?? settings[k] : settings[k];
  };
  const position = theme.position === "left" || theme.position === "right" ? theme.position : settings.position;
  return { ...settings, accent: pick("accent"), title: pick("title"), subtitle: pick("subtitle"), greeting: pick("greeting"), position };
}
