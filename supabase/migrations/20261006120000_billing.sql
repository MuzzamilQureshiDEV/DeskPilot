-- Task 3.4: Stripe subscriptions. The plan changes only via the verified Stripe
-- webhook (service role); browsers can read billing state but never write it.

alter table public.shops
  add column subscription_status text,
  add column current_period_start timestamptz,
  add column current_period_end timestamptz,
  add column cancel_at_period_end boolean not null default false;

create unique index shops_stripe_customer_id_key on public.shops (stripe_customer_id) where stripe_customer_id is not null;

grant select (subscription_status, current_period_start, current_period_end, cancel_at_period_end)
  on public.shops to authenticated;

-- Webhook idempotency: each Stripe event id is processed once.
create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
-- No grants and no policies: service role only.

-- Store the shop's Stripe customer id from a signed-in owner's checkout action,
-- without the service role. Only the owner, and only once.
create or replace function public.link_stripe_customer(p_shop_id uuid, p_customer_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.shop_members m
    where m.shop_id = p_shop_id and m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception 'only the store owner can manage billing' using errcode = '42501';
  end if;
  if p_customer_id !~ '^cus_[A-Za-z0-9]+$' then
    raise exception 'invalid customer id' using errcode = '22023';
  end if;

  update public.shops set stripe_customer_id = p_customer_id
  where id = p_shop_id and stripe_customer_id is null;
  if not found then
    raise exception 'billing is already linked' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.link_stripe_customer(uuid, text) from public, anon;
grant execute on function public.link_stripe_customer(uuid, text) to authenticated;
