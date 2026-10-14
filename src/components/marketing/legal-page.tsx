import Link from "next/link";
import type { ReactNode } from "react";

const PAGES = [
  ["/privacy", "Privacy Policy"],
  ["/terms", "Terms of Service"],
  ["/security", "Security"],
] as const;

/**
 * Shared layout for Privacy, Terms and Security: a dark title band, then a
 * narrow reading column with sections divided by rules.
 */
export function LegalPage({ title, subtitle, intro, current, children }: { title: string; subtitle: string; intro?: ReactNode; current: string; children: ReactNode }) {
  return (
    <>
      <header className="border-b border-white/10 bg-[oklch(0.17_0.015_200)] text-white">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 px-4 py-16 text-center sm:px-6 sm:py-20">
          <p className="text-xs font-semibold tracking-wider text-white/50 uppercase">AstaDesk · a product of Websaura</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
          <p className="text-sm text-white/60">{subtitle}</p>
        </div>
      </header>

      <article className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        {intro && <div className="mb-8 border-b pb-8 text-[15px] leading-7 text-muted-foreground [&_strong]:text-foreground">{intro}</div>}
        <div className="flex flex-col text-[15px] leading-7 text-muted-foreground [&_a]:text-primary [&_a]:underline-offset-2 hover:[&_a]:underline [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3 [&_section]:border-t [&_section]:py-8 [&_section:first-child]:border-t-0 [&_section:first-child]:pt-0 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:mt-3 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">
          {children}
        </div>

        <nav aria-label="Legal pages" className="mt-6 flex flex-wrap justify-center gap-2 border-t pt-8 text-sm">
          {PAGES.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={href === current ? "page" : undefined}
              className={
                href === current
                  ? "rounded-full bg-primary/10 px-4 py-1.5 font-medium text-primary"
                  : "rounded-full border px-4 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
              }
            >
              {label}
            </Link>
          ))}
        </nav>
      </article>
    </>
  );
}

/** "email us at x" when configured, otherwise a safe fallback. */
export function ContactLine({ email }: { email: string | null }) {
  return email ? <a href={`mailto:${email}`}>{email}</a> : <span>the support contact shown in your AstaDesk dashboard (Settings)</span>;
}
