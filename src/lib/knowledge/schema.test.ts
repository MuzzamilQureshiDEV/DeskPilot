import { describe, expect, it } from "vitest";

import {
  KIND_META,
  KNOWLEDGE_KINDS,
  knowledgeInputSchema,
  MAX_CONTENT,
  MAX_TITLE,
  parseKind,
  TEMPLATES,
} from "@/lib/knowledge/schema";

const valid = { kind: "policy", title: "  Returns ", content: " 30 days. " };

describe("knowledgeInputSchema", () => {
  it("trims and accepts valid input", () => {
    expect(knowledgeInputSchema.parse(valid)).toEqual({ kind: "policy", title: "Returns", content: "30 days." });
  });

  it.each([
    ["unknown kind", { kind: "secret_rules" }],
    ["empty title", { title: "   " }],
    ["title too long", { title: "x".repeat(MAX_TITLE + 1) }],
    ["empty content", { content: "" }],
    ["content too long", { content: "x".repeat(MAX_CONTENT + 1) }],
  ])("rejects %s", (_label, override) => {
    expect(knowledgeInputSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});

describe("kinds and templates", () => {
  it("parseKind falls back to policies", () => {
    expect(parseKind("faq")).toBe("faq");
    expect(parseKind("../../etc")).toBe("policy");
    expect(parseKind(undefined)).toBe("policy");
  });

  it("keeps prompt-heavy kinds small", () => {
    expect(KIND_META.brand.max).toBeLessThanOrEqual(5);
    expect(KIND_META.example_reply.max).toBeLessThanOrEqual(10);
    expect(KNOWLEDGE_KINDS.every((k) => KIND_META[k].max > 0)).toBe(true);
  });

  it("templates are valid entries with brackets to fill in", () => {
    for (const [kind, list] of Object.entries(TEMPLATES)) {
      for (const t of list ?? []) {
        expect(knowledgeInputSchema.safeParse({ kind, ...t }).success, t.title).toBe(true);
        expect(t.content, t.title).toContain("[");
      }
    }
  });
});
