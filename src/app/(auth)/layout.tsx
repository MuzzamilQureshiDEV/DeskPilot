import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative isolate flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-4 py-12">
      <div className="absolute inset-0 -z-10 bg-dots [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" aria-hidden />
      <div className="absolute top-1/4 left-1/2 -z-10 h-80 w-[520px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" aria-hidden />
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 font-display text-lg text-primary-foreground italic shadow-soft">
          d
        </span>
        DeskPilot
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
