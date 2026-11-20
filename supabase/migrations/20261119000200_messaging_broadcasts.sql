-- Tangent Messaging M2: bulk broadcasts + per-message events (idempotent)

do $$ begin
  create type public.broadcast_status as enum (
    'draft', 'pending_approval', 'approved', 'queued', 'sending',
    'completed', 'failed', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.message_event_status as enum (
    'queued', 'sent', 'delivered', 'read', 'failed', 'skipped', 'undeliverable'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.message_broadcasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  channel public.message_channel not null default 'whatsapp',
  product_id uuid references public.business_products (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  template_id uuid not null references public.message_templates (id) on delete restrict,
  audience_id uuid not null references public.audiences (id) on delete restrict,
  connected_account_id uuid references public.connected_accounts (id) on delete set null,
  variable_mapping jsonb not null default '{}'::jsonb,
  contact_snapshot_ids uuid[] not null default '{}',
  scheduled_for timestamptz,
  status public.broadcast_status not null default 'draft',
  approval_request_id uuid references public.approval_requests (id) on delete set null,
  stats jsonb not null default '{"queued":0,"sent":0,"delivered":0,"read":0,"failed":0,"skipped":0}'::jsonb,
  last_error text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists message_broadcasts_org_status_idx
  on public.message_broadcasts (organization_id, status)
  where deleted_at is null;

drop trigger if exists message_broadcasts_updated_at on public.message_broadcasts;
create trigger message_broadcasts_updated_at before update on public.message_broadcasts
  for each row execute function public.set_updated_at();

create table if not exists public.message_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  broadcast_id uuid not null references public.message_broadcasts (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  provider_message_id text,
  status public.message_event_status not null default 'queued',
  error_code text,
  error_message text,
  occurred_at timestamptz not null default now()
);

create index if not exists message_events_broadcast_idx
  on public.message_events (broadcast_id, status);

create index if not exists message_events_provider_idx
  on public.message_events (provider_message_id)
  where provider_message_id is not null;

alter table public.message_broadcasts enable row level security;
alter table public.message_events enable row level security;

drop policy if exists "message_broadcasts: members read" on public.message_broadcasts;
create policy "message_broadcasts: members read" on public.message_broadcasts
  for select to authenticated
  using (deleted_at is null and public.is_org_member(organization_id));
drop policy if exists "message_broadcasts: managers write" on public.message_broadcasts;
create policy "message_broadcasts: managers write" on public.message_broadcasts
  for all to authenticated
  using (public.has_org_permission(organization_id, 'campaigns.manage'))
  with check (public.has_org_permission(organization_id, 'campaigns.manage'));

drop policy if exists "message_events: members read" on public.message_events;
create policy "message_events: members read" on public.message_events
  for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "message_events: managers write" on public.message_events;
create policy "message_events: managers write" on public.message_events
  for all to authenticated
  using (public.has_org_permission(organization_id, 'campaigns.manage'))
  with check (public.has_org_permission(organization_id, 'campaigns.manage'));
