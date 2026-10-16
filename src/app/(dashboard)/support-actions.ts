"use server";

import { z } from "zod";

import { getAuthUser, getCurrentShop } from "@/lib/auth/session";
import { emailConfig, sendEmail } from "@/lib/email/outbound";
import { serverEnv } from "@/lib/env";

// Dashboard "Contact support" form → an email to the AstaDesk team
// (SUPPORT_INBOX_EMAIL, default info@websaura.com). Reply-To is the person who
// wrote, so the team answers them directly.

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80, "Keep your name under 80 characters."),
  email: z.email("Enter a valid email address.").max(200),
  concern: z.string().trim().min(10, "Tell us a little more (at least 10 characters).").max(4000, "Keep it under 4,000 characters."),
});

export type SupportResult = { ok: true } | { ok: false; error: string };

// A few requests per person per hour is plenty; this stops accidental floods.
const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;
const recent = new Map<string, number[]>();

export async function sendSupportRequest(input: unknown): Promise<SupportResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Log in again and retry." };

  const now = Date.now();
  const times = (recent.get(user.id) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= LIMIT) return { ok: false, error: "You've sent several requests recently. Our team will get back to you soon." };

  const config = emailConfig();
  if (!config) return { ok: false, error: "Support email isn't available right now. Please email info@websaura.com directly." };

  const shop = await getCurrentShop();
  const { name, email, concern } = parsed.data;
  const text = [
    `New support request from the AstaDesk dashboard`,
    ``,
    `Name: ${name}`,
    `Email: ${email}`,
    `Store: ${shop?.name ?? "—"} (plan: ${shop?.plan === "trial" ? "no plan yet" : (shop?.plan ?? "—")})`,
    `Login: ${user.email ?? "—"}`,
    ``,
    `Concern:`,
    concern,
    ``,
    `Reply to this email to answer ${name} directly.`,
  ].join("\n");

  const sent = await sendEmail(
    {
      to: serverEnv().SUPPORT_INBOX_EMAIL,
      fromName: "AstaDesk support form",
      subject: `Support request: ${name}${shop ? ` · ${shop.name}` : ""}`.slice(0, 150),
      text,
      replyTo: email,
    },
    config,
  );
  if (!sent.ok) {
    console.error("support form: email failed");
    return { ok: false, error: "Couldn't send right now. Please try again in a minute, or email info@websaura.com." };
  }
  recent.set(user.id, [...times, now]);
  return { ok: true };
}
