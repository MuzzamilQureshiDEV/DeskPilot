-- Email the store's team when Ava needs a person (escalation) or an approval.
-- Two switches per shop (on by default), and a dedupe log so each alert is
-- sent once even when background jobs retry.

alter table public.shops
  add column notify_escalations boolean not null default true,
  add column notify_approvals boolean not null default true;

grant select (notify_escalations, notify_approvals) on public.shops to authenticated;
grant update (notify_escalations, notify_approvals) on public.shops to authenticated;

create table public.team_alerts (
  shop_id uuid not null references public.shops (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  kind text not null check (kind in ('escalated', 'approval')),
  key text not null check (length(key) between 1 and 200),
  sent_at timestamptz not null default now(),
  primary key (shop_id, conversation_id, kind, key)
);

-- Service role only: no browser access at all.
alter table public.team_alerts enable row level security;
revoke all on public.team_alerts from anon, authenticated;
