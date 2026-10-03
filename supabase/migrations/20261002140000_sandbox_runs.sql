-- Task 1.7: Test page runs. Members can't write usage_events directly, so these
-- security-definer functions record sandbox runs and enforce the daily
-- free-text limit (3 per shop per UTC day) in the database.

create or replace function public.claim_sandbox_run(p_shop_id uuid, p_free_text boolean)
returns table (event_id bigint, remaining int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit constant int := 3;
  v_used int;
  v_id bigint;
begin
  if not public.is_member(p_shop_id) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;

  -- Serialise claims per shop so parallel requests can't exceed the limit.
  perform pg_advisory_xact_lock(hashtext('sandbox:' || p_shop_id::text));

  select count(*) into v_used
  from public.usage_events u
  where u.shop_id = p_shop_id
    and u.kind = 'sandbox_freetext'
    and u.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';

  if p_free_text and v_used >= v_limit then
    raise exception 'sandbox_limit' using errcode = 'P0001';
  end if;

  insert into public.usage_events (shop_id, kind)
  values (p_shop_id, case when p_free_text then 'sandbox_freetext' else 'sandbox_preset' end)
  returning id into v_id;

  return query select v_id, greatest(v_limit - v_used - (case when p_free_text then 1 else 0 end), 0);
end;
$$;

create or replace function public.finish_sandbox_run(
  p_event_id bigint,
  p_model text,
  p_input_tokens int,
  p_output_tokens int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.usage_events u
  set model = left(p_model, 100),
      input_tokens = greatest(p_input_tokens, 0),
      output_tokens = greatest(p_output_tokens, 0)
  where u.id = p_event_id
    and u.kind in ('sandbox_freetext', 'sandbox_preset')
    and u.input_tokens is null
    and public.is_member(u.shop_id);
end;
$$;

revoke execute on function public.claim_sandbox_run(uuid, boolean) from public, anon;
revoke execute on function public.finish_sandbox_run(bigint, text, int, int) from public, anon;
grant execute on function public.claim_sandbox_run(uuid, boolean) to authenticated;
grant execute on function public.finish_sandbox_run(bigint, text, int, int) to authenticated;
