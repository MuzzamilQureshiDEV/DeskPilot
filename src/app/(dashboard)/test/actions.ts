"use server";

import Anthropic from "@anthropic-ai/sdk";

import { runAgent } from "@/lib/ai/agent";
import { anthropicClient } from "@/lib/ai/client";
import { decideOutcome, type AutomationSetting } from "@/lib/ai/outcome";
import type { ProposedAction } from "@/lib/ai/tools/types";
import { getCurrentShop } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { SANDBOX_KNOWLEDGE, SANDBOX_STORE_NAME } from "@/lib/sandbox/data";
import { SandboxProvider } from "@/lib/sandbox/provider";
import { SCENARIOS, sandboxCustomer } from "@/lib/sandbox/scenarios";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

import {
  sandboxRunSchema,
  type LiveOutcome,
  type SandboxProposal,
  type SandboxRunResponse,
} from "./schema";

const AUTOPILOT_PLANS = new Set(["growth", "scale"]);
const DEFAULT_SETTING: AutomationSetting = { mode: "copilot", confidenceThreshold: 0.85 };

function str(v: Json | undefined): string {
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
}

function addressLine(v: Json | undefined): string {
  if (!v || typeof v !== "object" || Array.isArray(v)) return "";
  return [v.address1, v.address2, v.city, v.province, v.zip, v.country].map(str).filter(Boolean).join(", ");
}

/** Turns a proposal payload into what the approval card shows. */
function summarize(p: ProposedAction): SandboxProposal {
  const orderNumber = str(p.payload.order_number);
  if (p.type === "refund") {
    const items = Array.isArray(p.payload.line_items) ? p.payload.line_items : [];
    return {
      type: "refund",
      orderNumber,
      title: `Refund ${str(p.payload.amount)} ${str(p.payload.currency)}`,
      details: [
        ...items.map((li) =>
          li && typeof li === "object" && !Array.isArray(li)
            ? `${str(li.quantity)} × ${str(li.title)}${li.size ? ` (${str(li.size)})` : ""}`
            : "",
        ).filter(Boolean),
        `Reason: ${str(p.payload.reason)}`,
      ],
    };
  }
  if (p.type === "cancel") {
    return {
      type: "cancel",
      orderNumber,
      title: "Cancel order",
      details: [`Refund ${str(p.payload.refund_amount)} ${str(p.payload.currency)} on cancel`, `Reason: ${str(p.payload.reason)}`],
    };
  }
  return {
    type: "address_change",
    orderNumber,
    title: "Change shipping address",
    details: [
      `From: ${addressLine(p.payload.current_address)}`,
      `To: ${addressLine(p.payload.new_address)}`,
      `Reason: ${str(p.payload.reason)}`,
    ],
  };
}

function aiErrorMessage(err: InstanceType<typeof Anthropic.APIError>): string {
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.";
  if (err instanceof Anthropic.RateLimitError) return "The AI service is busy right now. Try again in a minute.";
  if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.PermissionDeniedError) {
    return "The AI service refused the request. Check the API key's workspace and credit balance in the Anthropic Console.";
  }
  return "The AI service is unavailable right now. Try again shortly.";
}

/** Runs the agent once on the sample store. Never touches real orders or Shopify. */
export async function runSandboxTest(raw: unknown): Promise<SandboxRunResponse> {
  const parsed = sandboxRunSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid request" };
  }
  const input = parsed.data;

  const shop = await getCurrentShop();
  if (!shop) return { ok: false, code: "no_shop", message: "Your account isn't linked to a store." };
  if (!serverEnv().ANTHROPIC_API_KEY) {
    return { ok: false, code: "not_configured", message: "The AI isn't connected yet. Add ANTHROPIC_API_KEY to enable test runs." };
  }

  const supabase = await createClient();
  const freeText = input.kind === "free_text";
  const claim = await supabase.rpc("claim_sandbox_run", { p_shop_id: shop.id, p_free_text: freeText }).single();
  if (claim.error || !claim.data) {
    if (claim.error?.message.includes("sandbox_limit")) {
      return { ok: false, code: "limit", message: "You've used today's 3 free-text test runs. The preset scenarios are still available." };
    }
    throw new Error("Could not start a test run");
  }
  const { event_id: eventId, remaining } = claim.data;

  const customerEmail = input.kind === "scenario" ? SCENARIOS[input.scenario].customerEmail : input.customerEmail;
  const customer = sandboxCustomer(customerEmail);
  const history =
    input.kind === "scenario"
      ? [{ role: "customer" as const, body: SCENARIOS[input.scenario].message }]
      : [...input.history, { role: "customer" as const, body: input.message }];

  let result;
  try {
    result = await runAgent({
      client: anthropicClient(),
      shop: { agentName: shop.agentName, agentTone: shop.agentTone, shopName: SANDBOX_STORE_NAME },
      knowledge: SANDBOX_KNOWLEDGE,
      provider: new SandboxProvider(),
      history,
      channel: "sandbox",
      customerEmail,
      customerName: customer?.name ?? null,
    });
  } catch (err) {
    // A failed run shouldn't use up the daily allowance.
    await supabase.rpc("release_sandbox_run", { p_event_id: eventId });
    if (err instanceof Anthropic.APIError) {
      console.error("sandbox run: Anthropic API error", err.status, err.name);
      return { ok: false, code: "ai_unavailable", message: aiErrorMessage(err) };
    }
    throw err;
  }

  await supabase.rpc("finish_sandbox_run", {
    p_event_id: eventId,
    p_model: result.model,
    p_input_tokens: result.usage.inputTokens + result.usage.cacheReadTokens + result.usage.cacheWriteTokens,
    p_output_tokens: result.usage.outputTokens,
  });

  const { data: settingRow } = await supabase
    .from("automation_settings")
    .select("mode, confidence_threshold")
    .eq("shop_id", shop.id)
    .eq("category", result.response.category)
    .maybeSingle();
  const setting: AutomationSetting = settingRow
    ? { mode: settingRow.mode, confidenceThreshold: Number(settingRow.confidence_threshold) }
    : DEFAULT_SETTING;
  const decided = decideOutcome(result, setting, { autopilotAllowedByPlan: AUTOPILOT_PLANS.has(shop.plan) });
  const outcome: LiveOutcome =
    decided.messageStatus === "sent"
      ? "sent"
      : decided.conversationStatus === "escalated"
        ? "escalated"
        : decided.conversationStatus === "awaiting_approval"
          ? "awaiting_approval"
          : decided.conversationStatus === "human"
            ? "human"
            : "draft";

  const r = result.response;
  return {
    ok: true,
    result: {
      reply: r.reply,
      confidence: r.confidence,
      category: r.category,
      sentiment: r.sentiment,
      tags: r.tags,
      escalate: r.escalate,
      escalateReason: r.escalate_reason,
      reasoning: r.reasoning,
      tools: result.toolCalls.map(({ name, ok }) => ({ name, ok })),
      proposals: result.proposals.map(summarize),
      outcome,
      fallback: result.fallback !== null,
      freeTextRemaining: remaining,
    },
  };
}
