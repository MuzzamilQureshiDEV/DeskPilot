-- The AI agent is always "Ava" (product decision, 2026-10-10). Existing custom
-- names are reset, browsers can no longer change it, and a check constraint
-- guarantees it even for the service role.

update public.shops set agent_name = 'Ava' where agent_name <> 'Ava';

revoke update (agent_name) on public.shops from authenticated;

alter table public.shops
  add constraint agent_name_is_ava check (agent_name = 'Ava');
