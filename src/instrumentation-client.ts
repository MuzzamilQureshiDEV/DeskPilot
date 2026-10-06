import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/lib/observability/scrub";

// Browser error reporting. Off unless NEXT_PUBLIC_SENTRY_DSN is set.
Sentry.init(sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
