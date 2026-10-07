import { describe, expect, it } from "vitest";

import { matches } from "./command-match";

describe("command palette matching", () => {
  it("matches every word, in any order, ignoring case", () => {
    expect(matches("", "Inbox")).toBe(true);
    expect(matches("pol add", "Add a policy Train")).toBe(true);
    expect(matches("DARK", "Switch to dark mode")).toBe(true);
    expect(matches("refund inbox", "Inbox Support")).toBe(false);
  });
});
