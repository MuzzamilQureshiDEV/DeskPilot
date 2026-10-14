"use client";

import { ArrowUp, Plus, X } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WIDGET_DEFAULTS, widgetSchema, type WidgetSettings } from "@/lib/settings/widget";
import { cn } from "@/lib/utils";

import { saveWidget } from "./settings-actions";

const SWATCHES = ["#0f766e", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#111827"];

/** Settings → Chat widget: edit the storefront chat and see it live. */
export function WidgetEditor({ initial, storeName }: { initial: WidgetSettings; storeName: string }) {
  const [w, setW] = useState(initial);
  const [chip, setChip] = useState("");
  const [pending, startTransition] = useTransition();
  const ids = { accent: useId(), title: useId(), subtitle: useId(), greeting: useId(), chip: useId() };
  const set = <K extends keyof WidgetSettings>(k: K, v: WidgetSettings[K]) => setW((p) => ({ ...p, [k]: v }));
  const changed = JSON.stringify(w) !== JSON.stringify(initial);
  const validAccent = /^#[0-9a-fA-F]{6}$/.test(w.accent) ? w.accent : WIDGET_DEFAULTS.accent;

  function addChip() {
    const c = chip.trim().slice(0, 40);
    if (!c || w.chips.length >= 4 || w.chips.includes(c)) return;
    set("chips", [...w.chips, c]);
    setChip("");
  }

  function save() {
    const parsed = widgetSchema.safeParse(w);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form.");
      return;
    }
    startTransition(async () => {
      const res = await saveWidget(parsed.data);
      if (res.ok) toast.success("Chat widget saved. Your store shows it within a few minutes.");
      else toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.accent}>Accent colour</Label>
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use ${c}`}
                aria-pressed={w.accent.toLowerCase() === c}
                onClick={() => set("accent", c)}
                className={cn("size-8 rounded-full ring-offset-2 ring-offset-background transition", w.accent.toLowerCase() === c && "ring-2 ring-foreground")}
                style={{ background: c }}
              />
            ))}
            <input
              id={ids.accent}
              type="color"
              value={validAccent}
              onChange={(e) => set("accent", e.target.value)}
              className="size-8 cursor-pointer rounded-full border bg-transparent"
              aria-label="Pick any colour"
            />
            <Input value={w.accent} onChange={(e) => set("accent", e.target.value)} className="w-28 font-mono" maxLength={7} aria-label="Colour code" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.title}>Title</Label>
            <Input id={ids.title} value={w.title} maxLength={40} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.subtitle}>Subtitle</Label>
            <Input id={ids.subtitle} value={w.subtitle} maxLength={40} onChange={(e) => set("subtitle", e.target.value)} placeholder="Ava · AI support" />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.greeting}>Greeting</Label>
          <Textarea id={ids.greeting} value={w.greeting} maxLength={200} rows={2} onChange={(e) => set("greeting", e.target.value)} />
          <p className="text-xs text-muted-foreground">The first message shoppers see when they open the chat.</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.chip}>Quick questions</Label>
          <div className="flex flex-wrap gap-2">
            {w.chips.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full border bg-background py-1 pr-1 pl-3 text-sm">
                {c}
                <button type="button" aria-label={`Remove ${c}`} onClick={() => set("chips", w.chips.filter((x) => x !== c))} className="rounded-full p-0.5 hover:bg-muted">
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            ))}
          </div>
          {w.chips.length < 4 && (
            <div className="flex gap-2">
              <Input
                id={ids.chip}
                value={chip}
                maxLength={40}
                placeholder="e.g. Do you ship to Malaysia?"
                onChange={(e) => setChip(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addChip();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addChip} disabled={!chip.trim()}>
                <Plus aria-hidden /> Add
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Up to 4 one-tap questions under the greeting. They disappear once the chat starts.</p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Position</legend>
          <div className="flex gap-2">
            {(["right", "left"] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={w.position === p}
                onClick={() => set("position", p)}
                className={cn("rounded-lg border px-4 py-2 text-sm transition-colors", w.position === p ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted")}
              >
                Bottom {p}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button type="button" onClick={save} disabled={pending || !changed}>
            {pending ? "Saving…" : "Save widget"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setW(WIDGET_DEFAULTS)} disabled={pending}>
            Reset to default
          </Button>
        </div>
      </div>

      <WidgetPreview w={{ ...w, accent: validAccent }} storeName={storeName} />
    </div>
  );
}

function WidgetPreview({ w, storeName }: { w: WidgetSettings; storeName: string }) {
  return (
    <div className="flex flex-col items-center gap-2 lg:sticky lg:top-20 lg:self-start">
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Live preview</p>
      <div className="w-full max-w-[300px] rounded-[2.2rem] border-[10px] border-neutral-900 bg-neutral-900 shadow-lift" aria-label="Chat preview" role="img">
        <div className="relative flex h-[520px] flex-col overflow-hidden rounded-[1.6rem] bg-white text-neutral-900">
          <div className="flex items-center justify-between border-b px-4 py-2.5 text-[11px] font-semibold tracking-wider uppercase">
            <span className="truncate">{storeName}</span>
            <span className="text-neutral-400">☰</span>
          </div>
          <div className="flex items-center gap-2.5 px-4 py-3 text-white" style={{ background: `linear-gradient(145deg, color-mix(in srgb, ${w.accent} 82%, white), ${w.accent})` }}>
            <span className="relative flex size-9 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">
              A<span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-white bg-emerald-400" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{w.title || "Chat with us"}</p>
              <p className="truncate text-[11px] opacity-85">{w.subtitle || "Ava · AI support"}</p>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2 bg-neutral-50 p-3">
            {w.greeting && <p className="max-w-[85%] self-start rounded-2xl rounded-bl-md bg-white px-3 py-2 text-[13px] shadow-sm">{w.greeting}</p>}
            <div className="flex flex-wrap gap-1.5">
              {w.chips.map((c) => (
                <span
                  key={c}
                  className="rounded-full border px-2.5 py-1 text-[12px]"
                  style={{ borderColor: `color-mix(in srgb, ${w.accent} 35%, white)`, background: `color-mix(in srgb, ${w.accent} 10%, white)`, color: `color-mix(in srgb, ${w.accent} 80%, black)` }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 border-t bg-white p-2.5">
            <span className="flex-1 rounded-full border px-3 py-2 text-[12px] text-neutral-400">Write a message…</span>
            <span className="flex size-8 items-center justify-center rounded-full text-white" style={{ background: w.accent }}>
              <ArrowUp className="size-4" aria-hidden />
            </span>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Bubble sits at the bottom {w.position}.</p>
    </div>
  );
}
