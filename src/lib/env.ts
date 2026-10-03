import "server-only";

import { appUrlFromEnv, serverEnvSchema, type ServerEnv } from "@/lib/env-schema";

let cached: ServerEnv | undefined;

/** Validated server env. Parsed lazily so `next build` works without runtime secrets. */
export function serverEnv(): ServerEnv {
  cached ??= serverEnvSchema.parse({ ...process.env, NEXT_PUBLIC_APP_URL: appUrlFromEnv(process.env) });
  return cached;
}
