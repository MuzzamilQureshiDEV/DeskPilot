import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/lib/observability/scrub";

// Server + edge error reporting. Off unless SENTRY_DSN is set.
export function register() {
  Sentry.init(sentryOptions(process.env.SENTRY_DSN));
}

export const onRequestError = Sentry.captureRequestError;
