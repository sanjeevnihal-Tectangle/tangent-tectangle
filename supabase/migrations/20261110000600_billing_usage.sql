-- Tangent: subscriptions, configurable entitlements and usage metering.
-- Advertising spend is never billed through these tables.

create table public.plans (
  id text primary key,
  name text not null,
  monthly_price_paise bigint check (monthly_price_paise >= 0),
  is_custom boolean not null default false,
  is_active boolean not null default true,
  sort_order smallint not null default 0
);

create table public.plan_entitlements (
  plan_id text not null references public.plans (id) on delete cascade,
  key text not null,
  -- null = unlimited / contract-defined
  limit_value bigint check (limit_value >= 0),
  primary key (plan_id, key)
);

insert into public.plans (id, name, monthly_price_paise, is_custom, sort_order) values
  ('starter', 'Starter', 199900, false, 1),
  ('growth', 'Growth', 499900, false, 2),
  ('professional', 'Professional', 999900, false, 3),
  ('agency', 'Agency', null, true, 4);

insert into public.plan_entitlements (plan_id, key, limit_value) values
  ('starter', 'ai_credits_monthly', 500),
  ('starter', 'image_generations_monthly', 60),
  ('starter', 'video_generations_monthly', 0),
  ('starter', 'storage_gb', 5),
  ('starter', 'connected_accounts', 3),
  ('starter', 'team_members', 2),
  ('starter', 'brand_profiles', 1),
  ('starter', 'scheduled_posts_monthly', 60),
  ('growth', 'ai_credits_monthly', 2000),
  ('growth', 'image_generations_monthly', 250),
  ('growth', 'video_generations_monthly', 10),
  ('growth', 'storage_gb', 25),
  ('growth', 'connected_accounts', 8),
  ('growth', 'team_members', 5),
  ('growth', 'brand_profiles', 3),
  ('growth', 'scheduled_posts_monthly', 300),
  ('professional', 'ai_credits_monthly', 6000),
  ('professional', 'image_generations_monthly', 800),
  ('professional', 'video_generations_monthly', 40),
  ('professional', 'storage_gb', 100),
  ('professional', 'connected_accounts', 20),
  ('professional', 'team_members', 15),
  ('professional', 'brand_profiles', 10),
  ('professional', 'scheduled_posts_monthly', 1200),
  ('agency', 'ai_credits_monthly', null),
  ('agency', 'image_generations_monthly', null),
  ('agency', 'video_generations_monthly', null),
  ('agency', 'storage_gb', null),
  ('agency', 'connected_accounts', null),
  ('agency', 'team_members', null),
  ('agency', 'brand_profiles', null),
  ('agency', 'scheduled_posts_monthly', null);

create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status public.subscription_status not null default 'trialing',
  provider text not null default 'razorpay',
  provider_subscription_id text unique,
  -- Agency / custom contracts can override individual limits.
  entitlement_overrides jsonb not null default '{}'::jsonb,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.usage_records (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null,
  quantity numeric not null check (quantity > 0),
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index usage_records_org_key_time_idx on public.usage_records (organization_id, key, occurred_at desc);

-- New workspaces start on a Growth trial.
create or replace function private.start_trial_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
  values (new.id, 'growth', 'trialing', now(), now() + interval '14 days')
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

create trigger organizations_start_trial after insert on public.organizations
  for each row execute function private.start_trial_subscription();

create or replace function public.record_usage(
  p_organization_id uuid,
  p_key text,
  p_quantity numeric,
  p_agent_run_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
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
  insert into public.usage_records (organization_id, key, quantity, agent_run_id, metadata)
  values (p_organization_id, p_key, p_quantity, p_agent_run_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

revoke execute on function public.record_usage(uuid, text, numeric, uuid, jsonb) from public, anon;
grant execute on function public.record_usage(uuid, text, numeric, uuid, jsonb) to authenticated;

alter table public.plans enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_records enable row level security;

create policy "plans: readable" on public.plans for select to authenticated using (is_active);
create policy "plan_entitlements: readable" on public.plan_entitlements for select to authenticated using (true);
create policy "subscriptions: members read" on public.subscriptions
  for select to authenticated using (public.is_org_member(organization_id));
-- Subscription changes come from verified Razorpay webhooks (service role).
create policy "usage_records: members read" on public.usage_records
  for select to authenticated using (public.is_org_member(organization_id));
