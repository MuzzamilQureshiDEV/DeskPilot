// Turns one agent run on the sample store into plain-language steps ("What Ava
// did") and the sample data it actually used. Pure: easy to test.

import type { ToolCallLog } from "@/lib/ai/agent";
import type { Category } from "@/lib/ai/schemas";
import type { SandboxKnowledge, SandboxStore } from "@/lib/sandbox/data";
import type { OrderDetail, ProductSummary } from "@/lib/store/types";

export type StepStatus = "done" | "attention" | "failed";
export type ExplainStep = { label: string; detail: string; status: StepStatus };
export type DataUsed = {
  orders: { number: string; customer: string; total: string; status: string; items: string[] }[];
  products: { title: string; price: string; stock: string }[];
  policies: { title: string; content: string }[];
};

const INTENT: Record<Category, string> = {
  order_status: "Customer wants to know where their order is",
  product: "Customer has a question about a product",
  shipping: "Customer is asking about shipping",
  policy: "Customer is asking about a store policy",
  general: "General question for the store",
  refund: "Customer wants a refund",
  cancel: "Customer wants to cancel an order",
  address_change: "Customer wants to change a shipping address",
};

const fmt = (m: { amount: string; currency: string }) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: m.currency }).format(Number(m.amount));

const words = (s: string) => s.replace(/_/g, " ");

function orderStatus(o: OrderDetail): string {
  if (o.cancelledAt) return "cancelled";
  return `${words(o.financialStatus)}, ${words(o.fulfillmentStatus)}`;
}

function findOrder(store: SandboxStore, input: unknown): OrderDetail | undefined {
  const raw = (input as { order_number?: string; order_id?: string } | undefined) ?? {};
  const wanted = (raw.order_number ?? "").replace(/^#/, "");
  return store.orders.find((o) => (wanted && o.name.replace(/^#/, "") === wanted) || (raw.order_id && o.id === raw.order_id));
}

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "for", "is", "my", "do", "you", "what", "how", "can", "i"]);
const toks = (t: string) => (t.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !STOP.has(w)).map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));

/** Same ranking idea as the get_policy tool: which entries matched the topic. */
function matchPolicies(knowledge: SandboxKnowledge[], topic: string): SandboxKnowledge[] {
  const wanted = new Set(toks(topic));
  return knowledge
    .filter((k) => k.kind === "policy" || k.kind === "faq")
    .map((k) => ({ k, score: toks(k.title).filter((t) => wanted.has(t)).length * 3 + new Set(toks(k.content).filter((t) => wanted.has(t))).size }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((r) => r.k);
}

function productLine(p: ProductSummary) {
  const inStock = p.variants.filter((v) => v.inventory === null || (v.inventory ?? 0) > 0).map((v) => v.title);
  const price = p.priceRange.min.amount === p.priceRange.max.amount ? fmt(p.priceRange.min) : `${fmt(p.priceRange.min)}–${fmt(p.priceRange.max)}`;
  return { title: p.title, price, stock: inStock.length ? `In stock: ${inStock.slice(0, 4).join(", ")}` : "Out of stock" };
}

export function explainRun(input: {
  category: Category;
  toolCalls: ToolCallLog[];
  proposals: { title: string; orderNumber: string; details: string[] }[];
  escalate: boolean;
  escalateReason: string | null;
  outcomeText: string;
  fallback: boolean;
  store: SandboxStore;
  knowledge: SandboxKnowledge[];
}): { steps: ExplainStep[]; data: DataUsed } {
  const steps: ExplainStep[] = [{ label: "Understood request", detail: `${INTENT[input.category]}.`, status: "done" }];
  const data: DataUsed = { orders: [], products: [], policies: [] };
  const seen = new Set<string>();

  for (const call of input.toolCalls) {
    if (call.name === "respond") continue;
    const failed = !call.ok;
    switch (call.name) {
      case "lookup_order": {
        const o = call.ok ? findOrder(input.store, call.input) : undefined;
        if (o && !seen.has(o.id)) {
          seen.add(o.id);
          data.orders.push({
            number: o.name,
            customer: o.customerName,
            total: fmt(o.total),
            status: orderStatus(o),
            items: o.lineItems.map((li) => `${li.quantity}× ${li.title}${li.variantTitle ? ` (${li.variantTitle})` : ""}`),
          });
        }
        steps.push(
          o
            ? { label: "Found order & customer", detail: `Order ${o.name} · ${o.customerName} · ${fmt(o.total)} · ${orderStatus(o)}`, status: "done" }
            : { label: "Looked up the order", detail: failed ? (call.error ?? "Not found for this customer.") : "No matching order for this customer.", status: failed ? "failed" : "attention" },
        );
        break;
      }
      case "get_tracking": {
        const o = findOrder(input.store, call.input);
        const f = o?.fulfillments[0];
        steps.push({
          label: "Checked tracking",
          detail: f ? `${f.carrier ?? "Carrier"} · ${words(f.status)}${f.estimatedDeliveryAt ? ` · due ${new Date(f.estimatedDeliveryAt).toLocaleDateString("en", { month: "short", day: "numeric" })}` : ""}` : failed ? (call.error ?? "No tracking yet.") : "No shipments yet.",
          status: failed ? "failed" : "done",
        });
        break;
      }
      case "search_products": {
        const q = String((call.input as { query?: string } | undefined)?.query ?? "");
        const hits = input.store.products.filter((p) => toks(q).some((t) => toks(`${p.title} ${p.productType} ${p.tags.join(" ")}`).includes(t))).slice(0, 3);
        for (const p of hits) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          data.products.push(productLine(p));
        }
        steps.push({ label: "Searched products", detail: hits.length ? `Found ${hits.map((p) => p.title).join(", ")}` : `Nothing matched “${q}”.`, status: failed ? "failed" : "done" });
        break;
      }
      case "get_policy": {
        const topic = String((call.input as { topic?: string } | undefined)?.topic ?? "");
        const matched = matchPolicies(input.knowledge, topic);
        for (const k of matched) {
          if (seen.has(k.title)) continue;
          seen.add(k.title);
          data.policies.push({ title: k.title, content: k.content });
        }
        steps.push({
          label: "Checked policy",
          detail: matched.length ? matched.map((k) => k.title).join(" · ") : `No policy found for “${topic}”.`,
          status: matched.length ? "done" : "attention",
        });
        break;
      }
      default:
        if (call.name.startsWith("propose_")) {
          if (failed) steps.push({ label: "Checked eligibility", detail: call.error ?? "Not eligible.", status: "attention" });
        } else {
          steps.push({ label: words(call.name), detail: failed ? (call.error ?? "Failed.") : "Done.", status: failed ? "failed" : "done" });
        }
    }
  }

  for (const p of input.proposals) {
    steps.push({ label: "Determined eligibility", detail: `Eligible for: ${p.title.toLowerCase()} on order ${p.orderNumber}.`, status: "done" });
    steps.push({ label: "Action requires approval", detail: [p.title, ...p.details].join(" · "), status: "attention" });
  }
  if (input.escalate) steps.push({ label: "Escalated to your team", detail: input.escalateReason ?? "It needs a person.", status: "attention" });
  if (input.fallback) steps.push({ label: "Used a safe holding reply", detail: "The agent couldn't finish, so nothing was guessed.", status: "attention" });
  steps.push({ label: "Drafted response", detail: input.outcomeText, status: "done" });

  return { steps, data };
}
