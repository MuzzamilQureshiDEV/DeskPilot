-- Task 3.7: storefront chat. A chat conversation is found by the shop plus the
-- SHA-256 hash of the visitor's random token (external_thread_id = 'chat:<hash>').
create unique index conversations_chat_thread_key
  on public.conversations (shop_id, external_thread_id)
  where external_thread_id is not null;
