"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUp } from "@/app/(auth)/actions";
import { FormAlert, FormField } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/auth/schemas";

const initialState: FormState = {};

export function SignupForm({ next, defaultShopName }: { next?: string; defaultShopName?: string }) {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  if (state.message) return <FormAlert message={state.message} />;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormAlert error={state.error} />
      {next && <input type="hidden" name="next" value={next} />}
      <FormField
        name="shopName"
        defaultValue={state.values?.shopName ?? defaultShopName}
        label="Store name"
        autoComplete="organization"
        required
        maxLength={80}
        errors={state.fieldErrors?.shopName}
      />
      <FormField
        name="email"
        defaultValue={state.values?.email}
        label="Email"
        type="email"
        autoComplete="email"
        required
        errors={state.fieldErrors?.email}
      />
      <FormField
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        errors={state.fieldErrors?.password}
      />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        By creating an account you agree to our{" "}
        <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}
