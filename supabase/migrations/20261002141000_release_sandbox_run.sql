-- A sandbox run whose AI call failed shouldn't count toward the daily limit.
-- Removes the claimed row, but only if it never completed (no token counts).

create or replace function public.release_sandbox_run(p_event_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.usage_events u
  where u.id = p_event_id
    and u.kind in ('sandbox_freetext', 'sandbox_preset')
    and u.input_tokens is null
    and public.is_member(u.shop_id);
end;
$$;

revoke execute on function public.release_sandbox_run(bigint) from public, anon;
grant execute on function public.release_sandbox_run(bigint) to authenticated;
