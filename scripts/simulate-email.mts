// Dev only: post a realistic Postmark inbound payload to the local webhook, so
// the whole email path (auth, filters, threading, queueing) runs as in production.
//
//   npm run dev:email -- "Where is my order #1001?" [customer@email.com] [subject] [login-email]
//   npm run dev:email -- --auto-reply      (an out-of-office: should be filtered)
//
// Needs: npm run dev (and npm run dev:inngest for the AI draft).

import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/types/database";

const env = process.env;
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.POSTMARK_INBOUND_TOKEN || !env.POSTMARK_INBOUND_ADDRESS) {
  console.error("Missing Supabase or Postmark env (.env.local).");
  process.exit(1);
}
if (env.NODE_ENV === "production") {
  console.error("Refusing to run with NODE_ENV=production.");
  process.exit(1);
}

const args = process.argv.slice(2);
const autoReply = args[0] === "--auto-reply";
const [text, customerArg, subjectArg, loginArg] = autoReply ? ["I'm out of the office until Monday."] : args;
if (!text) {
  console.error('Usage: npm run dev:email -- "message text" [customer-email] [subject] [login-email]');
  process.exit(1);
}
const customerEmail = (customerArg ?? "test-customer@example.com").toLowerCase();
const subject = autoReply ? "Out of office" : (subjectArg ?? "Question about my order");
const loginEmail = (loginArg ?? "admin@deskpilot.test").toLowerCase();
const endpoint = env.EMAIL_WEBHOOK_URL ?? "http://localhost:3000/api/email/inbound";

const db = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function inboundHashFor(email: string): Promise<string> {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user) {
      const { data: member } = await db.from("shop_members").select("shop_id").eq("user_id", user.id).limit(1).single();
      if (!member) throw new Error(`${email} has no shop`);
      const { data: shop } = await db.from("shops").select("inbound_hash").eq("id", member.shop_id).single();
      if (!shop) throw new Error("Shop not found");
      return shop.inbound_hash;
    }
    if (data.users.length < 200) throw new Error(`No user ${email}. Run npm run seed:admin first.`);
  }
}

const hash = await inboundHashFor(loginEmail);
const [local, domain] = env.POSTMARK_INBOUND_ADDRESS.split("@");
const to = `${local}+${hash}@${domain}`;
const name = customerEmail.split("@")[0] ?? "Customer";

const payload = {
  FromName: name,
  From: customerEmail,
  FromFull: { Email: customerEmail, Name: name },
  To: to,
  ToFull: [{ Email: to, Name: "", MailboxHash: hash }],
  OriginalRecipient: to,
  MailboxHash: hash,
  Subject: subject,
  MessageID: randomUUID(),
  Date: new Date().toUTCString(),
  TextBody: text,
  HtmlBody: `<p>${text}</p>`,
  StrippedTextReply: "",
  Headers: [
    { Name: "Message-ID", Value: `<${randomUUID()}@example.com>` },
    ...(autoReply ? [{ Name: "Auto-Submitted", Value: "auto-replied" }] : []),
  ],
};

const res = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Basic ${Buffer.from(`postmark:${env.POSTMARK_INBOUND_TOKEN}`).toString("base64")}`,
  },
  body: JSON.stringify(payload),
});
console.log(`${res.status} ${await res.text()}`);
