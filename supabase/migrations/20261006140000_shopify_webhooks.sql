-- Task 3.5: Shopify app/uninstalled + mandatory privacy (GDPR) webhooks.

-- When the merchant uninstalled DeskPilot in Shopify (cleared on reconnect).
alter table public.shops add column shopify_uninstalled_at timestamptz;
grant select (shopify_uninstalled_at) on public.shops to authenticated;

-- Webhook dedupe on X-Shopify-Webhook-Id (Shopify retries and may deliver twice).
create table public.shopify_webhook_events (
  webhook_id text primary key,
  topic text not null,
  shop_domain text,
  received_at timestamptz not null default now()
);
alter table public.shopify_webhook_events enable row level security;
-- No grants and no policies: service role only.

-- Privacy request log: Shopify's compliance requests and what we did about them.
create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops on delete cascade,
  shop_domain text not null,
  kind text not null check (kind in ('data_request', 'customer_redact', 'shop_redact')),
  shopify_customer_id text,
  customer_email text,
  status text not null default 'received' check (status in ('received', 'completed', 'no_data')),
  detail jsonb not null default '{}'::jsonb,   -- counts only, never message text
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index on public.privacy_requests (shop_id, created_at desc);
alter table public.privacy_requests enable row level security;
grant select on public.privacy_requests to authenticated;
create policy "members read their privacy requests" on public.privacy_requests
  for select using (shop_id is not null and public.is_member(shop_id));

-- A member marks a data request as handled (the only browser write).
create or replace function public.complete_privacy_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.privacy_requests r
  set status = 'completed', completed_at = now()
  where r.id = p_id
    and r.kind = 'data_request'
    and r.status = 'received'
    and r.shop_id is not null
    and public.is_member(r.shop_id);
  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.complete_privacy_request(uuid) from public, anon;
grant execute on function public.complete_privacy_request(uuid) to authenticated;

-- Connection status now also says whether the app was uninstalled in Shopify.
drop function public.shopify_connection_status(uuid);
create function public.shopify_connection_status(p_shop_id uuid)
returns table (
  domain text,
  connected_at timestamptz,
  scopes text,
  needs_reconnect boolean,
  uninstalled_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.shopify_domain,
    s.shopify_connected_at,
    s.shopify_scopes,
    s.shopify_domain is not null
      and (s.shopify_refresh_expires_at is null or s.shopify_refresh_expires_at <= now()),
    s.shopify_uninstalled_at
  from public.shops s
  where s.id = p_shop_id
    and public.is_member(p_shop_id);
$$;
revoke execute on function public.shopify_connection_status(uuid) from public, anon;
grant execute on function public.shopify_connection_status(uuid) to authenticated;
