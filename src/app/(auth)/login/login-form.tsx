"use client";

import Link from "next/link";
import { useActionState } from "react";

import { logIn } from "@/app/(auth)/actions";
import { FormAlert, FormField } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/auth/schemas";

const initialState: FormState = {};

export function LoginForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [state, formAction, pending] = useActionState(logIn, initialState);

  const error =
    state.error ?? (linkError ? "That link is invalid or has expired. Please try again." : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormAlert error={error} />
      {next && <input type="hidden" name="next" value={next} />}
      <FormField
        name="email"
        defaultValue={state.values?.email}
        label="Email"
        type="email"
        autoComplete="email"
        required
        errors={state.fieldErrors?.email}
      />
      <div className="flex flex-col gap-1">
        <FormField
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          errors={state.fieldErrors?.password}
        />
        <Link href="/reset" className="self-end text-sm text-muted-foreground hover:text-primary">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
