import { afterEach, describe, expect, it, vi } from "vitest";

import { debounce, noticeFor } from "./live-events";

describe("live notices", () => {
  const now = new Date().toISOString();

  it("toasts a new escalation and a new approval request only", () => {
    expect(noticeFor({ table: "conversations", eventType: "UPDATE", new: { status: "escalated", subject: "Refund", escalated_at: now }, old: { id: "x" } })).toEqual({
      kind: "escalation",
      title: "Needs you: Refund",
    });
    expect(noticeFor({ table: "action_requests", eventType: "INSERT", new: { status: "pending" }, old: null })?.kind).toBe("approval");
  });

  it("stays quiet for everything else", () => {
    // Already escalated before, or an old escalation touched again.
    expect(noticeFor({ table: "conversations", eventType: "UPDATE", new: { status: "escalated" }, old: { status: "escalated" } })).toBeNull();
    expect(noticeFor({ table: "conversations", eventType: "UPDATE", new: { status: "escalated", escalated_at: "2026-01-01T00:00:00Z" }, old: {} })).toBeNull();
    expect(noticeFor({ table: "conversations", eventType: "UPDATE", new: { status: "open" }, old: {} })).toBeNull();
    expect(noticeFor({ table: "messages", eventType: "INSERT", new: { role: "customer" }, old: null })).toBeNull();
    expect(noticeFor({ table: "action_requests", eventType: "UPDATE", new: { status: "executed" }, old: null })).toBeNull();
  });
});

describe("debounce", () => {
  afterEach(() => vi.useRealTimers());

  it("turns a burst of changes into one refresh", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 700);
    d();
    d();
    vi.advanceTimersByTime(500);
    d();
    vi.advanceTimersByTime(699);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    d();
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
