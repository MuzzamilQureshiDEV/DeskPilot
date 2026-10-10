import { cn } from "@/lib/utils";

// AstaDesk brand assets (public/brand). Plain <img> for crisp SVGs at any size.

/** The round headset-robot mark. */
export function BrandIcon({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/astadesk-icon.svg" alt="" aria-hidden className={cn("size-8 shrink-0", className)} />;
}

/** Full "AstaDesk" wordmark; swaps to the light-on-dark version in dark mode. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/astadesk-logo.svg" alt="AstaDesk" className="h-full w-auto dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/astadesk-logo-dark.svg" alt="AstaDesk" className="hidden h-full w-auto dark:block" />
    </span>
  );
}
