import { describe, expect, it } from "vitest";

import { isDashboardPath, isGuestOnlyPath, safeNextPath } from "@/lib/auth/routes";
import { loginSchema, signupSchema, updatePasswordSchema } from "@/lib/auth/schemas";

describe("safeNextPath", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNextPath("/inbox")).toBe("/inbox");
    expect(safeNextPath("/inbox/123?tab=ai")).toBe("/inbox/123?tab=ai");
  });

  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "evil.com",
    "/\t/evil.com",
    "",
    null,
    undefined,
    42,
  ])("rejects %j", (next) => {
    expect(safeNextPath(next)).toBe("/home");
  });

  it("uses the given fallback", () => {
    expect(safeNextPath("//evil.com", "")).toBe("");
  });
});

describe("route groups", () => {
  it("detects dashboard paths", () => {
    expect(isDashboardPath("/home")).toBe(true);
    expect(isDashboardPath("/inbox/abc")).toBe(true);
    expect(isDashboardPath("/")).toBe(false);
    expect(isDashboardPath("/login")).toBe(false);
    expect(isDashboardPath("/homepage")).toBe(false);
  });

  it("detects guest-only paths", () => {
    expect(isGuestOnlyPath("/login")).toBe(true);
    expect(isGuestOnlyPath("/signup")).toBe(true);
    expect(isGuestOnlyPath("/reset")).toBe(false);
  });
});

describe("signupSchema", () => {
  const valid = { shopName: "  Harbor & Pine ", email: " Owner@Example.COM ", password: "longenough" };

  it("normalises valid input", () => {
    expect(signupSchema.parse(valid)).toEqual({
      shopName: "Harbor & Pine",
      email: "owner@example.com",
      password: "longenough",
    });
  });

  it.each([
    ["empty store name", { shopName: "   " }],
    ["store name over 80 chars", { shopName: "x".repeat(81) }],
    ["bad email", { email: "not-an-email" }],
    ["short password", { password: "short" }],
    ["password over 72 chars", { password: "x".repeat(73) }],
  ])("rejects %s", (_label, override) => {
    expect(signupSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("requires a password but no minimum length", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });

  it("drops unknown fields such as next", () => {
    const parsed = loginSchema.parse({ email: "a@b.co", password: "x", next: "/inbox" });
    expect(parsed).toEqual({ email: "a@b.co", password: "x" });
  });
});

describe("updatePasswordSchema", () => {
  it("requires matching passwords", () => {
    expect(
      updatePasswordSchema.safeParse({ password: "longenough", confirm: "longenough" }).success,
    ).toBe(true);
    const mismatch = updatePasswordSchema.safeParse({ password: "longenough", confirm: "different1" });
    expect(mismatch.success).toBe(false);
    expect(mismatch.error?.issues[0]?.path).toEqual(["confirm"]);
  });
});
