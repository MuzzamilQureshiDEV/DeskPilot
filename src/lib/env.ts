import "server-only";

import { serverEnvSchema, type ServerEnv } from "@/lib/env-schema";

let cached: ServerEnv | undefined;

/** Validated server env. Parsed lazily so `next build` works without runtime secrets. */
export function serverEnv(): ServerEnv {
  cached ??= serverEnvSchema.parse(process.env);
  return cached;
}
