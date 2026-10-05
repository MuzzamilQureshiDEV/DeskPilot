-- Task 3.3: email channel (Postmark inbound forwarding + outbound replies).

-- Per-shop forwarding address: <inbound-local>+<inbound_hash>@inbound.postmarkapp.com.
-- Volatile default → every existing shop gets its own value.
alter table public.shops
  add column inbound_hash text not null unique default encode(extensions.gen_random_bytes(6), 'hex');
grant select (inbound_hash) on public.shops to authenticated;

-- Replies come back to …+<shop hash>.<reply_token>@…, which threads exactly.
alter table public.conversations
  add column reply_token text not null unique default encode(extensions.gen_random_bytes(8), 'hex');

-- RFC Message-ID for threading by In-Reply-To/References, and delivery status of outbound email.
alter table public.messages
  add column rfc_message_id text,
  add column delivered_at timestamptz,
  add column delivery_error text;
create index on public.messages (shop_id, rfc_message_id) where rfc_message_id is not null;

-- Rate check for loop protection: recent customer messages per sender.
create index on public.customers (shop_id, email);
