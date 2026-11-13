-- Tangent: product & service catalogue with per-product brand kits, and the
-- visual style (imagery, illustration, icons, patterns, fonts) of each brand kit.

alter table public.brand_profiles
  add column if not exists visual_style jsonb not null default '{}'::jsonb;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  kind text not null default 'product' check (kind in ('product', 'service')),
  category text not null default '',
  description text not null default '',
  price text not null default '',
  audience text not null default '',
  benefits text[] not null default '{}',
  features text[] not null default '{}',
  url text not null default '',
  -- Brand kit used for this product's creatives; null = the company's default brand kit.
  brand_profile_id uuid references public.brand_profiles (id) on delete set null,
  image_asset_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists products_org_idx on public.products (organization_id) where deleted_at is null;

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;

drop policy if exists "products: members read" on public.products;
create policy "products: members read" on public.products
  for select to authenticated using (deleted_at is null and public.is_org_member(organization_id));
drop policy if exists "products: editors insert" on public.products;
create policy "products: editors insert" on public.products
  for insert to authenticated with check (public.has_org_permission(organization_id, 'business_profile.edit'));
drop policy if exists "products: editors update" on public.products;
create policy "products: editors update" on public.products
  for update to authenticated
  using (public.has_org_permission(organization_id, 'business_profile.edit'))
  with check (public.has_org_permission(organization_id, 'business_profile.edit'));
