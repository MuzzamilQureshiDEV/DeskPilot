-- Task 2.1: Shopify expiring offline tokens (1h access token + rotating 90-day
-- refresh token). Token columns get NO grants: browsers can never read them.

alter table public.shops
  add column shopify_refresh_token_enc text,
  add column shopify_token_expires_at timestamptz,
  add column shopify_refresh_expires_at timestamptz;

-- Members can disconnect. This only ever removes access, never sets tokens.
create or replace function public.disconnect_shopify(p_shop_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member(p_shop_id) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;

  update public.shops
  set shopify_domain = null,
      shopify_token_enc = null,
      shopify_refresh_token_enc = null,
      shopify_token_expires_at = null,
      shopify_refresh_expires_at = null,
      shopify_scopes = null,
      shopify_connected_at = null
  where id = p_shop_id;
end;
$$;

-- Connection status for the Store page: no tokens, just what the UI needs.
create or replace function public.shopify_connection_status(p_shop_id uuid)
returns table (
  domain text,
  connected_at timestamptz,
  scopes text,
  needs_reconnect boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.shopify_domain,
    s.shopify_connected_at,
    s.shopify_scopes,
    s.shopify_domain is not null
      and (s.shopify_refresh_expires_at is null or s.shopify_refresh_expires_at <= now())
  from public.shops s
  where s.id = p_shop_id
    and public.is_member(p_shop_id);
$$;

revoke execute on function public.disconnect_shopify(uuid) from public, anon;
revoke execute on function public.shopify_connection_status(uuid) from public, anon;
grant execute on function public.disconnect_shopify(uuid) to authenticated;
grant execute on function public.shopify_connection_status(uuid) to authenticated;
