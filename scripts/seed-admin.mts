// Creates (or resets) a ready-to-use test login with its own shop.
//
//   npm run seed:admin                          -> admin@deskpilot.test, random password
//   npm run seed:admin -- you@example.test "a-long-password" "My Test Store"
//
// Dev only: uses the service-role key from .env.local. Re-running resets the
// password and makes sure the account owns a shop. Run with Node 24+ (native TS).

import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/types/database";

type Category = Database["public"]["Enums"]["auto_category"];
const CATEGORIES: Category[] = [
  "order_status", "product", "shipping", "policy", "general", "refund", "cancel", "address_change",
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (is .env.local present?)");
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run with NODE_ENV=production.");
  process.exit(1);
}

const [emailArg, passwordArg, shopArg] = process.argv.slice(2);
const email = (emailArg ?? "admin@deskpilot.test").trim().toLowerCase();
const password = passwordArg ?? randomBytes(12).toString("base64url");
const shopName = shopArg ?? "AstaDesk Demo Store";

if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const admin = createClient<Database>(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserId(target: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
}

async function ensureShop(userId: string): Promise<string> {
  const { data: existing, error } = await admin
    .from("shop_members")
    .select("shop_id, shops(name)")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing?.shops) return existing.shops.name;

  // Account predates the signup trigger or was made without a shop name.
  const { data: shop, error: shopErr } = await admin
    .from("shops")
    .insert({ name: shopName })
    .select("id, name")
    .single();
  if (shopErr) throw shopErr;
  const { error: memberErr } = await admin
    .from("shop_members")
    .insert({ shop_id: shop.id, user_id: userId, role: "owner" });
  if (memberErr) throw memberErr;
  const { error: settingsErr } = await admin
    .from("automation_settings")
    .insert(CATEGORIES.map((category) => ({ shop_id: shop.id, category })));
  if (settingsErr) throw settingsErr;
  return shop.name;
}

let userId = await findUserId(email);
let action: string;
if (userId) {
  const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
  if (error) throw error;
  action = "Reset password for existing account";
} else {
  // shop_name triggers handle_new_user(), which creates the shop.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { shop_name: shopName },
  });
  if (error) throw error;
  userId = data.user.id;
  action = "Created account";
}
const shop = await ensureShop(userId);

console.log(`\n${action}.\n`);
console.log(`  Log in at: ${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login`);
console.log(`  Email:     ${email}`);
console.log(`  Password:  ${password}`);
console.log(`  Shop:      ${shop}\n`);
