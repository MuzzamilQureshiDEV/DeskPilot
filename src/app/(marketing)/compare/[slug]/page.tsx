import { ArrowRight, Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { PLAN_COPY } from "@/lib/billing/catalog";
import { PLANS, SELF_SERVE_PLANS } from "@/lib/billing/plans";
import { formatPrice } from "@/lib/billing/status";
import { COMPARE_CHECKED, COMPETITORS, competitorBySlug } from "@/lib/marketing/compare";
import { paypalConfig } from "@/lib/paypal/client";
import { loadPayPalPrices } from "@/lib/paypal/checkout";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { loadPrices } from "@/lib/stripe/checkout";

// AstaDesk's own prices come from PayPal / Stripe; refresh at most hourly.
export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/compare/[slug]">): Promise<Metadata> {
  const them = competitorBySlug((await params).slug);
  if (!them) return {};
  const title = `AstaDesk vs ${them.name}: AI support for Shopify stores compared`;
  const path = `/compare/${them.slug}`;
  return {
    title,
    description: them.verdict,
    alternates: { canonical: path, languages: { en: path, "x-default": path } },
    openGraph: {
      title,
      description: them.verdict,
      url: path,
      type: "article",
      siteName: SITE_NAME,
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "AstaDesk: AI customer support for Shopify stores" }],
    },
  };
}

function Points({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((it) => (
        <li key={it} className="flex gap-2.5">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Check className="size-3.5" aria-hidden />
          </span>
          {it}
        </li>
      ))}
    </ul>
  );
}

export default async function ComparePage({ params }: PageProps<"/compare/[slug]">) {
  const them = competitorBySlug((await params).slug);
  if (!them) notFound();

  const prices = paypalConfig() ? await loadPayPalPrices() : await loadPrices();
  const plans = SELF_SERVE_PLANS.flatMap((plan) => {
    const price = prices.find((p) => p.plan === plan);
    return price
      ? [`${PLAN_COPY[plan].kicker} ${formatPrice(price.amount, price.currency)} a month (${(PLANS[plan].aiRepliesPerMonth ?? 0).toLocaleString("en-US")} AI replies)`]
      : [];
  });
  const others = COMPETITORS.filter((c) => c.slug !== them.slug);
  const url = `${SITE_URL}/compare/${them.slug}`;
  const title = `AstaDesk vs ${them.name}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: `${title}: AI support for Shopify stores compared`,
        description: them.verdict,
        inLanguage: "en",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${SITE_URL}/#software` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Compare", item: `${SITE_URL}/compare` },
          { "@type": "ListItem", position: 3, name: title, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: them.faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      },
    ],
  };

  return (
    <>
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-accent/70 via-background to-background" aria-hidden />
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-16 pb-10 sm:px-6 sm:pt-24">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">Home</Link> / <Link href="/compare" className="hover:text-foreground">Compare</Link> / {them.name}
          </nav>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-6xl">
            AstaDesk vs <span className="font-display font-normal text-primary italic">{them.name}</span>
          </h1>
          <p className="text-lg text-muted-foreground sm:text-xl">
            AstaDesk is an AI customer support platform for Shopify stores that answers order, shipping and product questions from live
            store data. {them.summary}
          </p>
          <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5">
            <p className="text-xs font-semibold tracking-wider text-primary uppercase">The short answer</p>
            <p className="mt-2 text-lg">{them.verdict}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">Side by side</h2>
        <div className="mt-6 overflow-hidden rounded-3xl border bg-card shadow-soft">
          <table className="w-full text-left text-sm">
            <thead className="hidden bg-muted/40 text-xs tracking-wider text-muted-foreground uppercase sm:table-header-group">
              <tr>
                <th scope="col" className="w-1/5 px-5 py-3 font-semibold"><span className="sr-only">Topic</span></th>
                <th scope="col" className="w-2/5 px-5 py-3 font-semibold text-primary">AstaDesk</th>
                <th scope="col" className="w-2/5 px-5 py-3 font-semibold">{them.name}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {them.rows.map((row) => (
                <tr key={row.topic} className="flex flex-col sm:table-row">
                  <th scope="row" className="px-5 pt-4 align-top font-semibold sm:py-4">{row.topic}</th>
                  <td className="px-5 pt-2 align-top sm:py-4">
                    <span className="mb-0.5 block text-xs font-semibold text-primary sm:hidden">AstaDesk</span>
                    {row.astadesk}
                  </td>
                  <td className="px-5 pt-2 pb-4 align-top text-muted-foreground sm:py-4">
                    <span className="mb-0.5 block text-xs font-semibold text-foreground sm:hidden">{them.name}</span>
                    {row.them}
                  </td>
                </tr>
              ))}
              <tr className="flex flex-col sm:table-row">
                <th scope="row" className="px-5 pt-4 align-top font-semibold sm:py-4">Prices</th>
                <td className="px-5 pt-2 align-top sm:py-4">
                  <span className="mb-0.5 block text-xs font-semibold text-primary sm:hidden">AstaDesk</span>
                  {plans.length > 0 ? `${plans.join(", ")}.` : "3 flat monthly plans."}{" "}
                  <Link href="/#pricing" className="text-primary underline underline-offset-4">See pricing</Link>
                </td>
                <td className="px-5 pt-2 pb-4 align-top text-muted-foreground sm:py-4">
                  <span className="mb-0.5 block text-xs font-semibold text-foreground sm:hidden">{them.name}</span>
                  Prices change, so we don&apos;t repeat them here.{" "}
                  <a href={them.pricingUrl} rel="noopener nofollow" target="_blank" className="underline underline-offset-4">
                    {them.name}&apos;s pricing page
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-y bg-muted/30">
        <div className="mx-auto grid w-full max-w-4xl gap-5 px-4 py-14 sm:px-6 md:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-3xl border border-primary/30 bg-card p-7 shadow-soft">
            <h2 className="text-xl font-semibold">Choose AstaDesk if</h2>
            <Points items={them.chooseAstaDesk} />
          </div>
          <div className="flex flex-col gap-4 rounded-3xl border bg-card p-7 shadow-soft">
            <h2 className="text-xl font-semibold">Choose {them.name} if</h2>
            <Points items={them.chooseThem} />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">Common questions</h2>
        <div className="mt-6 flex flex-col gap-6">
          {them.faq.map(({ q, a }) => (
            <div key={q}>
              <h3 className="text-lg font-semibold">{q}</h3>
              <p className="mt-2 text-muted-foreground">{a}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-sm text-muted-foreground">
          Other comparisons:{" "}
          {others.map((c, i) => (
            <span key={c.slug}>
              {i > 0 && ", "}
              <Link href={`/compare/${c.slug}`} className="text-primary underline underline-offset-4">AstaDesk vs {c.name}</Link>
            </span>
          ))}
          .
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Written by the AstaDesk team from {them.name}&apos;s public website, checked in {COMPARE_CHECKED}. Products change; if
          something here is out of date, tell us and we&apos;ll correct it. {them.name} is a trademark of its owner, and AstaDesk is
          not affiliated with it.
        </p>
      </section>

      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-accent/60 to-accent" aria-hidden />
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">See Ava answer on a sample store</h2>
          <p className="max-w-xl text-lg text-muted-foreground">Create an account, connect your store and test Ava before you choose a plan.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/signup" className={buttonVariants({ size: "lg", className: "h-12 px-6 text-base shadow-lift" })}>
              Get started
              <ArrowRight aria-hidden />
            </Link>
            <Link href="/#demo" className={buttonVariants({ size: "lg", variant: "outline", className: "h-12 bg-background px-6 text-base" })}>
              Watch Ava work
            </Link>
          </div>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </>
  );
}
