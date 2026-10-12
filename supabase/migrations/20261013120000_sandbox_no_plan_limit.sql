-- Test page (sandbox) limits. Every run calls the live AI, so:
--   - a shop without a paid plan (plan = 'trial', "no plan yet") gets 2 runs in
--     total, ever: scenarios and typed questions both count;
--   - paid shops keep unlimited scenarios + 3 typed questions per UTC day.
-- The plan is read here, never taken from the browser. A failed run is still
-- given back by release_sandbox_run.

create or replace function public.claim_sandbox_run(p_shop_id uuid, p_free_text boolean)
returns table (event_id bigint, remaining int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_daily_limit constant int := 3;
  v_no_plan_limit constant int := 2;
  v_no_plan boolean;
  v_used int;
  v_id bigint;
begin
  if not public.is_member(p_shop_id) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;

  -- Serialise claims per shop so parallel requests can't exceed the limit.
  perform pg_advisory_xact_lock(hashtext('sandbox:' || p_shop_id::text));

  select s.plan = 'trial' into v_no_plan from public.shops s where s.id = p_shop_id;

  if v_no_plan then
    select count(*) into v_used
    from public.usage_events u
    where u.shop_id = p_shop_id
      and u.kind in ('sandbox_freetext', 'sandbox_preset');

    if v_used >= v_no_plan_limit then
      raise exception 'sandbox_limit' using errcode = 'P0001';
    end if;
  else
    select count(*) into v_used
    from public.usage_events u
    where u.shop_id = p_shop_id
      and u.kind = 'sandbox_freetext'
      and u.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';

    if p_free_text and v_used >= v_daily_limit then
      raise exception 'sandbox_limit' using errcode = 'P0001';
    end if;
  end if;

  insert into public.usage_events (shop_id, kind)
  values (p_shop_id, case when p_free_text then 'sandbox_freetext' else 'sandbox_preset' end)
  returning id into v_id;

  return query select v_id,
    case
      when v_no_plan then greatest(v_no_plan_limit - v_used - 1, 0)
      else greatest(v_daily_limit - v_used - (case when p_free_text then 1 else 0 end), 0)
    end;
end;
$$;

revoke execute on function public.claim_sandbox_run(uuid, boolean) from public, anon;
grant execute on function public.claim_sandbox_run(uuid, boolean) to authenticated;
