-- Tangent: campaigns, content, media, publishing, ads and analytics.

create type public.campaign_status as enum
  ('draft', 'planning', 'production', 'review', 'approved', 'active', 'completed');

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_profile_id uuid references public.brand_profiles (id) on delete set null,
  name text not null check (char_length(name) between 2 and 160),
  objective text not null,
  audience text not null default '',
  channels text[] not null default '{}',
  start_date date,
  end_date date,
  budget_paise bigint not null default 0 check (budget_paise >= 0),
  landing_page_url text,
  conversion_goal text,
  kpis jsonb not null default '[]'::jsonb,
  status public.campaign_status not null default 'draft',
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index campaigns_org_status_idx on public.campaigns (organization_id, status) where deleted_at is null;
create trigger campaigns_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();

create type public.media_kind as enum ('image', 'video', 'audio', 'document');
create type public.media_source as enum ('upload', 'ai_generated', 'imported');

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind public.media_kind not null,
  source public.media_source not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  width integer,
  height integer,
  duration_ms integer,
  -- Provider, model, prompt and parameters for AI-generated media.
  generation jsonb,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index media_assets_org_recent_idx on public.media_assets (organization_id, created_at desc) where deleted_at is null;

create type public.content_status as enum
  ('draft', 'in_review', 'approved', 'scheduled', 'published', 'failed');

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,
  brand_profile_id uuid references public.brand_profiles (id) on delete set null,
  platform text not null,
  format text not null,
  title text not null,
  caption text not null default '',
  hashtags text[] not null default '{}',
  media_asset_ids uuid[] not null default '{}',
  scheduled_for timestamptz,
  status public.content_status not null default 'draft',
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index content_items_org_schedule_idx on public.content_items (organization_id, scheduled_for) where deleted_at is null;
create index content_items_campaign_idx on public.content_items (campaign_id);
create trigger content_items_updated_at before update on public.content_items
  for each row execute function public.set_updated_at();

create type public.analytics_granularity as enum ('day', 'week', 'month', 'lifetime');

create table public.analytics_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source text not null,
  connected_account_id uuid,
  entity_type text not null,
  entity_id text,
  metric text not null,
  value numeric not null,
  occurred_on date not null,
  granularity public.analytics_granularity not null default 'day',
  -- true for modelled/estimated values (e.g. AI or keyword-volume estimates)
  is_estimate boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now()
);

create index analytics_events_org_date_idx on public.analytics_events (organization_id, occurred_on desc);
create index analytics_events_metric_idx on public.analytics_events (organization_id, metric, occurred_on desc);

alter table public.campaigns enable row level security;
alter table public.media_assets enable row level security;
alter table public.content_items enable row level security;
alter table public.analytics_events enable row level security;

create policy "campaigns: members read" on public.campaigns
  for select to authenticated using (deleted_at is null and public.is_org_member(organization_id));
create policy "campaigns: managers insert" on public.campaigns
  for insert to authenticated with check (public.has_org_permission(organization_id, 'campaigns.manage'));
create policy "campaigns: managers update" on public.campaigns
  for update to authenticated
  using (public.has_org_permission(organization_id, 'campaigns.manage'))
  with check (public.has_org_permission(organization_id, 'campaigns.manage'));

create policy "media_assets: members read" on public.media_assets
  for select to authenticated using (deleted_at is null and public.is_org_member(organization_id));
create policy "media_assets: creators insert" on public.media_assets
  for insert to authenticated with check (public.has_org_permission(organization_id, 'content.create'));
create policy "media_assets: creators update" on public.media_assets
  for update to authenticated
  using (public.has_org_permission(organization_id, 'content.create'))
  with check (public.has_org_permission(organization_id, 'content.create'));

create policy "content_items: members read" on public.content_items
  for select to authenticated using (deleted_at is null and public.is_org_member(organization_id));
create policy "content_items: creators insert" on public.content_items
  for insert to authenticated with check (public.has_org_permission(organization_id, 'content.create'));
-- Status changes to approved/scheduled/published happen via the approval engine (service role).
create policy "content_items: creators update drafts" on public.content_items
  for update to authenticated
  using (public.has_org_permission(organization_id, 'content.create') and status in ('draft', 'in_review'))
  with check (public.has_org_permission(organization_id, 'content.create') and status in ('draft', 'in_review'));

create policy "analytics_events: viewers read" on public.analytics_events
  for select to authenticated using (public.has_org_permission(organization_id, 'analytics.view'));
-- Analytics rows are written only by sync jobs using the service role.
