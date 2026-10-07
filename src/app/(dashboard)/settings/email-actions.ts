"use server";

import { getAuthUser, getCurrentShop } from "@/lib/auth/session";
import { emailConfig, sendEmail } from "@/lib/email/outbound";

/** Sends a test email to the signed-in user, to check sending works. */
export async function sendTestEmail(): Promise<{ ok: boolean; message: string }> {
  const [user, shop] = await Promise.all([getAuthUser(), getCurrentShop()]);
  if (!user?.email || !shop) return { ok: false, message: "Log in again and retry." };
  const config = emailConfig();
  if (!config) return { ok: false, message: "Email sending isn't set up yet." };

  const res = await sendEmail(
    {
      to: user.email,
      fromName: `${shop.agentName} at ${shop.name}`,
      subject: "AstaDesk test email",
      text: `This is a test from AstaDesk. If you can read this, ${shop.agentName}'s replies can reach your customers.\n\n${shop.agentName}`,
    },
    config,
  );
  return res.ok
    ? { ok: true, message: `Sent to ${user.email}. Check your inbox (and spam folder).` }
    : { ok: false, message: `The email service said: ${res.error}` };
}
