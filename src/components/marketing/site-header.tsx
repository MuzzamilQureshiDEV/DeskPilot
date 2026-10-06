import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground">D</span>
          DeskPilot
        </Link>
        <nav aria-label="Main" className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
          <Link href="/#how-it-works" className="hidden rounded-md px-3 py-2 text-muted-foreground hover:text-foreground sm:block">
            How it works
          </Link>
          <Link href="/#pricing" className="hidden rounded-md px-3 py-2 text-muted-foreground hover:text-foreground sm:block">
            Pricing
          </Link>
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Log in
          </Link>
          <Link href="/signup" className={buttonVariants({ size: "sm" })}>
            Start free trial
          </Link>
        </nav>
      </div>
    </header>
  );
}
