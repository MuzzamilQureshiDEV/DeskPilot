import { Inngest } from "inngest";

/**
 * Background jobs (Inngest v4). Local dev: set INNGEST_DEV=1 and run the
 * Inngest dev server. Production: INNGEST_SIGNING_KEY / INNGEST_EVENT_KEY are
 * read from the environment (set by Inngest's Vercel integration).
 */
export const inngest = new Inngest({ id: "deskpilot" });
