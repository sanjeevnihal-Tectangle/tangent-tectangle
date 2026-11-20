-- Tangent Messaging M5: omnichannel conversation inbox (WhatsApp first; social DMs later)
-- Idempotent — safe to re-run after a partial apply.

alter type public.external_action_type add value if not exists 'send_session_message';

do $$ begin
  create type public.inbox_channel as enum (
    'whatsapp',
    'sms',
    'email',
    'instagram',
    'facebook',
    'messenger',
    'linkedin',
    'tiktok',
    'youtube'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.conversation_thread_status as enum ('open', 'snoozed', 'closed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.conversation_message_direction as enum ('inbound', 'outbound');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.conversation_message_sender as enum ('contact', 'user', 'agent', 'auto');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.inbox_auto_reply_mode as enum ('off', 'draft_only', 'auto_faq');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Threads + messages
-- ---------------------------------------------------------------------------

create table if not exists public.conversation_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel public.inbox_channel not null,
  connected_account_id uuid references public.connected_accounts (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  external_thread_key text not null,
  participant_handle text not null default '',
  participant_name text not null default '',
  status public.conversation_thread_status not null default 'open',
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz,
  last_message_preview text not null default '',
  last_inbound_at timestamptz,
  ai_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, channel, external_thread_key)
);

create index if not exists conversation_threads_org_last_msg_idx
  on public.conversation_threads (organization_id, last_message_at desc nulls last);

create index if not exists conversation_threads_org_status_idx
  on public.conversation_threads (organization_id, status);

drop trigger if exists conversation_threads_updated_at on public.conversation_threads;
create trigger conversation_threads_updated_at before update on public.conversation_threads
  for each row execute function public.set_updated_at();

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  thread_id uuid not null references public.conversation_threads (id) on delete cascade,
  direction public.conversation_message_direction not null,
  sender_kind public.conversation_message_sender not null,
  body text not null default '',
  content_type text not null default 'text',
  provider_message_id text,
  status text not null default 'received',
  ai_intent text,
  ai_sentiment text,
  ai_confidence numeric(4, 3),
  ai_draft_reply text,
  ai_should_auto_reply boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists conversation_messages_thread_idx
  on public.conversation_messages (thread_id, occurred_at);

create unique index if not exists conversation_messages_provider_id_uidx
  on public.conversation_messages (organization_id, provider_message_id)
  where provider_message_id is not null;

-- ---------------------------------------------------------------------------
-- Inbox AI settings (extends messaging_settings when present)
-- ---------------------------------------------------------------------------

alter table public.messaging_settings
  add column if not exists inbox_ai_enabled boolean not null default true;

alter table public.messaging_settings
  add column if not exists auto_reply_mode public.inbox_auto_reply_mode not null default 'draft_only';

alter table public.messaging_settings
  add column if not exists auto_reply_connected_account_id uuid
    references public.connected_accounts (id) on delete set null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.conversation_threads enable row level security;
alter table public.conversation_messages enable row level security;

drop policy if exists "conversation_threads: members read" on public.conversation_threads;
create policy "conversation_threads: members read" on public.conversation_threads
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "conversation_threads: managers write" on public.conversation_threads;
create policy "conversation_threads: managers write" on public.conversation_threads
  for all to authenticated
  using (public.has_org_permission(organization_id, 'campaigns.manage'))
  with check (public.has_org_permission(organization_id, 'campaigns.manage'));

drop policy if exists "conversation_messages: members read" on public.conversation_messages;
create policy "conversation_messages: members read" on public.conversation_messages
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "conversation_messages: managers write" on public.conversation_messages;
create policy "conversation_messages: managers write" on public.conversation_messages
  for all to authenticated
  using (public.has_org_permission(organization_id, 'campaigns.manage'))
  with check (public.has_org_permission(organization_id, 'campaigns.manage'));
