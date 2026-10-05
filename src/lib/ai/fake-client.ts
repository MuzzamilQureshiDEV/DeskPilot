import type Anthropic from "@anthropic-ai/sdk";

import type { MessagesClient } from "@/lib/ai/agent";

// DEV ONLY (DEV_FAKE_AI=1): a rule-based stand-in for Claude, so the whole
// flow (tools, proposals, drafts, inbox) can be tested without API credit.
// It drives the REAL tools and writes replies only from their results.
// Never used in production (see agentClient in client.ts).

export const FAKE_MODEL = "dev-fake-ai";

type ToolResult = { ok: boolean; data: unknown };

function lastCustomerText(messages: Anthropic.MessageParam[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user" && typeof m.content === "string") {
      const matches = [...m.content.matchAll(/<customer_message>\n?([\s\S]*?)\n?<\/customer_message>/g)];
      return matches.at(-1)?.[1]?.trim() ?? "";
    }
  }
  return "";
}

function contextValue(messages: Anthropic.MessageParam[], key: string): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user" && typeof m.content === "string") {
      const v = m.content.match(new RegExp(`${key}: (.+)`))?.[1]?.trim();
      return v && !v.startsWith("unknown") ? v : null;
    }
  }
  return null;
}

/** Latest result per tool name, from the tool_use / tool_result pairs so far. */
function toolResults(messages: Anthropic.MessageParam[]): Record<string, ToolResult> {
  const names = new Map<string, string>();
  const out: Record<string, ToolResult> = {};
  for (const m of messages) {
    if (typeof m.content === "string") continue;
    for (const block of m.content) {
      if (block.type === "tool_use") names.set(block.id, block.name);
      if (block.type === "tool_result") {
        const name = names.get(block.tool_use_id);
        if (!name) continue;
        const text = typeof block.content === "string" ? block.content : "";
        let data: unknown = text;
        try {
          data = JSON.parse(text);
        } catch {
          // error messages are plain text
        }
        out[name] = { ok: !block.is_error, data };
      }
    }
  }
  return out;
}

type Order = { order_id: string; order_number: string; items: { line_item_id: string; refundable_quantity: number }[] };
type Shipment = {
  status: string;
  delayed: boolean;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  estimated_delivery: string | null;
  delivered_at: string | null;
};
type Product = { title: string; price: string; in_stock: boolean; sizes: { size: string; in_stock: boolean }[] };

const field = <T,>(r: ToolResult | undefined, key: string): T | undefined =>
  r?.ok && r.data && typeof r.data === "object" ? ((r.data as Record<string, unknown>)[key] as T) : undefined;

const date = (iso: string | null) => (iso ? new Date(iso).toDateString() : null);

type Decision = { tool: string; input: unknown };

function decide(text: string, results: Record<string, ToolResult>, ctx: { agent: string; firstName: string | null }): Decision {
  const t = text.toLowerCase();
  const orderNumber = text.match(/#?\s?(\d{3,})/)?.[1];
  const wantsCancel = /\bcancel/.test(t);
  const wantsRefund = /\b(refund|return|send (it )?back|money back)\b/.test(t);
  const wantsAddress = /\baddress\b/.test(t);
  const wantsProduct = /(do you (have|sell)|in stock|stock|size|available|price|waterproof|product)/.test(t);

  const lookup = results.lookup_order;
  const orders = field<Order[]>(lookup, "orders");
  const order = orders?.[0];

  if (orderNumber && !lookup) return { tool: "lookup_order", input: { order_number: orderNumber } };
  if (order) {
    if (wantsCancel && !results.propose_cancellation) {
      return { tool: "propose_cancellation", input: { order_id: order.order_id, reason: "Customer asked to cancel" } };
    }
    if (wantsRefund && !wantsCancel && !results.propose_refund) {
      const items = order.items
        .filter((i) => i.refundable_quantity > 0)
        .map((i) => ({ line_item_id: i.line_item_id, quantity: i.refundable_quantity }));
      if (items.length > 0) {
        return { tool: "propose_refund", input: { order_id: order.order_id, line_items: items, reason: "Customer requested a refund" } };
      }
    }
    if (!wantsCancel && !wantsRefund && !wantsAddress && !results.get_tracking) {
      return { tool: "get_tracking", input: { order_id: order.order_id } };
    }
  } else if (!orderNumber && wantsProduct && !results.search_products) {
    return { tool: "search_products", input: { query: text.slice(0, 200) } };
  }

  return { tool: "respond", input: compose(text, results, ctx, { wantsCancel, wantsRefund, wantsAddress, orderNumber }) };
}

function compose(
  _text: string,
  results: Record<string, ToolResult>,
  ctx: { agent: string; firstName: string | null },
  intent: { wantsCancel: boolean; wantsRefund: boolean; wantsAddress: boolean; orderNumber: string | undefined },
) {
  const hi = `Hi${ctx.firstName ? ` ${ctx.firstName}` : ""},`;
  const sign = `\n\n${ctx.agent}`;
  const base = { sentiment: "neutral", tags: ["dev-fake-ai"], escalate: false, escalate_reason: "" };
  const reply = (body: string) => `${hi}\n\n${body}${sign}`;

  const lookup = results.lookup_order;
  if (lookup && !lookup.ok) {
    return { ...base, reply: reply("Could you send me your order number and the email address you used at checkout? Then I can look it up."), confidence: 0.6, category: "order_status", reasoning: "Lookup needed more details." };
  }
  const order = field<Order[]>(lookup, "orders")?.[0];
  if (lookup && !order) {
    return { ...base, reply: reply(`I couldn't find order ${intent.orderNumber ? `#${intent.orderNumber} ` : ""}under your email address. Could you double-check the order number?`), confidence: 0.6, category: "order_status", reasoning: "No matching order for this customer." };
  }

  if (order && intent.wantsCancel) {
    const p = results.propose_cancellation;
    return p?.ok
      ? { ...base, reply: reply(`I've sent your request to cancel order ${order.order_number} to our team for review. You'll hear back shortly.`), confidence: 0.85, category: "cancel", reasoning: "Order unshipped; cancellation proposed." }
      : { ...base, reply: reply(`Order ${order.order_number} has already shipped, so it can't be cancelled. Once it arrives you can return it under our returns policy.`), confidence: 0.8, category: "cancel", reasoning: String(p?.data ?? "Cancellation not possible.") };
  }
  if (order && intent.wantsRefund) {
    const p = results.propose_refund;
    return p?.ok
      ? { ...base, reply: reply(`I've sent a refund request of ${field<string>(p, "amount") ?? "the item amount"} for order ${order.order_number} to our team for review. You'll hear back shortly.`), confidence: 0.85, category: "refund", reasoning: "Refund proposed for refundable items." }
      : { ...base, reply: reply("Thanks for letting me know. A teammate will look into your refund and get back to you."), confidence: 0.4, category: "refund", escalate: true, escalate_reason: String(p?.data ?? "Nothing refundable on this order."), reasoning: "Refund could not be proposed." };
  }
  if (order && intent.wantsAddress) {
    return { ...base, reply: reply("Thanks! A teammate will help you update the shipping address shortly."), confidence: 0.4, category: "address_change", escalate: true, escalate_reason: "Fake AI doesn't parse addresses.", reasoning: "Address change needs a person in dev mode." };
  }
  if (order) {
    const shipments = field<Shipment[]>(results.get_tracking, "shipments") ?? [];
    const s = shipments[0];
    if (!s) {
      return { ...base, reply: reply(`Order ${order.order_number} hasn't shipped yet. You'll get tracking details as soon as it does.`), confidence: 0.85, category: "order_status", reasoning: "No shipments yet." };
    }
    const parts = [
      `Order ${order.order_number} is ${s.status.replaceAll("_", " ")}${s.carrier ? ` with ${s.carrier}` : ""}.`,
      s.delayed ? "I'm sorry it's running later than expected." : "",
      s.tracking_number ? `Tracking number: ${s.tracking_number}${s.tracking_url ? ` (${s.tracking_url})` : ""}.` : "",
      s.delivered_at ? `It was delivered on ${date(s.delivered_at)}.` : s.estimated_delivery ? `Estimated delivery: ${date(s.estimated_delivery)}.` : "",
    ].filter(Boolean);
    return { ...base, reply: reply(parts.join(" ")), confidence: s.delayed ? 0.7 : 0.9, category: "order_status", tags: s.delayed ? ["dev-fake-ai", "delayed"] : base.tags, reasoning: "Answered from get_tracking." };
  }

  const products = field<Product[]>(results.search_products, "products");
  if (products && products.length > 0) {
    const lines = products.slice(0, 3).map((p) => {
      const sizes = p.sizes.filter((s) => s.in_stock).map((s) => s.size);
      return `${p.title} (${p.price}): ${p.in_stock ? `in stock${sizes.length > 1 ? `, sizes ${sizes.join(", ")}` : ""}` : "currently out of stock"}`;
    });
    return { ...base, reply: reply(`Here's what I found:\n${lines.join("\n")}`), confidence: 0.8, category: "product", reasoning: "Answered from search_products." };
  }
  if (products) {
    return { ...base, reply: reply("I couldn't find a matching product. Could you tell me a bit more about what you're looking for?"), confidence: 0.5, category: "product", reasoning: "No products matched." };
  }

  return {
    ...base,
    reply: reply("Thanks for your message! A teammate will get back to you shortly."),
    confidence: 0.3,
    category: "general",
    escalate: true,
    escalate_reason: "The dev fake AI only handles orders, tracking, cancellations, refunds and products.",
    reasoning: "No rule matched.",
  };
}

let seq = 0;

export const fakeMessagesClient: MessagesClient = {
  messages: {
    async create(body) {
      const agent = typeof body.system === "string" ? (body.system.match(/^You are (.+?), the customer support agent/)?.[1] ?? "Ava") : "Ava";
      const fullName = contextValue(body.messages, "sender name");
      const decision = decide(lastCustomerText(body.messages), toolResults(body.messages), {
        agent,
        firstName: fullName?.split(/\s+/)[0] ?? null,
      });
      return {
        id: `msg_fake_${++seq}`,
        type: "message",
        role: "assistant",
        model: FAKE_MODEL,
        content: [{ type: "tool_use", id: `toolu_fake_${seq}`, name: decision.tool, input: decision.input, caller: { type: "direct" } }],
        stop_reason: "tool_use",
        stop_sequence: null,
        stop_details: null,
        container: null,
        diagnostics: null,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation: null,
          inference_geo: null,
          output_tokens_details: null,
          server_tool_use: null,
          service_tier: "standard",
        },
      };
    },
  },
};
