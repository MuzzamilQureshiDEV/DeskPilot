import Link from "next/link";

import { BrandIcon } from "@/components/brand";

const COLUMNS = [
  {
    title: "Product",
    links: [
      ["/#how-it-works", "How it works"],
      ["/#demo", "See Ava work"],
      ["/#pricing", "Pricing"],
      ["/#faq", "FAQ"],
    ],
  },
  {
    title: "Account",
    links: [
      ["/signup", "Get started"],
      ["/login", "Log in"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["/privacy", "Privacy Policy"],
      ["/terms", "Terms of Service"],
      ["/security", "Security"],
    ],
  },
] as const;

export function SiteFooter({ entity }: { entity: string }) {
  return (
    <footer className="bg-[oklch(0.17_0.015_200)] text-white/70">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-14 sm:px-6 md:flex-row md:justify-between">
        <div className="flex max-w-xs flex-col gap-3">
          <Link href="/" aria-label="AstaDesk home" className="flex items-center gap-2 text-lg font-semibold text-white">
            <BrandIcon className="size-8" />
            AstaDesk
          </Link>
          <p className="text-sm leading-relaxed">
            The AI support employee for Shopify stores. Ava answers your customers so you can focus on the business.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
          {COLUMNS.map((col) => (
            <div key={col.title} className="flex flex-col gap-3">
              <p className="text-xs font-semibold tracking-wider text-white/45 uppercase">{col.title}</p>
              {col.links.map(([href, label]) => (
                <Link key={href} href={href} className="transition-colors hover:text-white">
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </div>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 border-t border-white/10 px-4 py-6 text-xs text-white/45 sm:flex-row sm:justify-between sm:px-6">
        <p>
          © {new Date().getFullYear()} {entity}. All rights reserved.
        </p>
        <p>
          A product of <span className="font-medium text-white/70">Websaura</span>
        </p>
      </div>
    </footer>
  );
}
