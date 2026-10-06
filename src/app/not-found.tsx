import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
      <p className="max-w-sm text-muted-foreground">The link may be old, or the page may have moved.</p>
      <div className="flex gap-3">
        <Link href="/home" className={buttonVariants()}>
          Go to dashboard
        </Link>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Home page
        </Link>
      </div>
    </main>
  );
}
