-- Tangent: let the server remove a stored token when an account is disconnected
-- but its row is kept (publishing history references it, so it can't be deleted).

create or replace function public.delete_integration_credential(p_connected_account_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.integration_credentials where connected_account_id = p_connected_account_id;
$$;

revoke all on function public.delete_integration_credential(uuid) from public, anon, authenticated;
grant execute on function public.delete_integration_credential(uuid) to service_role;
