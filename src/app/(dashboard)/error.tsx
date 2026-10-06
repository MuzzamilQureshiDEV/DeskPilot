"use client";

import * as Sentry from "@sentry/nextjs";
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** A page in the dashboard crashed: keep the sidebar, offer a retry. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <TriangleAlert className="size-8 text-destructive" aria-hidden />
      <h1 className="text-xl font-semibold">This page couldn&apos;t load</h1>
      <p className="text-sm text-muted-foreground">
        Something went wrong on our side. Your data is safe. Try again, and if it keeps happening, let us know
        {error.digest ? ` (reference ${error.digest})` : ""}.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
