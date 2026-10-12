// Setup checklist on Home (CLAUDE.md §12). Pure: derived from real state, so
// steps tick themselves off as the merchant does them.

export type SetupState = {
  storeConnected: boolean;
  policyCount: number;
  emailConnected: boolean;
  toneChosen: boolean;
  testRuns: number;
  live: boolean;
  /** Has a paid plan (Ava only answers real customers then). */
  subscribed: boolean;
};

export type ChecklistItem = {
  id: "store" | "policies" | "email" | "tone" | "test" | "plan" | "live";
  title: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
  /** Not possible yet (feature arrives in a later update). */
  comingSoon?: boolean;
};

export function buildChecklist(s: SetupState, agent: string): ChecklistItem[] {
  return [
    {
      id: "store",
      title: "Connect your Shopify store",
      description: `So ${agent} can look up real orders, tracking and products.`,
      done: s.storeConnected,
      href: "/store",
      cta: "Connect store",
    },
    {
      id: "test",
      title: `Try ${agent} on the sample store`,
      description: "See how replies come out before customers do.",
      done: s.testRuns > 0,
      href: "/test",
      cta: "Run a test",
    },
    {
      id: "plan",
      title: "Choose a plan",
      description: `Turn ${agent} on for real customers. Founding prices for early stores.`,
      done: s.subscribed,
      href: "/billing",
      cta: "See plans",
    },
    {
      id: "policies",
      title: "Add your policies",
      description: `Returns, shipping and cancellations. ${agent} quotes these exactly.`,
      done: s.policyCount > 0,
      href: "/train?kind=policy",
      cta: "Add policies",
    },
    {
      id: "tone",
      title: `Choose ${agent}'s tone`,
      description: "Make replies sound like your brand.",
      done: s.toneChosen,
      href: "/settings",
      cta: "Choose tone",
    },
    {
      id: "email",
      title: "Connect your support email",
      description: "Forward customer emails so they arrive in your inbox.",
      done: s.emailConnected,
      href: "/settings",
      cta: "Set up email",
    },
    {
      id: "live",
      title: "Go live",
      description: `Send your first reply to a real customer email. ${agent} drafts it, you approve.`,
      done: s.live,
      href: "/inbox",
      cta: "Open inbox",
    },
  ];
}

/** Progress over the steps that can be done today. */
export function checklistProgress(items: ChecklistItem[]): { done: number; total: number } {
  const available = items.filter((i) => i.done || !i.comingSoon);
  return { done: available.filter((i) => i.done).length, total: available.length };
}
