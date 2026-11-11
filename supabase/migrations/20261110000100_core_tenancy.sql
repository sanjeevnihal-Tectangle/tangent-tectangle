-- Tangent: core tenancy, identity, roles and permissions.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Users (profile mirror of auth.users)
-- ---------------------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_updated_at before update on public.users
  for each row execute function public.set_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Organizations (workspaces) and memberships
-- ---------------------------------------------------------------------------

create type public.member_role as enum ('owner', 'admin', 'marketer', 'designer', 'analyst', 'viewer');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' and slug <> 'demo'),
  name text not null check (char_length(name) between 2 and 120),
  industry text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role public.member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

create trigger memberships_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role public.member_role not null default 'marketer' check (role <> 'owner'),
  token_hash text not null unique,
  invited_by uuid references public.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index invitations_org_idx on public.invitations (organization_id);
create unique index invitations_open_email_idx
  on public.invitations (organization_id, lower(email))
  where accepted_at is null and revoked_at is null;

-- ---------------------------------------------------------------------------
-- Permissions (data-driven; mirrored from src/lib/auth/permissions.ts)
-- ---------------------------------------------------------------------------

create table public.permissions (
  key text primary key,
  description text not null
);

create table public.role_permissions (
  role public.member_role not null,
  permission text not null references public.permissions (key) on delete cascade,
  primary key (role, permission)
);

insert into public.permissions (key, description) values
  ('workspace.manage', 'Edit workspace settings'),
  ('billing.manage', 'Manage subscription and billing'),
  ('members.manage', 'Invite and manage members'),
  ('business_profile.edit', 'Edit the business intelligence profile'),
  ('brand.edit', 'Edit brand profiles and assets'),
  ('ai.run', 'Run AI agents'),
  ('content.create', 'Create content and creatives'),
  ('content.approve', 'Approve content'),
  ('content.publish', 'Approve publishing to external accounts'),
  ('campaigns.manage', 'Create and edit campaigns'),
  ('ads.manage', 'Create and edit ad campaigns'),
  ('ads.approve_spend', 'Approve ad spend and budget changes'),
  ('integrations.manage', 'Connect and disconnect integrations'),
  ('analytics.view', 'View analytics'),
  ('audit.view', 'View audit history');

insert into public.role_permissions (role, permission)
select 'owner', key from public.permissions;

insert into public.role_permissions (role, permission)
select 'admin', key from public.permissions where key <> 'billing.manage';

insert into public.role_permissions (role, permission) values
  ('marketer', 'business_profile.edit'),
  ('marketer', 'brand.edit'),
  ('marketer', 'ai.run'),
  ('marketer', 'content.create'),
  ('marketer', 'content.approve'),
  ('marketer', 'content.publish'),
  ('marketer', 'campaigns.manage'),
  ('marketer', 'ads.manage'),
  ('marketer', 'analytics.view'),
  ('designer', 'brand.edit'),
  ('designer', 'ai.run'),
  ('designer', 'content.create'),
  ('designer', 'analytics.view'),
  ('analyst', 'ai.run'),
  ('analyst', 'analytics.view'),
  ('analyst', 'audit.view'),
  ('viewer', 'analytics.view');

-- ---------------------------------------------------------------------------
-- Authorization helpers used by RLS policies
-- ---------------------------------------------------------------------------

create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.has_org_permission(org uuid, perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role = m.role
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and rp.permission = perm
  );
$$;

-- Creates a workspace and makes the caller its owner (atomic).
create or replace function public.create_organization(p_name text, p_slug text, p_industry text default null)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  org public.organizations;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  insert into public.organizations (slug, name, industry, created_by)
  values (lower(p_slug), p_name, p_industry, uid)
  returning * into org;

  insert into public.memberships (organization_id, user_id, role)
  values (org.id, uid, 'owner');

  return org;
end;
$$;

revoke execute on function public.create_organization(text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

create policy "users: read self and co-members" on public.users
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.memberships mine
      join public.memberships theirs on theirs.organization_id = mine.organization_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = public.users.id
    )
  );

create policy "users: update self" on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "organizations: members read" on public.organizations
  for select to authenticated
  using (deleted_at is null and public.is_org_member(id));

create policy "organizations: managers update" on public.organizations
  for update to authenticated
  using (public.has_org_permission(id, 'workspace.manage'))
  with check (public.has_org_permission(id, 'workspace.manage'));

create policy "memberships: members read" on public.memberships
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy "memberships: managers write" on public.memberships
  for all to authenticated
  using (public.has_org_permission(organization_id, 'members.manage'))
  with check (public.has_org_permission(organization_id, 'members.manage') and role <> 'owner');

create policy "invitations: managers manage" on public.invitations
  for all to authenticated
  using (public.has_org_permission(organization_id, 'members.manage'))
  with check (public.has_org_permission(organization_id, 'members.manage'));

create policy "permissions: readable" on public.permissions
  for select to authenticated using (true);

create policy "role_permissions: readable" on public.role_permissions
  for select to authenticated using (true);
