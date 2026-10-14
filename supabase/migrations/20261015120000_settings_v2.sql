-- Settings v2: chat widget look (editable in AstaDesk), email filters,
-- an email signature, and quick replies (canned responses) for the inbox.
-- All JSON is validated again in the app (zod); the checks here keep the
-- shapes and sizes sane even if a request bypasses the app.

alter table public.shops
  add column widget jsonb not null default '{}'::jsonb
    check (jsonb_typeof(widget) = 'object' and pg_column_size(widget) < 4000),
  add column email_filters jsonb not null default '{}'::jsonb
    check (jsonb_typeof(email_filters) = 'object' and pg_column_size(email_filters) < 8000),
  add column email_signature text not null default ''
    check (length(email_signature) <= 300);

grant select (widget, email_filters, email_signature) on public.shops to authenticated;
grant update (widget, email_filters, email_signature) on public.shops to authenticated;

create table public.quick_replies (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  title text not null check (length(title) between 1 and 80),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on public.quick_replies (shop_id, created_at desc);

alter table public.quick_replies enable row level security;
create policy member_all on public.quick_replies for all to authenticated
  using (public.is_member(shop_id)) with check (public.is_member(shop_id));
grant select, insert, update, delete on public.quick_replies to authenticated;
