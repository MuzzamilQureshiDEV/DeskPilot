import { describe, expect, it, vi } from "vitest";

import { ShopifyApiError, shopifyGraphql } from "@/lib/shopify/client";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function run(responses: Response[]) {
  const fetchFn = vi.fn<typeof fetch>(async () => {
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    return next;
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const call = shopifyGraphql<{ ok: boolean }>({ domain: "s.myshopify.com", accessToken: "tok", query: "{ shop { name } }", fetchFn, sleep });
  return { call, fetchFn, sleep };
}

describe("shopifyGraphql", () => {
  it("sends the token to the pinned API version", async () => {
    const { call, fetchFn } = run([json({ data: { ok: true } })]);
    expect(await call).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe("https://s.myshopify.com/admin/api/2026-10/graphql.json");
    expect(new Headers(init?.headers).get("X-Shopify-Access-Token")).toBe("tok");
  });

  it("waits and retries when throttled, using Shopify's cost info", async () => {
    const throttled = {
      errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
      extensions: { cost: { requestedQueryCost: 500, throttleStatus: { currentlyAvailable: 100, restoreRate: 100 } } },
    };
    const { call, sleep } = run([json(throttled), json({ data: { ok: true } })]);
    expect(await call).toEqual({ ok: true });
    expect(sleep).toHaveBeenCalledWith(4000); // (500 - 100) / 100 per second
  });

  it("retries 429 and 5xx, honouring Retry-After", async () => {
    const { call, sleep } = run([json({}, 429, { "retry-after": "2" }), json({}, 503), json({ data: { ok: true } })]);
    expect(await call).toEqual({ ok: true });
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 2000]);
  });

  it("gives up after repeated throttling", async () => {
    const throttled = json({ errors: [{ message: "t", extensions: { code: "THROTTLED" } }] });
    const { call } = run([throttled.clone(), throttled.clone(), throttled.clone(), throttled.clone()]);
    await expect(call).rejects.toMatchObject({ kind: "throttled" });
  });

  it("reports a rejected token as an auth error", async () => {
    const { call } = run([json({ errors: "Invalid API key or access token" }, 401)]);
    await expect(call).rejects.toBeInstanceOf(ShopifyApiError);
    await expect(run([json({}, 401)]).call).rejects.toMatchObject({ kind: "auth" });
  });

  it("returns partial data but fails when there is none", async () => {
    const partial = { data: { ok: true }, errors: [{ message: "denied", extensions: { code: "ACCESS_DENIED" } }] };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await run([json(partial)]).call).toEqual({ ok: true });
    expect(warn).toHaveBeenCalledWith(expect.any(String), "ACCESS_DENIED");
    await expect(run([json({ errors: [{ message: "bad", extensions: { code: "BAD" } }] })]).call).rejects.toMatchObject({
      kind: "graphql",
    });
    warn.mockRestore();
  });
});
