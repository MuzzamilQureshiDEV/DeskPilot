"use client";

import { Dialog } from "@base-ui/react/dialog";
import { PlayCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { HowToVideo } from "@/lib/videos";

/** "Watch how" button that opens a setup walkthrough video in a dialog. */
export function VideoButton({ video }: { video: HowToVideo }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger render={<Button type="button" variant="outline" className="self-start" />}>
        <PlayCircle aria-hidden />
        {video.label}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-2xl border bg-popover p-3 text-popover-foreground shadow-lift transition duration-200 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 sm:p-4">
          <div className="flex items-center justify-between gap-4 px-1">
            <Dialog.Title className="text-base font-semibold">{video.title}</Dialog.Title>
            <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="Close" className="rounded-full" />}>
              <X aria-hidden />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{video.description}</Dialog.Description>
          <video
            className="aspect-video w-full rounded-xl bg-black"
            src={video.src}
            poster={video.poster}
            controls
            autoPlay
            playsInline
            preload="metadata"
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
