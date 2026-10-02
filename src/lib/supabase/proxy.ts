import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  HOME_PATH,
  LOGIN_PATH,
  isDashboardPath,
  isGuestOnlyPath,
} from "@/lib/auth/routes";
import { publicEnvSchema } from "@/lib/env-schema";
import type { Database } from "@/types/database";

/** Refreshes the Supabase auth session cookie on every matched request. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const parsed = publicEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Supabase public env vars are missing or invalid");
    }
    // Local dev before .env.local exists: serve pages without auth.
    return response;
  }
  const env = parsed.data;

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not run code between client creation and getClaims(): it validates
  // the JWT and triggers the refresh that writes cookies via setAll.
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims;

  // Optimistic redirects only. Pages still call requireUser().
  const { pathname, search } = request.nextUrl;
  if (!signedIn && isDashboardPath(pathname)) {
    const url = new URL(LOGIN_PATH, request.url);
    url.searchParams.set("next", pathname + search);
    return redirectKeepingCookies(url, response);
  }
  if (signedIn && isGuestOnlyPath(pathname)) {
    return redirectKeepingCookies(new URL(HOME_PATH, request.url), response);
  }

  return response;
}

/** Redirect while carrying over any refreshed auth cookies. */
function redirectKeepingCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
