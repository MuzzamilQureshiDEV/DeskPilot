import { describe, expect, it } from "vitest";

import { scrubEvent, scrubText, sentryOptions } from "@/lib/observability/scrub";

describe("error report scrubbing (rule 4)", () => {
  it("removes emails and secrets from text", () => {
    expect(scrubText("Customer pat@example.com failed")).toBe("Customer [email] failed");
    expect(scrubText("key sk_test_51ABCdef and whsec_abc123 and shpat_xyz")).toBe("key [secret] and [secret] and [secret]");
    expect(scrubText("token v1.QUJDREVGR0hJSktMTU5PUFFSU1RVVldY")).toBe("token [secret]");
  });

  it("strips bodies, cookies, auth headers, query values and user details", () => {
    const event = scrubEvent({
      message: "Failed for pat@example.com",
      request: {
        url: "https://app/api/proxy/messages?token=SECRET&shop=demo",
        data: { text: "my address is 1 Main St" },
        cookies: { sb: "session" },
        query_string: "token=SECRET",
        headers: { authorization: "Basic abc", cookie: "sb=1", "user-agent": "Mozilla", "x-shopify-hmac-sha256": "sig" },
      },
      user: { id: "u1", email: "pat@example.com", ip_address: "1.2.3.4" },
      exception: { values: [{ value: "Duplicate key for sam@example.com" }] },
      breadcrumbs: [{ message: "fetch", data: { url: "https://x/y?code=abc", body: "pat@example.com" } }],
      extra: { payload: { email: "pat@example.com" } },
    });
    const json = JSON.stringify(event);
    expect(json).not.toMatch(/example\.com|SECRET|Main St|Basic abc|session|1\.2\.3\.4|sig"/);
    expect(event.request?.headers).toEqual({ "user-agent": "Mozilla" });
    expect(event.request?.url).toBe("https://app/api/proxy/messages?token=[filtered]&shop=[filtered]");
    expect(event.user).toEqual({ id: "u1" });
    expect(event.extra).toBeUndefined();
  });

  it("is off without a DSN and never sends default PII", () => {
    expect(sentryOptions(undefined)).toMatchObject({ enabled: false, sendDefaultPii: false });
    expect(sentryOptions("https://k@o1.ingest.sentry.io/1")).toMatchObject({ enabled: true, sendDefaultPii: false });
  });
});
