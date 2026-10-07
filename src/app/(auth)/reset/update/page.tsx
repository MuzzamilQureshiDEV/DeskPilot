import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";

import { UpdatePasswordForm } from "./update-password-form";

export const metadata: Metadata = { title: "Choose a new password · AstaDesk" };

export default async function UpdatePasswordPage() {
  // Reached from the reset email link, which signs the user in.
  await requireUser();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>You&apos;ll stay logged in after saving.</CardDescription>
      </CardHeader>
      <CardContent>
        <UpdatePasswordForm />
      </CardContent>
    </Card>
  );
}
