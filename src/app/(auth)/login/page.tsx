import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeNextPath } from "@/lib/auth/routes";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in · AstaDesk" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Log in to your AstaDesk account.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <LoginForm next={next || undefined} linkError={params.error === "link"} />
        <p className="text-center text-sm text-muted-foreground">
          New to AstaDesk?{" "}
          <Link
            href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
            className="font-medium text-primary hover:underline"
          >
            Start a free trial
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
