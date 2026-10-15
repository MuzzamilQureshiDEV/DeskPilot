"use client";

import { useEffect } from "react";

/** On narrow screens, brings the selected Settings tab into view in the scrollable tab bar. */
export function ScrollActiveTab({ navId, active }: { navId: string; active: string }) {
  useEffect(() => {
    const el = document.getElementById(navId)?.querySelector<HTMLElement>('[aria-current="page"]');
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [navId, active]);
  return null;
}
