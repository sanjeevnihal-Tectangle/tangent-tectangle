-- Tangent: Messaging & WhatsApp Marketing (Phase 4.5 M0/M1)
-- Idempotent — safe to re-run after a partial apply.
-- Table is named business_products (not products) to avoid colliding with
-- any pre-existing public.products relation in the project.

-- Allow WhatsApp (and Meta Ads alias) as connected-account providers.
alter type public.integration_provider add value if not exists 'whatsapp';
alter type public.integration_provider add value if not exists 'meta_ads';

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.product_status as enum ('active', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.contact_source as enum ('manual', 'csv', 'scrape', 'api', 'crm');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.consent_state as enum ('unknown', 'opted_in', 'opted_out');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.import_batch_status as enum ('pending_review', 'accepted', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.message_channel as enum ('whatsapp', 'sms', 'email');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.template_category as enum ('marketing', 'utility', 'authentication');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.template_status as enum (
    'draft', 'pending_meta', 'approved', 'rejected', 'paused'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Drop incomplete objects from earlier failed attempts (safe if missing).
-- Only drops a public.products table that looks like OUR messaging catalog
-- (has organization_id + brand_profile_id) and is empty — never a foreign schema.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'products'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'organization_id'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'brand_profile_id'
  ) and not exists (
    select 1 from public.products limit 1
  ) then
    -- Recreate under the unambiguous name below.
    drop table if exists public.products cascade;
  end if;
exception when others then
  -- Leave pre-existing products alone if anything unexpected happens.
  null;
end $$;

-- ---------------------------------------------------------------------------
-- Products catalog (business_products)
-- ---------------------------------------------------------------------------

create table if not exists public.business_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '',
  sku text,
  category text,
  status public.product_status not null default 'active',
  brand_profile_id uuid references public.brand_profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists business_products_org_status_idx
  on public.business_products (organization_id, status)
  where deleted_at is null;

drop trigger if exists business_products_updated_at on public.business_products;
create trigger business_products_updated_at before update on public.business_products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Contacts & audiences
-- ---------------------------------------------------------------------------

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  phone_e164 text,
  email text,
  name text not null default '',
  source public.contact_source not null default 'manual',
  consent_whatsapp public.consent_state not null default 'unknown',
  consent_whatsapp_at timestamptz,
  consent_whatsapp_evidence text,
  consent_sms public.consent_state not null default 'unknown',
  consent_email public.consent_state not null default 'unknown',
  attributes jsonb not null default '{}'::jsonb,
  product_interest_ids uuid[] not null default '{}',
  opted_out_at timestamptz,
  blocked_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  check (email is null or email ~* '^[^@]+@[^@]+\.[^@]+$'),
  check (phone_e164 is not null or email is not null)
);

create unique index if not exists contacts_org_phone_uidx
  on public.contacts (organization_id, phone_e164)
  where deleted_at is null and phone_e164 is not null;

create unique index if not exists contacts_org_email_uidx
  on public.contacts (organization_id, lower(email))
  where deleted_at is null and email is not null;

create index if not exists contacts_org_recent_idx
  on public.contacts (organization_id, created_at desc)
  where deleted_at is null;

drop trigger if exists contacts_updated_at on public.contacts;
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

create table if not exists public.audiences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  description text not null default '',
  product_id uuid references public.business_products (id) on delete set null,
  filter jsonb not null default '{}'::jsonb,
  estimated_size integer not null default 0 check (estimated_size >= 0),
  refreshed_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- If audiences was created earlier pointing at public.products, retarget the FK.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'audiences'
  ) then
    alter table public.audiences drop constraint if exists audiences_product_id_fkey;
    begin
      alter table public.audiences
        add constraint audiences_product_id_fkey
        foreign key (product_id) references public.business_products (id) on delete set null;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

create index if not exists audiences_org_idx
  on public.audiences (organization_id)
  where deleted_at is null;

drop trigger if exists audiences_updated_at on public.audiences;
create trigger audiences_updated_at before update on public.audiences
  for each row execute function public.set_updated_at();

create table if not exists public.audience_members (
  audience_id uuid not null references public.audiences (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (audience_id, contact_id)
);

create index if not exists audience_members_contact_idx on public.audience_members (contact_id);

create table if not exists public.contact_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source public.contact_source not null,
  filename text,
  status public.import_batch_status not null default 'pending_review',
  raw_rows jsonb not null default '[]'::jsonb,
  accepted_count integer not null default 0,
  rejected_count integer not null default 0,
  notes text not null default '',
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_import_batches_org_idx
  on public.contact_import_batches (organization_id, created_at desc);

drop trigger if exists contact_import_batches_updated_at on public.contact_import_batches;
create trigger contact_import_batches_updated_at before update on public.contact_import_batches
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Message templates
-- ---------------------------------------------------------------------------

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel public.message_channel not null default 'whatsapp',
  product_id uuid references public.business_products (id) on delete set null,
  connected_account_id uuid references public.connected_accounts (id) on delete set null,
  name text not null check (char_length(name) between 1 and 512),
  language text not null default 'en',
  category public.template_category not null default 'marketing',
  body_components jsonb not null default '{}'::jsonb,
  status public.template_status not null default 'draft',
  meta_template_id text,
  meta_namespace text,
  rejection_reason text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Ensure required columns exist if an earlier partial table was created.
alter table public.message_templates add column if not exists status public.template_status not null default 'draft';
alter table public.message_templates add column if not exists channel public.message_channel not null default 'whatsapp';
alter table public.message_templates add column if not exists product_id uuid;
alter table public.message_templates add column if not exists connected_account_id uuid;
alter table public.message_templates add column if not exists name text;
alter table public.message_templates add column if not exists language text not null default 'en';
alter table public.message_templates add column if not exists category public.template_category not null default 'marketing';
alter table public.message_templates add column if not exists body_components jsonb not null default '{}'::jsonb;
alter table public.message_templates add column if not exists meta_template_id text;
alter table public.message_templates add column if not exists meta_namespace text;
alter table public.message_templates add column if not exists rejection_reason text;
alter table public.message_templates add column if not exists deleted_at timestamptz;

do $$
begin
  alter table public.message_templates drop constraint if exists message_templates_product_id_fkey;
  alter table public.message_templates
    add constraint message_templates_product_id_fkey
    foreign key (product_id) references public.business_products (id) on delete set null;
exception when duplicate_object then null;
end $$;

create index if not exists message_templates_org_channel_idx
  on public.message_templates (organization_id, channel, status)
  where deleted_at is null;

create unique index if not exists message_templates_org_meta_uidx
  on public.message_templates (organization_id, meta_template_id)
  where deleted_at is null and meta_template_id is not null;

drop trigger if exists message_templates_updated_at on public.message_templates;
create trigger message_templates_updated_at before update on public.message_templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.business_products enable row level security;
alter table public.contacts enable row level security;
alter table public.audiences enable row level security;
alter table public.audience_members enable row level security;
alter table public.contact_import_batches enable row level security;
alter table public.message_templates enable row level security;

drop policy if exists "products: members read" on public.business_products;
drop policy if exists "business_products: members read" on public.business_products;
create policy "business_products: members read" on public.business_products
  for select to authenticated
  using (deleted_at is null and public.is_org_member(organization_id));
drop policy if exists "products: managers write" on public.business_products;
drop policy if exists "business_products: managers write" on public.business_products;
create policy "business_products: managers write" on public.business_products
  for all to authenticated
  using (public.has_org_permission(organization_id, 'campaigns.manage'))
  with check (public.has_org_permission(organization_id, 'campaigns.manage'));

-- Clean up policies if an old public.products messaging table still exists.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'products'
  ) then
    execute 'drop policy if exists "products: members read" on public.products';
    execute 'drop policy if exists "products: managers write" on public.products';
  end if;
end $$;

drop policy if exists "contacts: members read" on public.contacts;
create policy "contacts: members read" on public.contacts
  for select to authenticated
  using (deleted_at is null and public.is_org_member(organization_id));
drop policy if exists "contacts: managers write" on public.contacts;
create policy "contacts: managers write" on public.contacts
  for all to authenticated
  using (public.has_org_permission(organization_id, 'campaigns.manage'))
  with check (public.has_org_permission(organization_id, 'campaigns.manage'));

drop policy if exists "audiences: members read" on public.audiences;
create policy "audiences: members read" on public.audiences
  for select to authenticated
  using (deleted_at is null and public.is_org_member(organization_id));
drop policy if exists "audiences: managers write" on public.audiences;
create policy "audiences: managers write" on public.audiences
  for all to authenticated
  using (public.has_org_permission(organization_id, 'campaigns.manage'))
  with check (public.has_org_permission(organization_id, 'campaigns.manage'));

drop policy if exists "audience_members: members read" on public.audience_members;
create policy "audience_members: members read" on public.audience_members
  for select to authenticated
  using (
    exists (
      select 1 from public.audiences a
      where a.id = audience_id and public.is_org_member(a.organization_id)
    )
  );
drop policy if exists "audience_members: managers write" on public.audience_members;
create policy "audience_members: managers write" on public.audience_members
  for all to authenticated
  using (
    exists (
      select 1 from public.audiences a
      where a.id = audience_id and public.has_org_permission(a.organization_id, 'campaigns.manage')
    )
  )
  with check (
    exists (
      select 1 from public.audiences a
      where a.id = audience_id and public.has_org_permission(a.organization_id, 'campaigns.manage')
    )
  );

drop policy if exists "contact_import_batches: members read" on public.contact_import_batches;
create policy "contact_import_batches: members read" on public.contact_import_batches
  for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "contact_import_batches: managers write" on public.contact_import_batches;
create policy "contact_import_batches: managers write" on public.contact_import_batches
  for all to authenticated
  using (public.has_org_permission(organization_id, 'campaigns.manage'))
  with check (public.has_org_permission(organization_id, 'campaigns.manage'));

drop policy if exists "message_templates: members read" on public.message_templates;
create policy "message_templates: members read" on public.message_templates
  for select to authenticated
  using (deleted_at is null and public.is_org_member(organization_id));
drop policy if exists "message_templates: managers write" on public.message_templates;
create policy "message_templates: managers write" on public.message_templates
  for all to authenticated
  using (public.has_org_permission(organization_id, 'campaigns.manage'))
  with check (public.has_org_permission(organization_id, 'campaigns.manage'));
