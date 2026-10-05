"use client";

import { CheckCircle2 } from "lucide-react";
import { useActionState, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TONE_PRESETS, toneText } from "@/lib/settings/agent";
import { cn } from "@/lib/utils";

import { saveAgentSettings, type AgentSettingsState } from "./actions";

export function AgentForm({ agentName, preset, customTone }: { agentName: string; preset: string; customTone: string }) {
  const [state, action, pending] = useActionState<AgentSettingsState, FormData>(saveAgentSettings, {});
  const [name, setName] = useState(agentName);
  const [selected, setSelected] = useState(preset);
  const [custom, setCustom] = useState(customTone);
  const nameId = useId();
  const customId = useId();
  const tone = toneText(selected, custom) || "…";

  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor={nameId}>Agent name</Label>
        <Input id={nameId} name="agentName" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required className="max-w-xs" />
        <p className="text-xs text-muted-foreground">Customers see this name at the end of every reply.</p>
        {state.fieldErrors?.agentName && <p className="text-sm text-destructive">{state.fieldErrors.agentName[0]}</p>}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Tone of voice</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[...TONE_PRESETS, { id: "custom", label: "Your own words", tone: "" }].map((t) => (
            <label
              key={t.id}
              className={cn(
                "flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                selected === t.id ? "border-primary bg-primary/5" : "hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="tonePreset"
                value={t.id}
                checked={selected === t.id}
                onChange={() => setSelected(t.id)}
                className="sr-only"
              />
              <span className="font-medium">{t.label}</span>
              <span className="text-xs text-muted-foreground">{t.tone || "Describe it yourself"}</span>
            </label>
          ))}
        </div>
        {selected === "custom" && (
          <div className="mt-2 flex flex-col gap-2">
            <Label htmlFor={customId}>Describe the tone</Label>
            <Input
              id={customId}
              name="customTone"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              maxLength={80}
              placeholder="e.g. relaxed and friendly, like a local surf shop"
              className="max-w-md"
            />
            {state.fieldErrors?.customTone && <p className="text-sm text-destructive">{state.fieldErrors.customTone[0]}</p>}
          </div>
        )}
      </fieldset>

      <p className="rounded-lg bg-muted px-3 py-2 text-sm">
        <span className="text-muted-foreground">Preview: </span>
        {name || "Your agent"} will reply in a tone that is <strong>{tone}</strong>.
      </p>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.ok && !pending && (
          <span role="status" className="flex items-center gap-1 text-sm text-primary">
            <CheckCircle2 className="size-4" aria-hidden />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
