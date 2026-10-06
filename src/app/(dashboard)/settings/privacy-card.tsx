"use client";

import { Download } from "lucide-react";
import { useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";

import { completePrivacyRequest } from "./privacy-actions";

export function DataRequestActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-wrap gap-2">
      <a href={`/api/privacy/export/${id}`} className={buttonVariants({ variant: "outline", size: "xs" })}>
        <Download aria-hidden />
        Download data
      </a>
      <Button size="xs" variant="ghost" disabled={pending} onClick={() => start(async () => void (await completePrivacyRequest(id)))}>
        {pending ? "Saving…" : "Mark as sent"}
      </Button>
    </span>
  );
}
