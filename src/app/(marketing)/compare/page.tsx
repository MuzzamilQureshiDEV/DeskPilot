import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { COMPETITORS } from "@/lib/marketing/compare";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const TITLE = "Compare AstaDesk with Gorgias, Zendesk and Tidio";
const DESCRIPTION = "How AstaDesk, the AI customer support platform for Shopify stores, compares with Gorgias, Zendesk and Tidio, and when each is the better choice.";

export const metadata: Metadata = {
  title: `${TITLE} · ${SITE_NAME}`,
  description: DESCRIPTION,
  alternates: { canonical: "/compare", languages: { en: "/compare", "x-default": "/compare" } },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/compare",
    type: "website",
    siteName: SITE_NAME,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "AstaDesk: AI customer support for Shopify stores" }],
  },
};

export default function CompareIndexPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/compare#webpage`,
        url: `${SITE_URL}/compare`,
        name: TITLE,
        description: DESCRIPTION,
        inLanguage: "en",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        hasPart: COMPETITORS.map((c) => ({ "@type": "WebPage", url: `${SITE_URL}/compare/${c.slug}`, name: `AstaDesk vs ${c.name}` })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Compare", item: `${SITE_URL}/compare` },
        ],
      },
    ],
  };

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-16 sm:px-6 sm:py-24">
      <div className="flex flex-col gap-4">
        <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-6xl">
          How AstaDesk <span className="font-display font-normal text-primary italic">compares</span>
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground sm:text-xl">
          AstaDesk is an AI customer support platform for Shopify stores that answers routine questions from live order data and never
          moves money without your approval. Here is how it differs from 3 well-known support tools, and when each one is the better
          choice.
        </p>
      </div>
      <ul className="grid gap-5 md:grid-cols-3">
        {COMPETITORS.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/compare/${c.slug}`}
              className="flex h-full flex-col gap-3 rounded-3xl border bg-card p-7 shadow-soft transition-transform duration-300 hover:-translate-y-1"
            >
              <h2 className="text-xl font-semibold">AstaDesk vs {c.name}</h2>
              <p className="text-sm text-muted-foreground">{c.verdict}</p>
              <span className="mt-auto flex items-center gap-1.5 pt-2 text-sm font-medium text-primary">
                Read the comparison
                <ArrowRight className="size-4" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </section>
  );
}
