import { Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeNextPath } from "@/lib/auth/routes";
import { normalizeShopDomain, storeNameFromDomain } from "@/lib/shopify/domain";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your account · AstaDesk" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "") || undefined;
  const shopDomain = typeof params.shop === "string" ? normalizeShopDomain(params.shop) : null;
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start your free trial</CardTitle>
        <CardDescription>14 days free. No card needed.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {shopDomain && (
          <p className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm">
            <Store className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>
              Create your AstaDesk account to connect <strong>{shopDomain}</strong>. You&apos;ll go straight back to
              Shopify to finish.
            </span>
          </p>
        )}
        <SignupForm next={next} defaultShopName={shopDomain ? storeNameFromDomain(shopDomain) : undefined} />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href={loginHref} className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
