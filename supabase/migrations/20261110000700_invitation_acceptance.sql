-- Tangent: accept a workspace invitation with a single-use token.
-- Only the SHA-256 hash of the token is stored; the raw token lives in the invite link.

create or replace function public.accept_invitation(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  caller_email text;
  invite public.invitations;
  org_slug text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into invite
  from public.invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if invite.id is null or invite.accepted_at is not null or invite.revoked_at is not null then
    raise exception 'This invitation is invalid or has already been used' using errcode = 'P0002';
  end if;
  if invite.expires_at < now() then
    raise exception 'This invitation has expired' using errcode = 'P0002';
  end if;

  select email into caller_email from public.users where id = uid;
  if lower(caller_email) <> lower(invite.email) then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;

  insert into public.memberships (organization_id, user_id, role)
  values (invite.organization_id, uid, invite.role)
  on conflict (organization_id, user_id) do nothing;

  update public.invitations set accepted_at = now() where id = invite.id;

  select slug into org_slug from public.organizations where id = invite.organization_id;
  return org_slug;
end;
$$;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
