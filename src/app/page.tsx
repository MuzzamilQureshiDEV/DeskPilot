import { CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

const points = [
  {
    icon: Sparkles,
    text: "Answers order, shipping and product questions from live store data",
  },
  {
    icon: ShieldCheck,
    text: "Refunds, cancellations and address changes always wait for your approval",
  },
  {
    icon: CheckCircle2,
    text: "Hands off to you whenever it isn't sure",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-24">
      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-primary">DeskPilot</span>
        <h1 className="text-4xl font-semibold tracking-tight">
          Customer support that runs on your store&apos;s real data.
        </h1>
        <p className="text-lg text-muted-foreground">
          An AI agent for Shopify merchants that drafts and sends replies, and
          never moves money without you.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {points.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3">
            <Icon className="mt-0.5 size-5 text-primary" aria-hidden />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Link href="/signup" className={buttonVariants({ size: "lg" })}>
          Start free trial
        </Link>
        <Link href="/login" className={buttonVariants({ size: "lg", variant: "outline" })}>
          Log in
        </Link>
      </div>
    </main>
  );
}
