"use client";

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
    </form>
  );
}
