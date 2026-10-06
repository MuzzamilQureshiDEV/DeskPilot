// Error reports must never carry customer data (CLAUDE.md rule 4): no request
// bodies, cookies, auth headers, emails or tokens. Pure, runs in Sentry's
// beforeSend / beforeBreadcrumb on server, edge and browser.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SECRETS = /\b(sk_(?:test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|shp(?:at|ss|ca)_[A-Za-z0-9]+|sk-ant-[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|v1\.[A-Za-z0-9+/=_-]{20,})\b/g;
const SAFE_HEADERS = new Set(["user-agent", "content-type", "accept", "x-vercel-id"]);

export function scrubText(text: string): string {
  return text.replace(EMAIL, "[email]").replace(SECRETS, "[secret]");
}

/** Strip query values that may carry tokens (chat tokens, OAuth codes, signatures). */
function scrubUrl(url: string): string {
  const q = url.indexOf("?");
  if (q < 0) return url;
  const params = new URLSearchParams(url.slice(q + 1));
  return `${url.slice(0, q)}?${[...params.keys()].map((k) => `${k}=[filtered]`).join("&")}`;
}

type AnyEvent = {
  message?: string;
  request?: { data?: unknown; cookies?: unknown; headers?: Record<string, string>; query_string?: unknown; url?: string };
  user?: Record<string, unknown>;
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
  extra?: Record<string, unknown>;
};

export function scrubEvent<T extends AnyEvent>(event: T): T {
  if (event.message) event.message = scrubText(event.message);
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
    if (event.request.headers) {
      event.request.headers = Object.fromEntries(
        Object.entries(event.request.headers).filter(([k]) => SAFE_HEADERS.has(k.toLowerCase())),
      );
    }
  }
  // Keep only an opaque id, never email/ip/username.
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {};
  for (const v of event.exception?.values ?? []) if (v.value) v.value = scrubText(v.value);
  for (const b of event.breadcrumbs ?? []) {
    if (b.message) b.message = scrubText(b.message);
    if (b.data) {
      for (const key of Object.keys(b.data)) {
        const val = b.data[key];
        if (key === "url" && typeof val === "string") b.data[key] = scrubUrl(val);
        else if (typeof val === "string") b.data[key] = scrubText(val);
      }
    }
  }
  if (event.extra) delete event.extra;
  return event;
}

/** Shared Sentry options (no default PII, light tracing). */
export function sentryOptions(dsn: string | undefined) {
  return {
    dsn,
    enabled: !!dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0.05,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    beforeSend: scrubEvent,
    beforeBreadcrumb: <B extends { message?: string; data?: Record<string, unknown> }>(b: B) => scrubEvent({ breadcrumbs: [b] }).breadcrumbs?.[0] as B,
  };
}
