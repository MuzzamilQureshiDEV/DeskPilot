import type { ReactNode } from "react";

/** Shared layout for the Privacy Policy and Terms (readable width, simple prose styles). */
export function LegalPage({ title, effective, intro, children }: { title: string; effective: string; intro: ReactNode; children: ReactNode }) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Effective {effective}</p>
      <div className="mt-6 text-muted-foreground">{intro}</div>
      <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-2 [&_ul]:mt-2 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
        {children}
      </div>
    </article>
  );
}

/** "email us at x" when configured, otherwise a safe fallback. */
export function ContactLine({ email }: { email: string | null }) {
  return email ? (
    <a href={`mailto:${email}`}>{email}</a>
  ) : (
    <span>the support contact shown in your DeskPilot dashboard (Settings)</span>
  );
}
