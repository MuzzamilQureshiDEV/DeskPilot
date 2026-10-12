-- PayPal subscriptions (alongside Stripe). The plan still changes only via a
-- verified webhook (service role); browsers can read billing state only.

alter table public.shops
  add column billing_provider text check (billing_provider in ('stripe', 'paypal')),
  add column paypal_subscription_id text unique;

grant select (billing_provider, paypal_subscription_id) on public.shops to authenticated;

-- Webhook idempotency for providers other than Stripe (Stripe keeps stripe_events).
create table public.payment_events (
  provider text not null,
  event_id text not null,
  type text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);
alter table public.payment_events enable row level security;
-- No grants and no policies: service role only.
