-- Task 3.1: merchants approve or reject proposed money actions. Browsers keep
-- select-only on action_requests; these functions are the only way a person
-- decides, and they record who did (decided_by), which the existing
-- human_decision_required check requires for approved/executing/executed.

alter table public.action_requests
  add column options jsonb not null default '{}'::jsonb;

create or replace function public.approve_action_request(p_id uuid, p_options jsonb)
returns table (action_shop_id uuid, action_conversation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid;
begin
  select a.shop_id into v_shop from public.action_requests a where a.id = p_id;
  if v_shop is null or not public.is_member(v_shop) then
    raise exception 'action request not found' using errcode = 'P0002';
  end if;

  -- Only pending requests can be approved: a second click returns no row.
  return query
  update public.action_requests a
  set status = 'approved',
      decided_by = (select auth.uid()),
      decided_at = now(),
      -- Only these two booleans are accepted; anything else falls back to defaults.
      options = jsonb_build_object(
        'notify_customer', coalesce(p_options -> 'notify_customer' = 'true'::jsonb, true),
        'restock', coalesce(p_options -> 'restock' = 'true'::jsonb, false)
      )
  where a.id = p_id and a.status = 'pending'
  returning a.shop_id, a.conversation_id;
end;
$$;

create or replace function public.reject_action_request(p_id uuid)
returns table (action_shop_id uuid, action_conversation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid;
begin
  select a.shop_id into v_shop from public.action_requests a where a.id = p_id;
  if v_shop is null or not public.is_member(v_shop) then
    raise exception 'action request not found' using errcode = 'P0002';
  end if;

  return query
  update public.action_requests a
  set status = 'rejected', decided_by = (select auth.uid()), decided_at = now()
  where a.id = p_id and a.status = 'pending'
  returning a.shop_id, a.conversation_id;
end;
$$;

revoke execute on function public.approve_action_request(uuid, jsonb) from public, anon;
revoke execute on function public.reject_action_request(uuid) from public, anon;
grant execute on function public.approve_action_request(uuid, jsonb) to authenticated;
grant execute on function public.reject_action_request(uuid) to authenticated;
