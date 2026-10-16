export type HowToVideo = { src: string; poster: string; title: string; label: string; description: string };

/** Short setup walkthroughs, served from public/videos. */
export const VIDEOS = {
  connectShopify: {
    src: "/videos/connect-shopify.mp4",
    poster: "/videos/connect-shopify.jpg",
    title: "How to connect your Shopify store",
    label: "Watch how to connect (1 min)",
    description:
      "A one-minute walkthrough: create an app in the Shopify Dev Dashboard, release and install it, then paste the Client ID and secret into AstaDesk.",
  },
  forwardGmail: {
    src: "/videos/forward-gmail.mp4",
    poster: "/videos/forward-gmail.jpg",
    title: "How to forward Gmail to AstaDesk",
    label: "Watch how to forward Gmail (1 min)",
    description:
      "A one-minute walkthrough: copy your AstaDesk address, add it as a forwarding address in Gmail, confirm with the code shown in AstaDesk, then turn forwarding on.",
  },
} satisfies Record<string, HowToVideo>;
