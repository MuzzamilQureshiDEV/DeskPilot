import { Check, Lock } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

/** Shown instead of a feature that needs a paid plan (no plan yet). */
export function PlanLocked({ title, description, points }: { title: string; description: string; points: string[] }) {
  return (
    <section
      aria-labelledby="plan-locked-title"
      className="flex flex-col items-start gap-5 rounded-2xl border bg-card p-6 shadow-soft sm:p-8"
    >
      <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Lock className="size-5" aria-hidden />
      </span>
      <div className="flex max-w-xl flex-col gap-1.5">
        <h2 id="plan-locked-title" className="text-lg font-semibold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {points.map((p) => (
          <li key={p} className="flex gap-2.5">
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Check className="size-3" aria-hidden />
            </span>
            {p}
          </li>
        ))}
      </ul>
      <Link href="/billing" className={buttonVariants()}>
        See plans
      </Link>
    </section>
  );
}
