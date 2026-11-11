-- Tangent: integration gateway, approval engine, publishing, ads and audit history.

-- ---------------------------------------------------------------------------
-- Connected accounts. Tokens never live in a browser-readable table.
-- ---------------------------------------------------------------------------

create type public.integration_provider as enum
  ('meta', 'instagram', 'facebook', 'google', 'google_ads', 'youtube', 'search_console',
   'linkedin', 'tiktok', 'x', 'pinterest', 'n8n');

create type public.connection_status as enum ('active', 'needs_reauth', 'revoked', 'error');

create table public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider public.integration_provider not null,
  external_account_id text not null,
  display_name text not null,
  scopes text[] not null default '{}',
  status public.connection_status not null default 'active',
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  connected_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, external_account_id)
);

create index connected_accounts_org_idx on public.connected_accounts (organization_id);
create trigger connected_accounts_updated_at before update on public.connected_accounts
  for each row execute function public.set_updated_at();

-- Encrypted (AES-256-GCM, app-level, key from INTEGRATION_ENCRYPTION_KEY) OAuth tokens.
-- Lives in the private schema: not exposed through the Data API to anon/authenticated.
create table private.integration_credentials (
  connected_account_id uuid primary key references public.connected_accounts (id) on delete cascade,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  key_version smallint not null default 1,
  updated_at timestamptz not null default now()
);

revoke all on private.integration_credentials from public, anon, authenticated;

alter table public.analytics_events
  add constraint analytics_events_connected_account_fk
  foreign key (connected_account_id) references public.connected_accounts (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Approval requests (human-approved execution)
-- ---------------------------------------------------------------------------

create type public.external_action_type as enum
  ('publish_post', 'schedule_post', 'launch_ad_campaign', 'increase_budget',
   'change_targeting', 'send_marketing_message', 'delete_published_content');

create type public.approval_status as enum
  ('pending', 'approved', 'rejected', 'changes_requested', 'superseded',
   'executing', 'executed', 'failed', 'expired');

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  version integer not null default 1 check (version >= 1),
  previous_version_id uuid references public.approval_requests (id) on delete restrict,
  action_type public.external_action_type not null,
  title text not null,
  connected_account_id uuid references public.connected_accounts (id) on delete set null,
  -- Exact content/configuration to execute. Immutable after insert.
  payload jsonb not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  financial_impact jsonb,
  requested_by_agent text,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  requested_by uuid references public.users (id) on delete set null,
  status public.approval_status not null default 'pending',
  decided_by uuid references public.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index approval_requests_org_status_idx on public.approval_requests (organization_id, status, created_at desc);

create trigger approval_requests_updated_at before update on public.approval_requests
  for each row execute function public.set_updated_at();

create or replace function private.approval_payload_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payload is distinct from old.payload
     or new.payload_hash is distinct from old.payload_hash
     or new.action_type is distinct from old.action_type
     or new.connected_account_id is distinct from old.connected_account_id
     or new.financial_impact is distinct from old.financial_impact then
    raise exception 'Approval payloads are immutable; create a new version instead'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger approval_requests_immutable before update on public.approval_requests
  for each row execute function private.approval_payload_immutable();

alter table public.content_items
  add column approval_request_id uuid references public.approval_requests (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Publishing jobs (executed by background workers only after approval)
-- ---------------------------------------------------------------------------

create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');

create table public.publishing_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  connected_account_id uuid not null references public.connected_accounts (id) on delete restrict,
  approval_request_id uuid not null references public.approval_requests (id) on delete restrict,
  status public.job_status not null default 'queued',
  scheduled_for timestamptz not null,
  attempts smallint not null default 0,
  external_post_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index publishing_jobs_due_idx on public.publishing_jobs (status, scheduled_for);
create index publishing_jobs_org_idx on public.publishing_jobs (organization_id);
create trigger publishing_jobs_updated_at before update on public.publishing_jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Advertising (spend is separate from Tangent billing)
-- ---------------------------------------------------------------------------

create table public.ad_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  connected_account_id uuid not null references public.connected_accounts (id) on delete cascade,
  provider public.integration_provider not null,
  external_account_id text not null,
  name text not null,
  currency char(3) not null default 'INR',
  daily_spend_limit_paise bigint check (daily_spend_limit_paise >= 0),
  monthly_spend_limit_paise bigint check (monthly_spend_limit_paise >= 0),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, external_account_id)
);

create trigger ad_accounts_updated_at before update on public.ad_accounts
  for each row execute function public.set_updated_at();

create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ad_account_id uuid not null references public.ad_accounts (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,
  external_campaign_id text,
  name text not null,
  objective text not null,
  status text not null default 'draft',
  daily_budget_paise bigint not null default 0 check (daily_budget_paise >= 0),
  targeting jsonb not null default '{}'::jsonb,
  structure jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ad_campaigns_org_idx on public.ad_campaigns (organization_id);
create trigger ad_campaigns_updated_at before update on public.ad_campaigns
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Immutable audit history
-- ---------------------------------------------------------------------------

create type public.actor_type as enum ('user', 'agent', 'system');

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_type public.actor_type not null,
  actor_id text,
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_org_recent_idx on public.audit_logs (organization_id, created_at desc);

create or replace function private.audit_logs_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;

create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function private.audit_logs_append_only();

-- Members write audit events through this function; actor is always the caller.
create or replace function public.log_audit_event(
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_summary text,
  p_metadata jsonb default '{}'::jsonb,
  p_actor_type public.actor_type default 'user',
  p_agent_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'Not a member of this workspace' using errcode = '42501';
  end if;

  insert into public.audit_logs (organization_id, actor_type, actor_id, action, entity_type, entity_id, summary, metadata)
  values (
    p_organization_id,
    p_actor_type,
    case when p_actor_type = 'agent' then p_agent_id else (select auth.uid())::text end,
    p_action,
    p_entity_type,
    p_entity_id,
    p_summary,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('initiated_by', (select auth.uid()))
  );
end;
$$;

revoke execute on function public.log_audit_event(uuid, text, text, text, text, jsonb, public.actor_type, text) from public, anon;
grant execute on function public.log_audit_event(uuid, text, text, text, text, jsonb, public.actor_type, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.connected_accounts enable row level security;
alter table public.approval_requests enable row level security;
alter table public.publishing_jobs enable row level security;
alter table public.ad_accounts enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.audit_logs enable row level security;

create policy "connected_accounts: members read" on public.connected_accounts
  for select to authenticated using (public.is_org_member(organization_id));
-- Inserts/updates happen in the OAuth callback via the Integration Gateway (service role).

create policy "approval_requests: members read" on public.approval_requests
  for select to authenticated using (public.is_org_member(organization_id));
create policy "approval_requests: ai users create" on public.approval_requests
  for insert to authenticated
  with check (public.has_org_permission(organization_id, 'ai.run') and status = 'pending');
-- Decisions require the permission matching the action's risk.
create policy "approval_requests: approvers decide" on public.approval_requests
  for update to authenticated
  using (
    case
      when action_type in ('launch_ad_campaign', 'increase_budget', 'change_targeting')
        then public.has_org_permission(organization_id, 'ads.approve_spend')
      else public.has_org_permission(organization_id, 'content.publish')
    end
  )
  with check (status in ('pending', 'approved', 'rejected', 'changes_requested', 'superseded'));

create policy "publishing_jobs: members read" on public.publishing_jobs
  for select to authenticated using (public.is_org_member(organization_id));

create policy "ad_accounts: members read" on public.ad_accounts
  for select to authenticated using (public.is_org_member(organization_id));
create policy "ad_accounts: spend approvers set limits" on public.ad_accounts
  for update to authenticated
  using (public.has_org_permission(organization_id, 'ads.approve_spend'))
  with check (public.has_org_permission(organization_id, 'ads.approve_spend'));

create policy "ad_campaigns: members read" on public.ad_campaigns
  for select to authenticated using (public.is_org_member(organization_id));
create policy "ad_campaigns: managers draft" on public.ad_campaigns
  for insert to authenticated
  with check (public.has_org_permission(organization_id, 'ads.manage') and status = 'draft');
create policy "ad_campaigns: managers edit drafts" on public.ad_campaigns
  for update to authenticated
  using (public.has_org_permission(organization_id, 'ads.manage') and status = 'draft')
  with check (public.has_org_permission(organization_id, 'ads.manage') and status = 'draft');

create policy "audit_logs: auditors read" on public.audit_logs
  for select to authenticated using (public.has_org_permission(organization_id, 'audit.view'));
