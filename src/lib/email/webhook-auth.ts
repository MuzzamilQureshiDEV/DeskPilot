import { timingSafeEqual } from "node:crypto";

/** Basic-auth password check (constant time). Postmark sends it from the webhook URL's credentials. */
export function authorized(authHeader: string | null, expected: string | undefined): boolean {
  if (!expected || !authHeader?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon < 0) return false;
  const a = Buffer.from(decoded.slice(colon + 1));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
