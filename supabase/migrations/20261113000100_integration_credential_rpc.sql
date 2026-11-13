-- Tangent: server-only access to the encrypted credential vault.
--
-- private.integration_credentials is deliberately not exposed through the Data
-- API, so the server could not read or write it with the service-role key and
-- connections lost their tokens. These SECURITY DEFINER functions are the only
-- way in, and only the service role may call them.

-- Providers offered on the Integrations page that the enum didn't list; saving
-- them failed and the app silently kept them in server memory only.
alter type public.integration_provider add value if not exists 'openai';
alter type public.integration_provider add value if not exists 'anthropic';
alter type public.integration_provider add value if not exists 'razorpay';

create or replace function public.store_integration_credential(
  p_connected_account_id uuid,
  p_access_token_ciphertext text,
  p_refresh_token_ciphertext text,
  p_key_version smallint
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.integration_credentials
    (connected_account_id, access_token_ciphertext, refresh_token_ciphertext, key_version, updated_at)
  values
    (p_connected_account_id, p_access_token_ciphertext, p_refresh_token_ciphertext, p_key_version, now())
  on conflict (connected_account_id) do update
    set access_token_ciphertext = excluded.access_token_ciphertext,
        refresh_token_ciphertext = excluded.refresh_token_ciphertext,
        key_version = excluded.key_version,
        updated_at = now();
$$;

create or replace function public.get_integration_credential(p_connected_account_id uuid)
returns table (access_token_ciphertext text, refresh_token_ciphertext text, key_version smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.access_token_ciphertext, c.refresh_token_ciphertext, c.key_version
  from private.integration_credentials c
  where c.connected_account_id = p_connected_account_id;
$$;

revoke all on function public.store_integration_credential(uuid, text, text, smallint) from public, anon, authenticated;
revoke all on function public.get_integration_credential(uuid) from public, anon, authenticated;
grant execute on function public.store_integration_credential(uuid, text, text, smallint) to service_role;
grant execute on function public.get_integration_credential(uuid) to service_role;
