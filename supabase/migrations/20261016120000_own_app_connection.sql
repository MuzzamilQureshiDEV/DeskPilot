-- Stores can connect with their own private Shopify app (client credentials
-- grant) instead of installing the AstaDesk app. The client secret is kept
-- encrypted and is never readable from the browser. widget_key is the public
-- id used by the copy-paste chat embed.
--
-- For own-app stores there is no refresh token: shopify_refresh_expires_at is
-- set far in the future and moved to now() when the credentials stop working,
-- so "needs reconnect" keeps meaning the same thing for both kinds.

alter table public.shops
  add column shopify_auth text not null default 'oauth' check (shopify_auth in ('oauth', 'own_app')),
  add column shopify_client_id text check (length(shopify_client_id) <= 200),
  add column shopify_client_secret_enc text,
  add column widget_key text not null unique
    default replace(replace(encode(extensions.gen_random_bytes(18), 'base64'), '+', '-'), '/', '_');

grant select (shopify_auth, widget_key) on public.shops to authenticated;

drop function public.shopify_connection_status(uuid);
create function public.shopify_connection_status(p_shop_id uuid)
returns table (
  domain text,
  connected_at timestamptz,
  scopes text,
  needs_reconnect boolean,
  uninstalled_at timestamptz,
  auth text
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
      and (s.shopify_refresh_expires_at is null or s.shopify_refresh_expires_at <= now()),
    s.shopify_uninstalled_at,
    s.shopify_auth
  from public.shops s
  where s.id = p_shop_id
    and public.is_member(p_shop_id);
$$;
revoke execute on function public.shopify_connection_status(uuid) from public, anon;
grant execute on function public.shopify_connection_status(uuid) to authenticated;

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
      shopify_connected_at = null,
      shopify_auth = 'oauth',
      shopify_client_id = null,
      shopify_client_secret_enc = null
  where id = p_shop_id;
end;
$$;
revoke execute on function public.disconnect_shopify(uuid) from public, anon;
grant execute on function public.disconnect_shopify(uuid) to authenticated;
