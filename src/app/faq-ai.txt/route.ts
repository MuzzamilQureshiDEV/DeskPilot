import { FAQ } from "@/lib/marketing/faq";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

/** The home page FAQ as plain text for AI assistants. */
export function GET() {
  const body = [
    "# AstaDesk: frequently asked questions",
    `# Source: ${SITE_URL}/#faq`,
    "",
    ...FAQ.flatMap(({ q, a }) => [`Q: ${q}`, `A: ${a}`, ""]),
    `Pricing: ${SITE_URL}/#pricing`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
