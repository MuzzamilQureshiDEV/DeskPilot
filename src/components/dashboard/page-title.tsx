"use client";

import { usePathname } from "next/navigation";

import { activeNavItem } from "@/components/dashboard/nav";

/** Current section name for the top bar. */
export function PageTitle() {
  const pathname = usePathname();
  return (
    <span className="text-sm font-medium">{activeNavItem(pathname)?.title ?? "AstaDesk"}</span>
  );
}
