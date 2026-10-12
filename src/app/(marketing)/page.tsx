import {
  ArrowRight,
  Bot,
  Check,
  Hand,
  Inbox,
  Mail,
  MessageCircle,
  PackageSearch,
  ShieldCheck,
  Sparkles,
  Store,
  TriangleAlert,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PricingCards } from "@/components/billing/pricing-cards";
import { LaunchGate } from "@/components/marketing/launch-gate";
import { buttonVariants } from "@/components/ui/button";
import { LAUNCH_AT, LAUNCH_LABEL } from "@/lib/launch";
import { paypalConfig } from "@/lib/paypal/client";
import { loadPayPalPrices } from "@/lib/paypal/checkout";
import { loadPrices } from "@/lib/stripe/checkout";

export const metadata: Metadata = {
  title: "AstaDesk · AI customer support for Shopify stores",
  description:
    "An AI support agent that answers order, shipping and product questions from your real Shopify data, and never moves money without your approval.",
};

// Prices come from Stripe; refresh the page at most hourly.
export const revalidate = 3600;

const STEPS = [
  { icon: Store, title: "Connect Shopify", text: "One click. AstaDesk reads orders, tracking and products so answers use real data." },
  { icon: Mail, title: "Forward your support email", text: "Keep your inbox. Customer emails, and chats from your store, land in AstaDesk." },
  { icon: Sparkles, title: "Let the agent draft", text: "It drafts replies in your tone. You send them, or turn on Autopilot for routine questions." },
];

const FEATURES = [
  { icon: PackageSearch, title: "Answers from your store, not guesses", text: "Order status, tracking, shipping times and product questions, looked up live. If the data isn't there, it says so." },
  { icon: ShieldCheck, title: "Money never moves without you", text: "Refunds, cancellations and address changes are proposed with one-click approve. Nothing happens in Shopify until you approve." },
  { icon: TriangleAlert, title: "Escalates instead of inventing", text: "Unsure, upset customer, or missing data? It hands the conversation to you with the reason, instead of making something up." },
  { icon: Inbox, title: "One inbox for email and chat", text: "Email and your store's chat bubble in one place, updating live. Take over any conversation at any time." },
  { icon: MessageCircle, title: "Chat on your storefront", text: "A lightweight chat bubble on every page of your Shopify theme, switched on in a click from the theme editor." },
  { icon: Bot, title: "Your agent, your voice", text: "Name it, pick a tone, teach it your policies and FAQs. Try it on a sample store before customers see anything." },
];

const FAQ = [
  {
    q: "Will the AI make things up?",
    a: "It can only state facts that come from your Shopify data or the policies you add. When it can't find the answer, it escalates the conversation to you with a short holding reply.",
  },
  {
    q: "Can it issue refunds on its own?",
    a: "No. Refunds, cancellations and address changes are always proposals that wait for your approval. Even on Autopilot, money-related replies are never sent automatically.",
  },
  {
    q: "Do I have to change my support email?",
    a: "No. You forward your existing support inbox to AstaDesk. Customers keep writing to the same address, and replies come from your store's name.",
  },
  {
    q: "How do customers know they're talking to an AI?",
    a: "The store chat is labelled as an AI assistant, and a person can take over any conversation at any time.",
  },
  {
    q: "Can I see how Ava works before choosing a plan?",
    a: "Yes. Create your account, connect your store, add your policies and watch Ava answer questions on the Test page. Choose a plan when you're ready for Ava to reply to real customers.",
  },
];

export default async function LandingPage() {
  const prices = paypalConfig() ? await loadPayPalPrices() : await loadPrices();
  return (
    <>
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-dots [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" aria-hidden />
        <div className="absolute top-0 left-1/2 -z-10 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" aria-hidden />
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 pt-20 pb-16 text-center sm:px-6 sm:pt-28">
        <span className="rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
          For Shopify merchants · founding prices for early customers · by Websaura
        </span>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Customer support that runs on your store&apos;s{" "}
          <span className="font-display font-normal italic text-primary">real data.</span>
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground text-balance">
          AstaDesk is an AI support agent that answers order, shipping and product questions from Shopify, drafts replies in
          your voice, and never moves money without your approval.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/signup" className={buttonVariants({ size: "lg" })}>
            Get started
            <ArrowRight aria-hidden />
          </Link>
          <Link href="#how-it-works" className={buttonVariants({ size: "lg", variant: "outline" })}>
            See how it works
          </Link>
        </div>
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {["Live Shopify data", "Approval for every refund", "Escalates when unsure"].map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <Check className="size-4 text-primary" aria-hidden />
              {t}
            </li>
          ))}
        </ul>

        {/* Product preview: what a conversation looks like */}
        <div className="mt-10 w-full max-w-3xl rounded-2xl border bg-card/80 p-2 text-left shadow-lift backdrop-blur">
          <div className="flex items-center gap-1.5 px-3 py-2" aria-hidden>
            <span className="size-2.5 rounded-full bg-destructive/60" />
            <span className="size-2.5 rounded-full bg-warning/70" />
            <span className="size-2.5 rounded-full bg-success/70" />
            <span className="ml-3 text-xs text-muted-foreground">Inbox · Where is my order #1001?</span>
          </div>
          <div className="flex flex-col gap-3 rounded-xl bg-background p-4 sm:p-5">
            <div className="max-w-[80%] self-start rounded-2xl rounded-bl-md bg-muted px-4 py-2.5 text-sm">
              Hi! I ordered a jacket last week. Where is order #1001?
            </div>
            <div className="flex max-w-[85%] flex-col gap-2 self-end rounded-2xl rounded-br-md border border-primary/30 bg-accent px-4 py-3 text-sm text-accent-foreground">
              <span className="flex items-center gap-2 text-xs font-medium">
                <Sparkles className="size-3.5" aria-hidden /> Ava&apos;s draft · 94% confident · from Shopify
              </span>
              Hi Emma! Your order #1001 shipped on Monday with UPS. It&apos;s due on Thursday, and you can track it here:
              1Z999AA10123456784.
            </div>
            <div className="flex flex-wrap gap-2 self-end text-xs">
              <span className="rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground">Send</span>
              <span className="rounded-full border px-3 py-1">Edit</span>
              <span className="rounded-full border px-3 py-1">Take over</span>
            </div>
          </div>
        </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-20 border-y bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">Live in about ten minutes</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex flex-col gap-3 rounded-xl border bg-background p-6">
                <span className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {i + 1}
                  </span>
                  <Icon className="size-5 text-primary" aria-hidden />
                </span>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">Built to be trusted with your customers</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex flex-col gap-2 rounded-xl border p-6">
              <Icon className="size-5 text-primary" aria-hidden />
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="scroll-mt-20 border-y bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">Founding prices for early customers</h2>
          <p className="mt-2 text-center text-muted-foreground">Lock in these prices while founding spots last. Cancel anytime.</p>
          <div className="mt-10">
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

      <section className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">Questions merchants ask</h2>
        <div className="mt-8 flex flex-col divide-y rounded-xl border">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group px-5 py-4">
              <summary className="cursor-pointer list-none font-medium marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {q}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto mb-20 flex w-full max-w-6xl flex-col items-center gap-4 rounded-2xl bg-primary px-6 py-12 text-center text-primary-foreground">
        <Hand className="size-8" aria-hidden />
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Give your team its evenings back</h2>
        <p className="max-w-xl opacity-90">Connect your store, try the agent on a sample store, and go live when you&apos;re happy.</p>
        <Link href="/signup" className={buttonVariants({ size: "lg", variant: "secondary" })}>
          Get started
        </Link>
      </section>
    </>
  );
}
