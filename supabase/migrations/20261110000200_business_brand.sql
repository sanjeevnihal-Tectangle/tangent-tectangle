-- Tangent: business intelligence profile and brand intelligence.

create type public.business_model as enum ('b2c', 'b2b', 'd2c', 'marketplace', 'hybrid');

create table public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  name text not null,
  industry text not null,
  website text,
  city text not null,
  region text,
  country text not null default 'India',
  description text not null,
  products_and_services text[] not null default '{}',
  target_audience text not null,
  customer_segments text[] not null default '{}',
  business_model public.business_model not null default 'b2c',
  competitors jsonb not null default '[]'::jsonb,
  objectives text[] not null default '{}',
  monthly_budget_inr integer not null default 0 check (monthly_budget_inr >= 0),
  preferred_channels text[] not null default '{}',
  -- AI-generated intelligence profile (editable, approved per section)
  intelligence jsonb,
  intelligence_section_status jsonb not null default '{}'::jsonb,
  intelligence_generated_at timestamptz,
  intelligence_generated_by text,
  updated_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger business_profiles_updated_at before update on public.business_profiles
  for each row execute function public.set_updated_at();

create table public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  is_default boolean not null default false,
  logo_asset_id uuid,
  colors jsonb not null default '[]'::jsonb,
  typography jsonb not null default '{}'::jsonb,
  voice jsonb not null default '{}'::jsonb,
  messaging jsonb not null default '{}'::jsonb,
  approved_copy text[] not null default '{}',
  prohibited_messaging text[] not null default '{}',
  visual_references text[] not null default '{}',
  guidelines text not null default '',
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index brand_profiles_org_idx on public.brand_profiles (organization_id) where deleted_at is null;
create unique index brand_profiles_one_default_idx
  on public.brand_profiles (organization_id)
  where is_default and deleted_at is null;

create trigger brand_profiles_updated_at before update on public.brand_profiles
  for each row execute function public.set_updated_at();

create type public.brand_asset_kind as enum ('logo', 'product_image', 'visual_reference', 'marketing_asset', 'font');

create table public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_profile_id uuid not null references public.brand_profiles (id) on delete cascade,
  kind public.brand_asset_kind not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index brand_assets_profile_idx on public.brand_assets (brand_profile_id) where deleted_at is null;
create index brand_assets_org_idx on public.brand_assets (organization_id);

alter table public.brand_profiles
  add constraint brand_profiles_logo_asset_fk
  foreign key (logo_asset_id) references public.brand_assets (id) on delete set null;

alter table public.business_profiles enable row level security;
alter table public.brand_profiles enable row level security;
alter table public.brand_assets enable row level security;

create policy "business_profiles: members read" on public.business_profiles
  for select to authenticated using (public.is_org_member(organization_id));
create policy "business_profiles: editors write" on public.business_profiles
  for insert to authenticated with check (public.has_org_permission(organization_id, 'business_profile.edit'));
create policy "business_profiles: editors update" on public.business_profiles
  for update to authenticated
  using (public.has_org_permission(organization_id, 'business_profile.edit'))
  with check (public.has_org_permission(organization_id, 'business_profile.edit'));

create policy "brand_profiles: members read" on public.brand_profiles
  for select to authenticated using (deleted_at is null and public.is_org_member(organization_id));
create policy "brand_profiles: editors insert" on public.brand_profiles
  for insert to authenticated with check (public.has_org_permission(organization_id, 'brand.edit'));
create policy "brand_profiles: editors update" on public.brand_profiles
  for update to authenticated
  using (public.has_org_permission(organization_id, 'brand.edit'))
  with check (public.has_org_permission(organization_id, 'brand.edit'));

create policy "brand_assets: members read" on public.brand_assets
  for select to authenticated using (deleted_at is null and public.is_org_member(organization_id));
create policy "brand_assets: editors insert" on public.brand_assets
  for insert to authenticated with check (public.has_org_permission(organization_id, 'brand.edit'));
create policy "brand_assets: editors update" on public.brand_assets
  for update to authenticated
  using (public.has_org_permission(organization_id, 'brand.edit'))
  with check (public.has_org_permission(organization_id, 'brand.edit'));

-- Storage: private bucket, objects keyed as "<organization_id>/<...>".
insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', false)
on conflict (id) do nothing;

create policy "brand-assets: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'brand-assets' and public.is_org_member(((storage.foldername(name))[1])::uuid));

create policy "brand-assets: editors upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'brand-assets' and public.has_org_permission(((storage.foldername(name))[1])::uuid, 'brand.edit'));
