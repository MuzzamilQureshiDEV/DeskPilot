-- DeskPilot initial schema (CLAUDE.md §6) with RLS on every table.
-- Hardening beyond the spec is marked "HARDENING" and logged in CLAUDE.md.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.channel as enum ('email','chat','sandbox');
create type public.conv_status as enum ('open','ai_drafted','awaiting_approval','escalated','human','resolved');
create type public.msg_role as enum ('customer','ai','human','system');
create type public.msg_status as enum ('draft','sent','rejected','received');
create type public.action_type as enum ('refund','cancel','address_change');
create type public.action_status as enum ('pending','approved','rejected','executing','executed','failed');
create type public.knowledge_kind as enum ('policy','faq','brand','example_reply');
create type public.auto_category as enum ('order_status','product','shipping','policy','general','refund','cancel','address_change');
create type public.auto_mode as enum ('off','copilot','autopilot');
create type public.plan_tier as enum ('trial','starter','growth','scale');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  shopify_domain text unique,
  shopify_token_enc text,
  shopify_scopes text,
  shopify_connected_at timestamptz,
  inbound_email text unique,           -- e.g. <slug>@in.<ourdomain>
  support_from_email text,             -- merchant's support address for reply-to
  agent_name text not null default 'Ava',
  agent_tone text not null default 'friendly',
  plan public.plan_tier not null default 'trial',
  trial_ends_at timestamptz default now() + interval '14 days',
  stripe_customer_id text,
  stripe_subscription_id text,
  setup jsonb not null default '{}'::jsonb,   -- checklist flags
  created_at timestamptz default now()
);

create table public.shop_members (
  shop_id uuid references public.shops on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null default 'owner',
  primary key (shop_id, user_id)
);
create index on public.shop_members (user_id);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  email text,
  name text,
  shopify_customer_id text,
  unique (shop_id, email),
  unique (id, shop_id)                 -- HARDENING: target for composite FKs
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  customer_id uuid,
  channel public.channel not null,
  subject text,
  status public.conv_status not null default 'open',
  sentiment text,                      -- positive | neutral | negative | angry
  tags text[] not null default '{}',
  ai_paused boolean not null default false,
  external_thread_id text,
  last_message_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (id, shop_id),                -- HARDENING: target for composite FKs
  -- HARDENING: customer must belong to the same shop
  foreign key (customer_id, shop_id) references public.customers (id, shop_id)
    on delete set null (customer_id)
);
create index on public.conversations (shop_id, last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  conversation_id uuid not null,
  role public.msg_role not null,
  status public.msg_status not null,
  body text not null,
  confidence numeric(4,3),
  reasoning text,
  external_message_id text,
  created_at timestamptz default now(),
  unique (shop_id, external_message_id),
  -- HARDENING: conversation must belong to the same shop
  foreign key (conversation_id, shop_id) references public.conversations (id, shop_id)
    on delete cascade
);
create index on public.messages (conversation_id, created_at);

create table public.action_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  conversation_id uuid not null,
  type public.action_type not null,
  payload jsonb not null,              -- order id, amount, line items, new address...
  ai_reasoning text,
  status public.action_status not null default 'pending',
  decided_by uuid references auth.users,
  decided_at timestamptz,
  executed_at timestamptz,
  result jsonb,
  error text,
  created_at timestamptz default now(),
  -- executed actions must have a human decision
  constraint human_decision_required check (
    status not in ('approved','executing','executed') or decided_by is not null
  ),
  -- HARDENING: conversation must belong to the same shop
  foreign key (conversation_id, shop_id) references public.conversations (id, shop_id)
    on delete cascade
);
create index on public.action_requests (shop_id, status, created_at desc);

create table public.knowledge (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  kind public.knowledge_kind not null,
  title text not null,
  content text not null,
  updated_at timestamptz default now()
);
create index on public.knowledge (shop_id, kind);

create table public.automation_settings (
  shop_id uuid references public.shops on delete cascade,
  category public.auto_category,
  mode public.auto_mode not null default 'copilot',
  confidence_threshold numeric(4,3) not null default 0.85,
  primary key (shop_id, category),
  -- money categories can never be autopilot
  constraint no_autopilot_money check (
    not (category in ('refund','cancel','address_change') and mode = 'autopilot')
  )
);

create table public.usage_events (
  id bigserial primary key,
  shop_id uuid not null references public.shops on delete cascade,
  conversation_id uuid,
  kind text not null,                  -- 'ai_reply' | 'classification'
  model text,
  input_tokens int,
  output_tokens int,
  created_at timestamptz default now()
);
create index on public.usage_events (shop_id, created_at);

create table public.filtered_emails (
  id bigserial primary key,
  shop_id uuid not null references public.shops on delete cascade,
  from_email text,
  subject text,
  reason text,
  created_at timestamptz default now()
);
create index on public.filtered_emails (shop_id, created_at desc);

create table public.feedback (
  id bigserial primary key,
  shop_id uuid not null references public.shops on delete cascade,
  conversation_id uuid,
  rating int check (rating between 1 and 5),
  comment text,
  created_at timestamptz default now(),
  -- HARDENING: conversation must belong to the same shop
  foreign key (conversation_id, shop_id) references public.conversations (id, shop_id)
    on delete cascade
);
create index on public.feedback (shop_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS helper
-- ---------------------------------------------------------------------------
create or replace function public.is_member(s uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.shop_members
    where shop_id = s and user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges. Supabase grants everything to anon/authenticated by default;
-- start from nothing and grant only what each table needs.
-- service_role bypasses RLS and keeps full access (jobs + webhooks only).
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Future migrations must grant explicitly too.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, public;

-- shops: never expose shopify_token_enc to the browser; members edit only safe columns.
grant select (
  id, name, shopify_domain, shopify_scopes, shopify_connected_at, inbound_email,
  support_from_email, agent_name, agent_tone, plan, trial_ends_at,
  stripe_customer_id, stripe_subscription_id, setup, created_at
) on public.shops to authenticated;
grant update (name, agent_name, agent_tone, support_from_email, setup)
  on public.shops to authenticated;

grant select on public.shop_members to authenticated;

-- Member-editable tenant data.
grant select, insert, update, delete on
  public.customers, public.conversations, public.messages,
  public.knowledge, public.automation_settings, public.feedback
  to authenticated;
grant usage on sequence public.feedback_id_seq to authenticated;

-- Read-only for members. Written by background jobs / approve endpoint only.
grant select on public.action_requests, public.usage_events, public.filtered_emails
  to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.shops               enable row level security;
alter table public.shop_members        enable row level security;
alter table public.customers           enable row level security;
alter table public.conversations       enable row level security;
alter table public.messages            enable row level security;
alter table public.action_requests     enable row level security;
alter table public.knowledge           enable row level security;
alter table public.automation_settings enable row level security;
alter table public.usage_events        enable row level security;
alter table public.filtered_emails     enable row level security;
alter table public.feedback            enable row level security;

create policy member_select on public.shops for select to authenticated
  using (public.is_member(id));
create policy member_update on public.shops for update to authenticated
  using (public.is_member(id)) with check (public.is_member(id));

create policy own_rows on public.shop_members for select to authenticated
  using (user_id = (select auth.uid()));

create policy member_all on public.customers for all to authenticated
  using (public.is_member(shop_id)) with check (public.is_member(shop_id));
create policy member_all on public.conversations for all to authenticated
  using (public.is_member(shop_id)) with check (public.is_member(shop_id));
create policy member_all on public.messages for all to authenticated
  using (public.is_member(shop_id)) with check (public.is_member(shop_id));
create policy member_all on public.knowledge for all to authenticated
  using (public.is_member(shop_id)) with check (public.is_member(shop_id));
create policy member_all on public.automation_settings for all to authenticated
  using (public.is_member(shop_id)) with check (public.is_member(shop_id));
create policy member_all on public.feedback for all to authenticated
  using (public.is_member(shop_id)) with check (public.is_member(shop_id));

create policy member_select on public.action_requests for select to authenticated
  using (public.is_member(shop_id));
create policy member_select on public.usage_events for select to authenticated
  using (public.is_member(shop_id));
create policy member_select on public.filtered_emails for select to authenticated
  using (public.is_member(shop_id));
