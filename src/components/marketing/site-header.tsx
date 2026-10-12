import Link from "next/link";

import { BrandLogo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="AstaDesk home" className="flex items-center">
          <BrandLogo className="h-8" />
        </Link>
        <nav aria-label="Main" className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
          <Link href="/#how-it-works" className="hidden rounded-md px-3 py-2 text-muted-foreground hover:text-foreground sm:block">
            How it works
          </Link>
          <Link href="/#pricing" className="hidden rounded-md px-3 py-2 text-muted-foreground hover:text-foreground sm:block">
            Pricing
          </Link>
          <ThemeToggle className="mr-1 hidden md:inline-flex" />
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Log in
          </Link>
          <Link href="/signup" className={buttonVariants({ size: "sm" })}>
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
