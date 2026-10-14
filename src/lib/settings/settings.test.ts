import { describe, expect, it } from "vitest";

import { classifyInbound } from "@/lib/email/filters";
import { withSignature } from "@/lib/email/outbound";
import { EMAIL_FILTER_DEFAULTS, emailFilters, parseSenderList, senderMatches } from "@/lib/settings/email-filters";
import { mergeWidget, WIDGET_DEFAULTS, widgetSettings } from "@/lib/settings/widget";

describe("chat widget settings", () => {
  it("fills missing or invalid fields with defaults", () => {
    expect(widgetSettings(null)).toEqual(WIDGET_DEFAULTS);
    const w = widgetSettings({ accent: "red", title: "Help", chips: ["a", "b", "c", "d", "e"], position: "middle" });
    expect(w.accent).toBe(WIDGET_DEFAULTS.accent);
    expect(w.title).toBe("Help");
    expect(w.chips).toEqual(WIDGET_DEFAULTS.chips); // 5 chips is invalid → default
    expect(w.position).toBe("right");
  });

  it("theme editor values win, blanks fall back to AstaDesk settings", () => {
    const settings = { ...WIDGET_DEFAULTS, title: "AstaDesk title", accent: "#123456" };
    expect(mergeWidget({ title: "  ", accent: "#abcdef", position: "left" }, settings)).toMatchObject({
      title: "AstaDesk title",
      accent: "#abcdef",
      position: "left",
    });
    expect(mergeWidget({ accent: "not-a-colour" }, settings).accent).toBe("#123456");
  });
});

describe("email filters", () => {
  const base = { from: "jane@shop.com", subject: "Help", headers: [], ownAddresses: [], recentFromSender: 0 };

  it("parses sender lists and matches domains, subdomains and addresses", () => {
    expect(parseSenderList("Brand.com, bills@bank.com\n@news.io")).toEqual({ ok: true, list: ["brand.com", "bills@bank.com", "news.io"] });
    expect(parseSenderList("not a domain")).toEqual({ ok: false, invalid: "not" });
    expect(senderMatches("x@mail.brand.com", ["brand.com"])).toBe(true);
    expect(senderMatches("x@notbrand.com", ["brand.com"])).toBe(false);
    expect(senderMatches("Bills@Bank.com", ["bills@bank.com"])).toBe(true);
  });

  it("blocks listed senders and lets always-allowed senders past the newsletter guesses", () => {
    const filters = { ...EMAIL_FILTER_DEFAULTS, blocked: ["spam.io"], allowed: ["supplier.com"] };
    expect(classifyInbound({ ...base, from: "a@spam.io", filters })).toEqual({ accept: false, reason: "blocked_sender" });
    expect(classifyInbound({ ...base, from: "alerts@supplier.com", filters })).toEqual({ accept: true });
    expect(classifyInbound({ ...base, from: "alerts@other.com", filters })).toEqual({ accept: false, reason: "notification_sender" });
    // Auto-replies are always ignored, even from allowed senders.
    expect(classifyInbound({ ...base, from: "a@supplier.com", headers: [{ Name: "Auto-Submitted", Value: "auto-replied" }], filters }).accept).toBe(false);
  });

  it("newsletter checks can be switched off", () => {
    const filters = { ...EMAIL_FILTER_DEFAULTS, skipNewsletters: false };
    expect(classifyInbound({ ...base, headers: [{ Name: "List-Unsubscribe", Value: "<x>" }], filters })).toEqual({ accept: true });
    expect(emailFilters({ maxAutoReplies: 99 })).toEqual(EMAIL_FILTER_DEFAULTS); // invalid → defaults
  });
});

describe("email signature", () => {
  it("is added under emailed replies only when set", () => {
    expect(withSignature("Hi Sam!\n", "Warm regards,\nAura")).toBe("Hi Sam!\n\nWarm regards,\nAura");
    expect(withSignature("Hi Sam!", "  ")).toBe("Hi Sam!");
  });
});
