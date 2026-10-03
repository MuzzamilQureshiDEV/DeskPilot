"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { HOME_PATH, LOGIN_PATH, safeNextPath } from "@/lib/auth/routes";
import {
  loginSchema,
  resetRequestSchema,
  signupSchema,
  updatePasswordSchema,
  type FormState,
} from "@/lib/auth/schemas";
import { publicEnv } from "@/lib/env-public";
import { createClient } from "@/lib/supabase/server";

const WELCOME_PATH = "/store?welcome=1";

function invalid(error: z.ZodError, values?: FormState["values"]): FormState {
  return { fieldErrors: z.flattenError(error).fieldErrors, values };
}

/** Echo back non-secret fields (never passwords). */
function keep(formData: FormData, ...names: string[]): FormState["values"] {
  return Object.fromEntries(
    names.map((n) => [n, String(formData.get(n) ?? "")]),
  );
}

function confirmUrl(next: string): string {
  const url = new URL("/auth/confirm", publicEnv().NEXT_PUBLIC_APP_URL);
  url.searchParams.set("next", next);
  return url.toString();
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = keep(formData, "shopName", "email");
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, values);
  const { shopName, email, password } = parsed.data;
  // New accounts go to the guided "connect your store" step unless a flow (e.g. a
  // Shopify install link) asked to continue somewhere else.
  const afterSignup = safeNextPath(formData.get("next"), WELCOME_PATH);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by the on_auth_user_created trigger to create the shop.
      data: { shop_name: shopName },
      emailRedirectTo: confirmUrl(afterSignup),
    },
  });

  if (error) {
    if (error.code === "weak_password") {
      return { fieldErrors: { password: ["Choose a stronger password"] }, values };
    }
    return {
      error: "We couldn't create your account. If you already have one, log in instead.",
      values,
    };
  }

  // Email confirmation off: signed in already. On: wait for the email link.
  if (data.session) redirect(afterSignup);
  return { message: "Check your email for a link to confirm your account." };
}

export async function logIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = keep(formData, "email");
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, values);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        error: "Please confirm your email first. Check your inbox for the link.",
        values,
      };
    }
    return { error: "Invalid email or password.", values };
  }

  redirect(safeNextPath(formData.get("next")));
}

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  // Result deliberately ignored: same answer whether or not the account exists.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: confirmUrl("/reset/update"),
  });

  return {
    message: "If an account exists for that email, we've sent a link to reset your password.",
  };
}

export async function updatePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = updatePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) {
    return { error: "Your reset link has expired. Request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return { fieldErrors: { password: ["Choose a password you haven't used before"] } };
    }
    if (error.code === "weak_password") {
      return { fieldErrors: { password: ["Choose a stronger password"] } };
    }
    return { error: "We couldn't update your password. Please try again." };
  }

  redirect(HOME_PATH);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(LOGIN_PATH);
}
