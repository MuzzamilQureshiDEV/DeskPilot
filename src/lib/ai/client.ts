import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import type { MessagesClient } from "@/lib/ai/agent";
import { fakeMessagesClient } from "@/lib/ai/fake-client";
import { serverEnv } from "@/lib/env";

let client: Anthropic | undefined;

/** True when the dev-only rule-based stand-in replaces Claude (never in production). */
export function fakeAiEnabled(): boolean {
  return serverEnv().DEV_FAKE_AI === "1" && process.env.NODE_ENV !== "production";
}

/** Whether test runs and background replies can run (a real key, or fake mode in dev). */
export function aiConfigured(): boolean {
  return fakeAiEnabled() || !!serverEnv().ANTHROPIC_API_KEY;
}

/** Shared Anthropic client (server only). Retries 429/5xx twice by default. */
export function anthropicClient(): Anthropic {
  if (!client) {
    const apiKey = serverEnv().ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    client = new Anthropic({ apiKey });
  }
  return client;
}

/** The client the agent should use: the dev fake when enabled, otherwise Claude. */
export function agentClient(): MessagesClient {
  return fakeAiEnabled() ? fakeMessagesClient : anthropicClient();
}
