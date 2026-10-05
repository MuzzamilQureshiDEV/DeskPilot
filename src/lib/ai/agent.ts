import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { MODELS } from "@/lib/ai/models";
import {
  buildMessages,
  buildSystemPrompt,
  type Channel,
  type HistoryMessage,
  type PromptShop,
} from "@/lib/ai/prompts";
import { respondSchema, type RespondOutput } from "@/lib/ai/schemas";
import { AGENT_TOOLS, TOOL_DEFINITIONS } from "@/lib/ai/tools";
import {
  type KnowledgeEntry,
  type ProposedAction,
  type ToolContext,
  ToolError,
} from "@/lib/ai/tools/types";
import type { StoreProvider } from "@/lib/store/types";

/** CLAUDE.md §7: at most 6 tool rounds per run. */
export const MAX_TOOL_ROUNDS = 6;
const MAX_TOKENS = 16_000;

/** The slice of the Anthropic client the agent uses, so tests can pass a fake. */
export type MessagesClient = {
  messages: {
    create(body: Anthropic.MessageCreateParamsNonStreaming): PromiseLike<Anthropic.Message>;
  };
};

export type AgentInput = {
  client: MessagesClient;
  shop: PromptShop;
  knowledge: KnowledgeEntry[];
  provider: StoreProvider;
  history: HistoryMessage[];
  channel: Channel;
  /** Verified sender address (email channel or sandbox scenario); null on chat. */
  customerEmail: string | null;
  customerName: string | null;
  now?: Date;
};

export type AgentUsage = {
  apiCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type ToolCallLog = { name: string; ok: boolean; error?: string };

export type FallbackReason = "max_rounds" | "refusal" | "max_tokens" | "context_exceeded";

export type AgentResult = {
  response: RespondOutput;
  proposals: ProposedAction[];
  toolCalls: ToolCallLog[];
  usage: AgentUsage;
  model: string;
  /** Set when the agent didn't finish normally and we built a safe escalation instead. */
  fallback: FallbackReason | null;
};

const FALLBACK_REASONS: Record<FallbackReason, string> = {
  max_rounds: `The agent didn't finish within ${MAX_TOOL_ROUNDS} tool rounds.`,
  refusal: "The model declined to answer this message.",
  max_tokens: "The model's response was cut off.",
  context_exceeded: "The conversation is too long for the model.",
};

function fallbackResponse(
  reason: FallbackReason,
  agentName: string,
  customerName: string | null,
): RespondOutput {
  const firstName = customerName?.trim().split(/\s+/)[0];
  const why = FALLBACK_REASONS[reason];
  return {
    reply: `Hi${firstName ? ` ${firstName}` : ""},\n\nThanks for your message. A member of our team will get back to you shortly.\n\n${agentName}`,
    confidence: 0,
    category: "general",
    sentiment: "neutral",
    tags: [],
    escalate: true,
    escalate_reason: why,
    reasoning: why,
  };
}

function toolResult(id: string, content: string, isError = false): Anthropic.ToolResultBlockParam {
  return { type: "tool_result", tool_use_id: id, content, ...(isError ? { is_error: true } : {}) };
}

/**
 * Runs the support agent on one conversation and returns its proposed reply.
 * It never sends anything or executes money actions. Callers decide what to
 * do with the result (see decideOutcome).
 */
export async function runAgent(input: AgentInput): Promise<AgentResult> {
  const model = MODELS.agent;
  const system = buildSystemPrompt(input.shop, input.knowledge);
  const messages = buildMessages(input.history, {
    channel: input.channel,
    customerEmail: input.customerEmail,
    customerName: input.customerName,
    now: input.now ?? new Date(),
  });

  const ctx: ToolContext = {
    provider: input.provider,
    knowledge: input.knowledge,
    customerEmail: input.customerEmail,
    verifiedOrderIds: new Set(),
    proposals: [],
  };
  const usage: AgentUsage = { apiCalls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const toolCalls: ToolCallLog[] = [];
  // The model that actually answered (recorded in usage); starts as the requested one.
  let servedModel: string = model;

  const finish = (response: RespondOutput, fallback: FallbackReason | null): AgentResult => ({
    response,
    proposals: ctx.proposals,
    toolCalls,
    usage,
    model: servedModel,
    fallback,
  });
  const fail = (reason: FallbackReason) =>
    finish(fallbackResponse(reason, input.shop.agentName, input.customerName), reason);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await input.client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system,
      tools: TOOL_DEFINITIONS,
      tool_choice: { type: "auto" },
      // Caches tools + system + history; each round reuses the previous prefix.
      cache_control: { type: "ephemeral" },
      messages,
    });

    servedModel = res.model;
    usage.apiCalls += 1;
    usage.inputTokens += res.usage.input_tokens;
    usage.outputTokens += res.usage.output_tokens;
    usage.cacheReadTokens += res.usage.cache_read_input_tokens ?? 0;
    usage.cacheWriteTokens += res.usage.cache_creation_input_tokens ?? 0;

    // Never run tools from a refused or truncated turn.
    if (res.stop_reason === "refusal") return fail("refusal");
    if (res.stop_reason === "max_tokens") return fail("max_tokens");
    if (res.stop_reason === "model_context_window_exceeded") return fail("context_exceeded");

    // Keep the full content (including thinking blocks) for the next round.
    messages.push({ role: "assistant", content: res.content });

    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      // Answered in plain text instead of calling respond: ask for the tool.
      messages.push({
        role: "user",
        content: "Please finish by calling the respond tool with your reply to the customer.",
      });
      continue;
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    let final: RespondOutput | null = null;

    for (const call of toolUses) {
      if (call.name === "respond") {
        const parsed = respondSchema.safeParse(call.input);
        if (parsed.success) {
          final = parsed.data;
          toolCalls.push({ name: call.name, ok: true });
          results.push(toolResult(call.id, "Received."));
        } else {
          const error = z.prettifyError(parsed.error);
          toolCalls.push({ name: call.name, ok: false, error });
          results.push(toolResult(call.id, `Invalid respond input. Fix and call respond again:\n${error}`, true));
        }
        continue;
      }

      const tool = AGENT_TOOLS[call.name];
      if (!tool) {
        toolCalls.push({ name: call.name, ok: false, error: "unknown tool" });
        results.push(toolResult(call.id, `Unknown tool "${call.name}".`, true));
        continue;
      }

      const parsed = tool.schema.safeParse(call.input);
      if (!parsed.success) {
        const error = z.prettifyError(parsed.error);
        toolCalls.push({ name: call.name, ok: false, error });
        results.push(toolResult(call.id, `Invalid input:\n${error}`, true));
        continue;
      }

      try {
        const output = await tool.run(parsed.data, ctx);
        toolCalls.push({ name: call.name, ok: true });
        results.push(toolResult(call.id, JSON.stringify(output)));
      } catch (err) {
        if (err instanceof ToolError) {
          toolCalls.push({ name: call.name, ok: false, error: err.message });
          results.push(toolResult(call.id, err.message, true));
        } else {
          // Unexpected (e.g. store API down). Log the tool name only, no customer data.
          console.error(`agent tool "${call.name}" failed`, err instanceof Error ? err.name : "unknown");
          toolCalls.push({ name: call.name, ok: false, error: "internal error" });
          results.push(
            toolResult(call.id, "The store system couldn't be reached. Don't guess. Escalate with a holding reply.", true),
          );
        }
      }
    }

    if (final) return finish(final, null);
    messages.push({ role: "user", content: results });
  }

  return fail("max_rounds");
}
