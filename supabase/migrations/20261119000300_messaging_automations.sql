-- Tangent Messaging M3: automations, org messaging settings, entitlements (idempotent)

do $$ begin
  create type public.automation_trigger as enum ('schedule', 'event');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.automation_schedule_preset as enum ('daily', 'weekly', 'monthly');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.automation_event_type as enum ('lead_imported');
exception when duplicate_object then null;
end $$;

create table if not exists public.messaging_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  quiet_hours_enabled boolean not null default true,
  quiet_hours_start text not null default '21:00'
    check (quiet_hours_start ~ '^\d{2}:\d{2}$'),
  quiet_hours_end text not null default '08:00'
    check (quiet_hours_end ~ '^\d{2}:\d{2}$'),
  timezone text not null default 'Asia/Kolkata',
  opt_out_keywords text[] not null default array['STOP', 'UNSUBSCRIBE', 'STOPALL'],
  default_language text not null default 'en',
  updated_at timestamptz not null default now()
);

drop trigger if exists messaging_settings_updated_at on public.messaging_settings;
create trigger messaging_settings_updated_at before update on public.messaging_settings
  for each row execute function public.set_updated_at();

create table if not exists public.message_automations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  enabled boolean not null default false,
  trigger_kind public.automation_trigger not null default 'schedule',
  schedule_preset public.automation_schedule_preset,
  schedule_time text not null default '10:00'
    check (schedule_time ~ '^\d{2}:\d{2}$'),
  schedule_timezone text not null default 'Asia/Kolkata',
  schedule_day_of_week smallint check (schedule_day_of_week between 1 and 7),
  schedule_day_of_month smallint check (schedule_day_of_month between 1 and 28),
  event_type public.automation_event_type,
  channel public.message_channel not null default 'whatsapp',
  product_id uuid references public.business_products (id) on delete set null,
  template_id uuid not null references public.message_templates (id) on delete restrict,
  audience_id uuid not null references public.audiences (id) on delete restrict,
  connected_account_id uuid references public.connected_accounts (id) on delete set null,
  variable_mapping jsonb not null default '{"1":"name"}'::jsonb,
  require_approval_each_run boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_error text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (
    (trigger_kind = 'schedule' and schedule_preset is not null)
    or (trigger_kind = 'event' and event_type is not null)
  )
);

create index if not exists message_automations_due_idx
  on public.message_automations (organization_id, next_run_at)
  where deleted_at is null and enabled;

drop trigger if exists message_automations_updated_at on public.message_automations;
create trigger message_automations_updated_at before update on public.message_automations
  for each row execute function public.set_updated_at();

alter table public.messaging_settings enable row level security;
alter table public.message_automations enable row level security;

drop policy if exists "messaging_settings: members read" on public.messaging_settings;
create policy "messaging_settings: members read" on public.messaging_settings
  for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "messaging_settings: managers write" on public.messaging_settings;
create policy "messaging_settings: managers write" on public.messaging_settings
  for all to authenticated
  using (public.has_org_permission(organization_id, 'campaigns.manage'))
  with check (public.has_org_permission(organization_id, 'campaigns.manage'));

drop policy if exists "message_automations: members read" on public.message_automations;
create policy "message_automations: members read" on public.message_automations
  for select to authenticated
  using (deleted_at is null and public.is_org_member(organization_id));
drop policy if exists "message_automations: managers write" on public.message_automations;
create policy "message_automations: managers write" on public.message_automations
  for all to authenticated
  using (public.has_org_permission(organization_id, 'campaigns.manage'))
  with check (public.has_org_permission(organization_id, 'campaigns.manage'));

-- Messaging entitlements (DEFAULT_PLANS mirror)
insert into public.plan_entitlements (plan_id, key, limit_value) values
  ('starter', 'messaging_contacts_max', 500),
  ('starter', 'messaging_sends_monthly', 200),
  ('starter', 'messaging_automations', 1),
  ('starter', 'messaging_whatsapp_numbers', 1),
  ('growth', 'messaging_contacts_max', 5000),
  ('growth', 'messaging_sends_monthly', 2000),
  ('growth', 'messaging_automations', 5),
  ('growth', 'messaging_whatsapp_numbers', 2),
  ('professional', 'messaging_contacts_max', 25000),
  ('professional', 'messaging_sends_monthly', 15000),
  ('professional', 'messaging_automations', 25),
  ('professional', 'messaging_whatsapp_numbers', 5),
  ('agency', 'messaging_contacts_max', null),
  ('agency', 'messaging_sends_monthly', null),
  ('agency', 'messaging_automations', null),
  ('agency', 'messaging_whatsapp_numbers', null)
on conflict (plan_id, key) do update set limit_value = excluded.limit_value;
