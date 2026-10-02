-- Task 1.2: signing up with a shop_name creates the shop, owner membership and
-- default automation settings in the same transaction as the auth user.
-- Users created without shop_name (e.g. future team invites) get nothing.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_name text := btrim(new.raw_user_meta_data ->> 'shop_name');
  v_shop_id uuid;
begin
  if v_shop_name is null or v_shop_name = '' then
    return new;
  end if;
  if char_length(v_shop_name) > 80 then
    raise exception 'shop_name too long' using errcode = '22001';
  end if;

  insert into public.shops (name)
  values (v_shop_name)
  returning id into v_shop_id;

  insert into public.shop_members (shop_id, user_id, role)
  values (v_shop_id, new.id, 'owner');

  insert into public.automation_settings (shop_id, category)
  select v_shop_id, c
  from unnest(enum_range(null::public.auto_category)) as c;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
