// Pure route helpers shared by the proxy, server actions and pages.

export const HOME_PATH = "/home";
export const LOGIN_PATH = "/login";

const DASHBOARD_PREFIXES = [
  "/home",
  "/inbox",
  "/approvals",
  "/escalations",
  "/train",
  "/test",
  "/automation",
  "/store",
  "/settings",
  "/billing",
] as const;

/** Pages that need a signed-in user. */
export function isDashboardPath(pathname: string): boolean {
  return DASHBOARD_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/** Pages a signed-in user should skip. */
export function isGuestOnlyPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/signup";
}

/**
 * Returns `next` only if it is a same-origin relative path, otherwise the
 * fallback. Blocks open redirects like `//evil.com` or `/\evil.com`.
 */
export function safeNextPath(next: unknown, fallback: string = HOME_PATH): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  // Reject control characters, which browsers may strip to form `//`.
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
