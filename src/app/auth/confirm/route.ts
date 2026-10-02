import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { safeNextPath } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

const otpType = z.enum([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]) satisfies z.ZodType<EmailOtpType>;

/**
 * Landing route for links in Supabase auth emails (confirm signup, reset
 * password). Supports the PKCE `code` flow and the `token_hash` flow.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"));
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = otpType.safeParse(params.get("type"));

  const supabase = await createClient();
  let ok = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type.success) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type.data,
    });
    ok = !error;
  }

  redirect(ok ? next : "/login?error=link");
}
