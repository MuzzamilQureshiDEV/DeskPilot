"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

function partOfDay(hour: number) {
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** "Good morning" in the merchant's own time zone (falls back to "Welcome back" on the server). */
export function Greeting({ name }: { name: string }) {
  const text = useSyncExternalStore(subscribe, () => partOfDay(new Date().getHours()), () => "Welcome back");
  return (
    <>
      {text}, <span className="font-display italic text-primary">{name}</span>
    </>
  );
}
