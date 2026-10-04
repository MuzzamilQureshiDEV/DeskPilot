import { adminGraphqlUrl } from "@/lib/shopify/config";

// Minimal Admin GraphQL client with Shopify's cost-based throttling handled.

export type ShopifyErrorKind = "auth" | "throttled" | "http" | "graphql";

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    readonly kind: ShopifyErrorKind,
  ) {
    super(message);
    this.name = "ShopifyApiError";
  }
}

type GraphqlError = { message: string; extensions?: { code?: string } };
type CostExtension = {
  requestedQueryCost?: number;
  throttleStatus?: { currentlyAvailable?: number; restoreRate?: number };
};
type GraphqlResponse<T> = { data?: T | null; errors?: GraphqlError[]; extensions?: { cost?: CostExtension } };

export type GraphqlOptions = {
  domain: string;
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Seconds to wait before the bucket has enough points again (from Shopify's cost info). */
function throttleDelayMs(cost: CostExtension | undefined, attempt: number): number {
  const needed = cost?.requestedQueryCost ?? 0;
  const available = cost?.throttleStatus?.currentlyAvailable ?? 0;
  const rate = cost?.throttleStatus?.restoreRate ?? 0;
  const byCost = rate > 0 ? Math.ceil(((needed - available) / rate) * 1000) : 0;
  return Math.min(Math.max(byCost, 1000 * 2 ** attempt), 30_000);
}

export async function shopifyGraphql<T>(opts: GraphqlOptions): Promise<T> {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const maxAttempts = opts.maxAttempts ?? 4;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetchFn(adminGraphqlUrl(opts.domain), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "X-Shopify-Access-Token": opts.accessToken,
      },
      body: JSON.stringify({ query: opts.query, variables: opts.variables ?? {} }),
    });

    if (res.status === 401 || res.status === 403) {
      throw new ShopifyApiError(`Shopify rejected the access token (${res.status})`, "auth");
    }
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new ShopifyApiError(`Shopify request failed (${res.status})`, "http");

    const body = (await res.json()) as GraphqlResponse<T>;
    const errors = body.errors ?? [];

    if (errors.some((e) => e.extensions?.code === "THROTTLED")) {
      await sleep(throttleDelayMs(body.extensions?.cost, attempt));
      continue;
    }
    if (body.data == null) {
      const codes = errors.map((e) => e.extensions?.code ?? "ERROR").join(", ");
      throw new ShopifyApiError(`Shopify GraphQL error: ${codes || "no data"}`, "graphql");
    }
    if (errors.length > 0) {
      // Partial data, e.g. protected customer fields the app isn't approved for. Log codes only.
      console.warn("Shopify GraphQL partial errors:", errors.map((e) => e.extensions?.code ?? "ERROR").join(", "));
    }
    return body.data;
  }

  throw new ShopifyApiError("Shopify kept throttling the request", "throttled");
}
