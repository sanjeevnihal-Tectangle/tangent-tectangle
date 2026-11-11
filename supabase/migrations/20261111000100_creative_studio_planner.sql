-- Tangent Phase 3/4: Creative Studio projects, media storage, content approval workflow.

-- ---------------------------------------------------------------------------
-- Media assets: names, tags and search
-- ---------------------------------------------------------------------------

alter table public.media_assets
  add column name text not null default 'Untitled',
  add column tags text[] not null default '{}',
  add column brand_profile_id uuid references public.brand_profiles (id) on delete set null;

create index media_assets_tags_idx on public.media_assets using gin (tags);

-- Private bucket; objects keyed "<organization_id>/<uuid>.<ext>"
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'])
on conflict (id) do nothing;

create policy "media: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and public.is_org_member(((storage.foldername(name))[1])::uuid));

create policy "media: creators upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.has_org_permission(((storage.foldername(name))[1])::uuid, 'content.create'));

-- Brand logos now reference media assets chosen from the Asset Library.
alter table public.brand_profiles drop constraint if exists brand_profiles_logo_asset_fk;
alter table public.brand_profiles
  add constraint brand_profiles_logo_media_fk
  foreign key (logo_asset_id) references public.media_assets (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Creative projects (editable design documents)
-- ---------------------------------------------------------------------------

create type public.creative_status as enum ('draft', 'final');

create table public.creative_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_profile_id uuid references public.brand_profiles (id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  objective text not null default '',
  platform text not null,
  format text not null,
  -- Versioned design document (pages, backgrounds, layers); validated by the app.
  document jsonb not null,
  -- Concept, prompt and copy that produced the design.
  brief jsonb not null default '{}'::jsonb,
  status public.creative_status not null default 'draft',
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index creative_projects_org_recent_idx on public.creative_projects (organization_id, updated_at desc)
  where deleted_at is null;

create trigger creative_projects_updated_at before update on public.creative_projects
  for each row execute function public.set_updated_at();

alter table public.creative_projects enable row level security;

create policy "creative_projects: members read" on public.creative_projects
  for select to authenticated using (deleted_at is null and public.is_org_member(organization_id));
create policy "creative_projects: creators insert" on public.creative_projects
  for insert to authenticated with check (public.has_org_permission(organization_id, 'content.create'));
create policy "creative_projects: creators update" on public.creative_projects
  for update to authenticated
  using (public.has_org_permission(organization_id, 'content.create'))
  with check (public.has_org_permission(organization_id, 'content.create'));

-- ---------------------------------------------------------------------------
-- Content planner: approval workflow and link to creatives
-- ---------------------------------------------------------------------------

alter table public.content_items
  add column creative_project_id uuid references public.creative_projects (id) on delete set null,
  add column review_note text;

-- Approvers can move content between draft, in_review and approved.
-- scheduled / published / failed are only set by the publishing engine (service role).
create policy "content_items: approvers review" on public.content_items
  for update to authenticated
  using (public.has_org_permission(organization_id, 'content.approve') and status in ('draft', 'in_review', 'approved'))
  with check (public.has_org_permission(organization_id, 'content.approve') and status in ('draft', 'in_review', 'approved'));
