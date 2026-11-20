-- Credential storage goes through SECURITY DEFINER RPCs so tokens work even when
-- the `private` schema is not exposed in Supabase API settings (PostgREST).

alter type public.integration_provider add value if not exists 'msg91';
alter type public.integration_provider add value if not exists 'resend';

create schema if not exists private;

create table if not exists private.integration_credentials (
  connected_account_id uuid primary key references public.connected_accounts (id) on delete cascade,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  key_version smallint not null default 1,
  updated_at timestamptz not null default now()
);

-- Locked down: no grants to anon/authenticated; RLS on with zero policies = deny-by-default.
-- App access is only via SECURITY DEFINER RPCs executed with the service role.
revoke all on private.integration_credentials from public, anon, authenticated;
alter table private.integration_credentials enable row level security;

create or replace function public.store_integration_credential(
  p_connected_account_id uuid,
  p_access_token_ciphertext text,
  p_refresh_token_ciphertext text default null,
  p_key_version smallint default 1
)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if p_connected_account_id is null or p_access_token_ciphertext is null or length(trim(p_access_token_ciphertext)) = 0 then
    raise exception 'connected_account_id and access_token_ciphertext are required';
  end if;

  insert into private.integration_credentials (
    connected_account_id,
    access_token_ciphertext,
    refresh_token_ciphertext,
    key_version,
    updated_at
  )
  values (
    p_connected_account_id,
    p_access_token_ciphertext,
    p_refresh_token_ciphertext,
    coalesce(p_key_version, 1),
    now()
  )
  on conflict (connected_account_id) do update
  set
    access_token_ciphertext = excluded.access_token_ciphertext,
    refresh_token_ciphertext = excluded.refresh_token_ciphertext,
    key_version = excluded.key_version,
    updated_at = now();
end;
$$;

create or replace function public.get_integration_credential(p_connected_account_id uuid)
returns table (
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  key_version smallint
)
language plpgsql
security definer
set search_path = private, public
as $$
begin
  return query
  select
    c.access_token_ciphertext,
    c.refresh_token_ciphertext,
    c.key_version
  from private.integration_credentials c
  where c.connected_account_id = p_connected_account_id;
end;
$$;

revoke all on function public.store_integration_credential(uuid, text, text, smallint) from public, anon, authenticated;
revoke all on function public.get_integration_credential(uuid) from public, anon, authenticated;
grant execute on function public.store_integration_credential(uuid, text, text, smallint) to service_role;
grant execute on function public.get_integration_credential(uuid) to service_role;
