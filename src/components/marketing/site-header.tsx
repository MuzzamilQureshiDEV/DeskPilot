import Link from "next/link";

import { BrandLogo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="AstaDesk home" className="flex items-center">
          <BrandLogo className="h-8" />
        </Link>
        <nav aria-label="Main" className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
          {([
            ["/#how-it-works", "How it works"],
            ["/#demo", "See Ava work"],
            ["/#pricing", "Pricing"],
            ["/#faq", "FAQ"],
          ] as const).map(([href, label]) => (
            <Link key={href} href={href} className="hidden rounded-md px-3 py-2 text-muted-foreground transition-colors hover:text-foreground md:block">
              {label}
            </Link>
          ))}
          <ThemeToggle className="mr-1 hidden lg:inline-flex" />
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
