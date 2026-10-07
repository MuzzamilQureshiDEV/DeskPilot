import { describe, expect, it } from "vitest";

import { buildChecklist, checklistProgress, type SetupState } from "@/lib/home/checklist";
import { average, dailyBuckets } from "@/lib/home/stats";
import { agentSettingsSchema, presetFor, toneText } from "@/lib/settings/agent";

const fresh: SetupState = { storeConnected: false, policyCount: 0, emailConnected: false, toneChosen: false, testRuns: 0, live: false };

describe("setup checklist", () => {
  it("starts with nothing done", () => {
    const items = buildChecklist(fresh, "Ava");
    expect(items.map((i) => i.id)).toEqual(["store", "policies", "tone", "test", "email", "live"]);
    expect(items.every((i) => !i.done)).toBe(true);
    expect(items.some((i) => i.comingSoon)).toBe(false);
    expect(checklistProgress(items)).toEqual({ done: 0, total: 6 });
    expect(items[2]?.title).toBe("Name Ava and choose a tone");
  });

  it("ticks steps off from real state", () => {
    const items = buildChecklist({ ...fresh, storeConnected: true, policyCount: 2, toneChosen: true, testRuns: 1 }, "Ava");
    expect(items.filter((i) => i.done).map((i) => i.id)).toEqual(["store", "policies", "tone", "test"]);
    expect(checklistProgress(items)).toEqual({ done: 4, total: 6 });
  });

  it("ticks email and go-live", () => {
    const items = buildChecklist({ ...fresh, emailConnected: true, live: true }, "Ava");
    expect(checklistProgress(items)).toEqual({ done: 2, total: 6 });
  });
});

describe("average", () => {
  it("returns null for no values", () => {
    expect(average([])).toBeNull();
    expect(average([0.5, 1])).toBe(0.75);
  });
});

describe("agent settings", () => {
  it("accepts a preset or the merchant's own tone", () => {
    expect(agentSettingsSchema.safeParse({ agentName: "Nova", tonePreset: "friendly" }).success).toBe(true);
    expect(agentSettingsSchema.safeParse({ agentName: "Nova", tonePreset: "custom", customTone: "like a surf shop" }).success).toBe(true);
    expect(toneText("concise", "")).toBe("short, clear and to the point");
    expect(toneText("custom", " relaxed ")).toBe("relaxed");
  });

  it.each([
    ["empty name", { agentName: " ", tonePreset: "friendly" }],
    ["name with markup", { agentName: "<b>Ava</b>", tonePreset: "friendly" }],
    ["unknown preset", { agentName: "Ava", tonePreset: "rude" }],
    ["custom without words", { agentName: "Ava", tonePreset: "custom", customTone: "  " }],
    ["custom too long", { agentName: "Ava", tonePreset: "custom", customTone: "x".repeat(81) }],
  ])("rejects %s", (_l, input) => {
    expect(agentSettingsSchema.safeParse(input).success).toBe(false);
  });

  it("maps stored tones back to presets", () => {
    expect(presetFor("friendly")).toBe("friendly"); // the signup default
    expect(presetFor("calm, patient and empathetic")).toBe("empathetic");
    expect(presetFor("like a surf shop")).toBe("custom");
  });
});

describe("daily trend buckets", () => {
  const now = new Date("2026-10-07T15:00:00Z");
  it("counts per UTC day, oldest first, ignoring older or empty dates", () => {
    const b = dailyBuckets(["2026-10-07T01:00:00Z", "2026-10-07T23:00:00Z", "2026-10-06T12:00:00Z", "2026-09-01T00:00:00Z", null], now, 3);
    expect(b).toEqual([0, 1, 2]);
  });
});
