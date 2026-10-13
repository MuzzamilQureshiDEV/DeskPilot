import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Hand,
  Inbox,
  Mail,
  MessageCircle,
  PackageSearch,
  Play,
  ShieldCheck,
  Sparkles,
  Store,
  Wand2,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PricingCards } from "@/components/billing/pricing-cards";
import { AvaDemo } from "@/components/marketing/ava-demo";
import { LaunchGate } from "@/components/marketing/launch-gate";
import { buttonVariants } from "@/components/ui/button";
import { LAUNCH_AT, LAUNCH_LABEL } from "@/lib/launch";
import { paypalConfig } from "@/lib/paypal/client";
import { loadPayPalPrices } from "@/lib/paypal/checkout";
import { loadPrices } from "@/lib/stripe/checkout";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "AstaDesk · AI customer support for Shopify stores",
  description:
    "An AI support agent that answers order, shipping and product questions from your real Shopify data, and never moves money without your approval.",
};

// Prices come from PayPal / Stripe; refresh the page at most hourly.
export const revalidate = 3600;

/** Small pill above section headings. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-xs font-semibold tracking-wider text-primary uppercase">
      <span className="size-1.5 rounded-full bg-primary" aria-hidden />
      {children}
    </span>
  );
}

const INBOX = [
  { who: "JS", tint: "bg-rose-500/12 text-rose-600 dark:text-rose-300", subject: "Where's my order #4821?", preview: "Hi, can you tell me where my order is?", time: "2m", state: "ava" },
  { who: "MT", tint: "bg-violet-500/12 text-violet-600 dark:text-violet-300", subject: "Can you cancel order #2214?", preview: "I ordered the wrong colour, sorry!", time: "5m", state: "approve" },
  { who: "AW", tint: "bg-amber-500/15 text-amber-700 dark:text-amber-300", subject: "Is this in stock in Medium?", preview: "Do you have the Trail Jacket in M?", time: "8m", state: "ava" },
  { who: "LR", tint: "bg-sky-500/12 text-sky-700 dark:text-sky-300", subject: "What's your return policy?", preview: "Can I return a sale item?", time: "11m", state: "ava" },
  { who: "DK", tint: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300", subject: "Refund for order #3390", preview: "The mug arrived chipped.", time: "13m", state: "approve" },
] as const;

const STEPS = [
  { icon: Store, title: "Connect Shopify", text: "One click. Ava reads your orders, tracking and products, so every answer uses real data." },
  { icon: Mail, title: "Forward your support email", text: "Keep your address. Customer emails, plus chats from your storefront, land in one AstaDesk inbox." },
  { icon: Wand2, title: "Teach Ava, then go live", text: "Add your policies and tone, try her on a sample store, and switch on the topics she can answer alone." },
];

const MODES = [
  {
    icon: CheckCircle2,
    title: "Handles on her own",
    tone: "text-success bg-success/12",
    items: ["Order status and tracking", "Product and stock questions", "Shipping times and costs", "Your store policies", "Everyday questions"],
    note: "On Autopilot (Growth and Scale), when Ava is confident.",
  },
  {
    icon: ShieldCheck,
    title: "Waits for your tap",
    tone: "text-[color-mix(in_oklch,var(--warning),var(--foreground)_45%)] bg-warning/15",
    items: ["Refunds", "Order cancellations", "Shipping address changes"],
    note: "Ava prepares it. Nothing happens in Shopify until you approve, and then she tells the customer.",
  },
  {
    icon: Hand,
    title: "Hands it to you",
    tone: "text-primary bg-primary/10",
    items: ["Questions your policies don't cover", "Upset or angry customers", "Anything she isn't sure about"],
    note: "With a short reason, so you can pick it up in seconds.",
  },
];

const PERKS = [
  { icon: PackageSearch, title: "Live Shopify data", text: "Real orders and tracking, never guesses." },
  { icon: Inbox, title: "Email + chat, one inbox", text: "Updates live. Take over any time." },
  { icon: MessageCircle, title: "Storefront chat", text: "A light chat bubble, on in one click." },
  { icon: Sparkles, title: "Sounds like you", text: "Your tone, your policies, your rules." },
];

const FAQ = [
  {
    q: "Will Ava make things up?",
    a: "She can only state facts from your Shopify data or the policies you add. When she can't find the answer, she sends a short holding reply and hands the conversation to you.",
  },
  {
    q: "Can Ava issue refunds on her own?",
    a: "No. Refunds, cancellations and address changes are always proposals that wait for your approval, even on Autopilot. Once you approve and it's done in Shopify, Ava tells the customer.",
  },
  {
    q: "Do I have to change my support email?",
    a: "No. You forward your existing support inbox to AstaDesk. Customers keep writing to the same address.",
  },
  {
    q: "How do customers know they're talking to an AI?",
    a: "The store chat is labelled as an AI assistant, and a person can take over any conversation at any time.",
  },
  {
    q: "Can I see how Ava works before choosing a plan?",
    a: "Yes. Create your account, connect your store and try Ava on the Test page with a sample store. Choose a plan when you're ready for her to reply to real customers.",
  },
  {
    q: "How long does setup take?",
    a: "Most stores are ready in about ten minutes: connect Shopify, forward your email, add your policies.",
  },
];

export default async function LandingPage() {
  const prices = paypalConfig() ? await loadPayPalPrices() : await loadPrices();
  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-20 bg-gradient-to-b from-accent/70 via-background to-background" aria-hidden />
        <div className="absolute inset-0 -z-10 bg-dots [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_65%)]" aria-hidden />
        <div className="animate-drift absolute -top-32 left-[8%] -z-10 h-[460px] w-[460px] rounded-full bg-primary/20 blur-3xl" aria-hidden />
        <div className="animate-drift absolute top-10 right-[6%] -z-10 h-[360px] w-[360px] rounded-full bg-sky-400/15 blur-3xl [animation-delay:-7s]" aria-hidden />

        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-7 px-4 pt-24 pb-14 text-center sm:px-6 sm:pt-32 sm:pb-20">
          <Eyebrow>AI support employee for Shopify stores</Eyebrow>
          <h1 className="text-[2.6rem] leading-[1.05] font-semibold tracking-tight text-balance sm:text-7xl">
            Answer every customer,{" "}
            <span className="relative inline-block whitespace-nowrap">
              <span className="font-display font-normal text-primary italic">without the inbox.</span>
              <svg
                className="absolute -bottom-2 left-0 h-3 w-full text-primary/70 sm:-bottom-3"
                viewBox="0 0 300 12"
                preserveAspectRatio="none"
                aria-hidden
              >
                <path d="M3 9 C 80 2, 180 2, 297 7" pathLength={1} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="animate-draw" />
              </svg>
            </span>
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground text-balance sm:text-xl">
            Ava reads your live Shopify orders, answers routine questions in your voice, and checks with you before anything
            touches money. You step in only when it matters.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/signup" className={buttonVariants({ size: "lg", className: "h-12 px-6 text-base shadow-lift" })}>
              Get started
              <ArrowRight aria-hidden />
            </Link>
            <Link href="#demo" className={buttonVariants({ size: "lg", variant: "ghost", className: "h-12 px-5 text-base text-primary" })}>
              <Play className="fill-current" aria-hidden />
              Watch Ava work
            </Link>
          </div>
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {["Live Shopify data", "You approve every refund", "Founding prices for early stores"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-primary" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Sound familiar */}
      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
        <div className="reveal flex flex-col items-start gap-5">
          <Eyebrow>Sound familiar?</Eyebrow>
          <h2 className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
            Support isn&apos;t hard. It&apos;s the <span className="font-display font-normal text-primary italic">same questions</span>, all day.
          </h2>
          <p className="max-w-lg text-lg text-muted-foreground">
            &ldquo;Where&apos;s my order?&rdquo; &ldquo;Is this in stock?&rdquo; &ldquo;Can I return it?&rdquo; Ava answers those from your
            real store data, so your inbox only holds the conversations that need you.
          </p>
        </div>

        <div className="reveal relative">
          <div className="absolute inset-x-6 -top-4 -z-10 h-full rounded-3xl border bg-card/60 shadow-soft" aria-hidden />
          <div className="overflow-hidden rounded-3xl border bg-card shadow-lift">
            <div className="flex items-center gap-1.5 border-b bg-muted/40 px-4 py-3" aria-hidden>
              <span className="size-2.5 rounded-full bg-destructive/60" />
              <span className="size-2.5 rounded-full bg-warning/70" />
              <span className="size-2.5 rounded-full bg-success/70" />
            </div>
            <div className="flex items-center justify-between px-5 py-3.5">
              <p className="font-semibold">Support inbox</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-success">3 answered by Ava</span> · 2 for you
              </p>
            </div>
            <ul className="divide-y border-t">
              {INBOX.map((m) => (
                <li key={m.subject} className="flex items-center gap-3 px-5 py-3.5">
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold", m.tint)} aria-hidden>
                    {m.who}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.preview}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[11px] text-muted-foreground">{m.time} ago</span>
                    {m.state === "ava" ? (
                      <span className="rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-medium text-success">Answered by Ava</span>
                    ) : (
                      <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-[color-mix(in_oklch,var(--warning),var(--foreground)_45%)]">
                        Needs approval
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 border-y bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <div className="reveal flex flex-col items-center gap-4 text-center">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Live in about ten minutes</h2>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="reveal flex flex-col gap-4 rounded-3xl border bg-card p-7 shadow-soft transition-transform duration-300 hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="font-display text-4xl text-muted-foreground/40" aria-hidden>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
        <div className="reveal flex max-w-2xl flex-col items-start gap-4">
          <Eyebrow>Try it yourself</Eyebrow>
          <h2 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Watch Ava resolve a ticket.</h2>
          <p className="text-lg text-muted-foreground">
            Pick a question. See what Ava checks, what she replies, and what waits for you.
          </p>
        </div>
        <div className="reveal mt-10">
          <AvaDemo />
        </div>
      </section>

      {/* When Ava acts */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <div className="reveal flex max-w-2xl flex-col items-start gap-4">
            <Eyebrow>You stay in control</Eyebrow>
            <h2 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Ava handles the routine. <span className="font-display font-normal text-primary italic">You decide the rest.</span>
            </h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {MODES.map(({ icon: Icon, title, tone, items, note }) => (
              <div key={title} className="reveal flex flex-col gap-4 rounded-3xl border bg-card p-7 shadow-soft">
                <span className={cn("flex size-11 items-center justify-center rounded-2xl", tone)}>
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="text-lg font-semibold">{title}</h3>
                <ul className="flex flex-col gap-2 text-sm">
                  {items.map((it) => (
                    <li key={it} className="flex items-start gap-2">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                      {it}
                    </li>
                  ))}
                </ul>
                <p className="mt-auto border-t pt-4 text-sm text-muted-foreground">{note}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PERKS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="reveal flex items-start gap-3 rounded-2xl border bg-background p-5">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="reveal flex flex-col items-center gap-4 text-center">
            <Eyebrow>Founding launch pricing</Eyebrow>
            <h2 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Founding prices for early customers</h2>
            <p className="text-lg text-muted-foreground">Lock in these prices while founding spots last. Cancel anytime.</p>
          </div>
          <div className="mt-12">
            <LaunchGate launchAt={LAUNCH_AT} launchLabel={LAUNCH_LABEL}>
              <PricingCards
                prices={prices}
                cta={(plan) => (
                  <Link
                    href="/signup"
                    className={buttonVariants({
                      size: "lg",
                      variant: plan === "growth" ? "default" : "outline",
                      className: "w-full",
                    })}
                  >
                    Claim your founding spot
                    <ArrowRight aria-hidden />
                  </Link>
                )}
              />
            </LaunchGate>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-y bg-muted/30">
        <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 lg:py-24">
          <div className="reveal flex flex-col items-center gap-4 text-center">
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">Straight answers.</h2>
            <p className="text-lg text-muted-foreground">What merchants ask before they let Ava talk to their customers.</p>
          </div>
          <div className="mt-10 flex flex-col gap-3">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group reveal rounded-2xl border bg-card px-6 shadow-soft transition-colors open:border-primary/30">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                  {q}
                  <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-180" aria-hidden />
                </summary>
                <p className="pb-5 text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-accent/60 to-accent" aria-hidden />
        <div className="reveal mx-auto flex w-full max-w-4xl flex-col items-center gap-6 px-4 py-24 text-center sm:px-6 lg:py-32">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-6xl">
            Let Ava take the repeat questions. <span className="font-display font-normal text-primary italic">You take the weekend.</span>
          </h2>
          <p className="max-w-xl text-lg text-muted-foreground">
            Connect your store, try Ava on a sample store, and go live when you&apos;re happy with her answers.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/signup" className={buttonVariants({ size: "lg", className: "h-12 px-6 text-base shadow-lift" })}>
              Get started
              <ArrowRight aria-hidden />
            </Link>
            <Link href="#demo" className={buttonVariants({ size: "lg", variant: "outline", className: "h-12 bg-background px-6 text-base" })}>
              See what Ava can handle
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
