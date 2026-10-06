import * as Sentry from "@sentry/nextjs";

/** Report a background job's final failure with ids only (no customer data, rule 4). */
export function reportJobFailure(job: string, error: Error, ids: Record<string, string>) {
  Sentry.withScope((scope) => {
    scope.setTag("job", job);
    for (const [k, v] of Object.entries(ids)) scope.setTag(k, v);
    Sentry.captureException(error);
  });
}
