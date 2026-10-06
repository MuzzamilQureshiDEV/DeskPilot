import "server-only";

import { serverEnv } from "@/lib/env";

/** When the current Privacy Policy and Terms took effect (update on every material change). */
export const LEGAL_EFFECTIVE_DATE = "7 October 2026";

export type LegalConfig = { entity: string; contactEmail: string | null; governingLaw: string };

export function legalConfig(): LegalConfig {
  const env = serverEnv();
  return {
    entity: env.LEGAL_ENTITY_NAME,
    contactEmail: env.LEGAL_CONTACT_EMAIL ?? env.SALES_EMAIL ?? null,
    governingLaw: env.LEGAL_GOVERNING_LAW,
  };
}
