import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { serverEnv } from "@/lib/env";

let client: Anthropic | undefined;

/** Shared Anthropic client (server only). Retries 429/5xx twice by default. */
export function anthropicClient(): Anthropic {
  if (!client) {
    const apiKey = serverEnv().ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    client = new Anthropic({ apiKey });
  }
  return client;
}
