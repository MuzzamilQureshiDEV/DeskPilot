"use client";

import { Dialog } from "@base-ui/react/dialog";
import { PlayCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/** "Watch how" button: a one-minute walkthrough of connecting a Shopify store. */
export function ConnectVideoButton() {
  return (
    <Dialog.Root>
      <Dialog.Trigger render={<Button type="button" variant="outline" className="self-start" />}>
        <PlayCircle aria-hidden />
        Watch how to connect (1 min)
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-2xl border bg-popover p-3 text-popover-foreground shadow-lift transition duration-200 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 sm:p-4">
          <div className="flex items-center justify-between gap-4 px-1">
            <Dialog.Title className="text-base font-semibold">How to connect your Shopify store</Dialog.Title>
            <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="Close" className="rounded-full" />}>
              <X aria-hidden />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            A one-minute walkthrough: create an app in the Shopify Dev Dashboard, release and install it, then paste the Client ID and secret into
            AstaDesk.
          </Dialog.Description>
          <video
            className="aspect-video w-full rounded-xl bg-black"
            src="/videos/connect-shopify.mp4"
            poster="/videos/connect-shopify.jpg"
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
