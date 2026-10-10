import Link from "next/link";

import { BrandLogo } from "@/components/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative isolate flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-4 py-12">
      <div className="absolute inset-0 -z-10 bg-dots [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" aria-hidden />
      <div className="absolute top-1/4 left-1/2 -z-10 h-80 w-[520px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" aria-hidden />
      <Link href="/" aria-label="AstaDesk home" className="flex items-center">
        <BrandLogo className="h-10" />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
      <nav aria-label="Legal" className="flex gap-4 text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-foreground">
          Terms
        </Link>
      </nav>
    </main>
  );
}
