import { describe, expect, it } from "vitest";

import { teamAlertEmail } from "@/lib/notifications/team-alert";

const base = {
  appUrl: "https://www.astadesk.com/",
  storeName: "testStore",
  conversationId: "c-1",
  customerName: "Ayumu Hirano",
  channel: "chat" as const,
  subject: "can you check my order #1001",
  reason: "Order lookup system is unreachable.",
  lastMessage: "can you check my order #1001",
};

describe("team alert email", () => {
  it("escalation: who, why, and a link straight to the conversation", () => {
    const e = teamAlertEmail({ ...base, kind: "escalated" });
    expect(e.subject).toBe("Ava needs you: Ayumu Hirano · can you check my order #1001");
    expect(e.text).toContain("Why: Order lookup system is unreachable.");
    expect(e.text).toContain("Open conversation: https://www.astadesk.com/inbox/c-1");
    expect(e.html).toContain('href="https://www.astadesk.com/inbox/c-1"');
    expect(e.text).toContain("by store chat");
  });

  it("approval: lists the actions and links to Approvals", () => {
    const e = teamAlertEmail({ ...base, kind: "approval", actions: ["Cancel order · order #1048", "Refund 24.00 USD · order #1052"] });
    expect(e.subject).toBe("Approval needed: Cancel order · order #1048 (+1 more)");
    expect(e.text).toContain("• Refund 24.00 USD · order #1052");
    expect(e.text).toContain("Review in AstaDesk: https://www.astadesk.com/approvals");
    expect(e.text).not.toContain("Why:");
  });

  it("trims long messages and escapes HTML", () => {
    const e = teamAlertEmail({ ...base, kind: "escalated", lastMessage: `<script>x</script>${"a".repeat(600)}`, customerName: null });
    expect(e.subject.startsWith("Ava needs you: A customer")).toBe(true);
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
    const quoted = e.text.split("Their last message: ")[1]!.split("\n")[0]!;
    expect(quoted.length).toBeLessThanOrEqual(302);
  });

  it("never puts the customer's email address in the subject", () => {
    const e = teamAlertEmail({ ...base, kind: "escalated", customerName: null, subject: null });
    expect(e.subject).toBe("Ava needs you: A customer");
  });
});
