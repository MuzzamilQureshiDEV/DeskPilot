// Dev only: simulate an inbound customer email for the demo shop and queue it
// for the agent via the local Inngest dev server.
//
//   npm run dev:message -- "Where is my order #1001?" [customer@email.com] [login-email]
//
// Needs: npm run dev (with INNGEST_DEV=1) and npm run dev:inngest running.

import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/types/database";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing Supabase env (.env.local).");
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run with NODE_ENV=production.");
  process.exit(1);
}

const [text, customerArg, loginArg] = process.argv.slice(2);
if (!text) {
  console.error('Usage: npm run dev:message -- "message text" [customer-email] [login-email]');
  process.exit(1);
}
const customerEmail = (customerArg ?? "test-customer@example.com").toLowerCase();
const loginEmail = (loginArg ?? "admin@deskpilot.test").toLowerCase();
const inngestUrl = process.env.INNGEST_DEV_URL ?? "http://localhost:8288";

const db = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function shopIdFor(email: string): Promise<string> {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user) {
      const { data: member } = await db.from("shop_members").select("shop_id").eq("user_id", user.id).limit(1).single();
      if (!member) throw new Error(`${email} has no shop`);
      return member.shop_id;
    }
    if (data.users.length < 200) throw new Error(`No user ${email}. Run npm run seed:admin first.`);
  }
}

const shopId = await shopIdFor(loginEmail);

const { data: customer, error: custErr } = await db
  .from("customers")
  .upsert({ shop_id: shopId, email: customerEmail, name: customerEmail.split("@")[0] ?? null }, { onConflict: "shop_id,email" })
  .select("id")
  .single();
if (custErr) throw custErr;

const { data: existing } = await db
  .from("conversations")
  .select("id")
  .eq("shop_id", shopId)
  .eq("customer_id", customer.id)
  .eq("channel", "email")
  .neq("status", "resolved")
  .order("last_message_at", { ascending: false })
  .limit(1)
  .maybeSingle();

let conversationId = existing?.id;
if (!conversationId) {
  const { data: conv, error } = await db
    .from("conversations")
    .insert({ shop_id: shopId, customer_id: customer.id, channel: "email", subject: text.slice(0, 80) })
    .select("id")
    .single();
  if (error) throw error;
  conversationId = conv.id;
}

const { data: message, error: msgErr } = await db
  .from("messages")
  .insert({
    shop_id: shopId,
    conversation_id: conversationId,
    role: "customer",
    status: "received",
    body: text,
    external_message_id: `sim:${randomUUID()}`,
  })
  .select("id")
  .single();
if (msgErr) throw msgErr;
await db
  .from("conversations")
  .update({ status: "open", last_message_at: new Date().toISOString() })
  .eq("id", conversationId)
  .eq("shop_id", shopId);

console.log(`Stored message ${message.id} in conversation ${conversationId}`);

try {
  const res = await fetch(`${inngestUrl}/e/dev`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "deskpilot/message.received",
      data: { shopId, conversationId, messageId: message.id },
    }),
  });
  console.log(res.ok ? `Queued. Watch the run at ${inngestUrl}/runs` : `Inngest dev server replied ${res.status}`);
} catch {
  console.log(`Couldn't reach the Inngest dev server at ${inngestUrl}. Start it with: npm run dev:inngest`);
}
