"use client";

import { useActionState } from "react";

import { requestPasswordReset } from "@/app/(auth)/actions";
import { FormAlert, FormField } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/auth/schemas";

const initialState: FormState = {};

export function ResetForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  if (state.message) return <FormAlert message={state.message} />;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormAlert error={state.error} />
      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        errors={state.fieldErrors?.email}
      />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
