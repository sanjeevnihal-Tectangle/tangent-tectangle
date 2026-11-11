-- Tangent: AI command centre — conversations, agent runs and tasks.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references public.users (id) on delete set null,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index conversations_org_recent_idx on public.conversations (organization_id, updated_at desc)
  where deleted_at is null;

create trigger conversations_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

create type public.agent_run_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  triggered_by uuid references public.users (id) on delete set null,
  status public.agent_run_status not null default 'queued',
  intent text,
  task_type text,
  plan jsonb,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  error jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index agent_runs_org_recent_idx on public.agent_runs (organization_id, started_at desc);

create type public.message_role as enum ('user', 'assistant', 'system');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role public.message_role not null,
  content text not null,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  -- Run record: plan, agent outputs, validation and required actions.
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

create table public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  agent_run_id uuid not null references public.agent_runs (id) on delete cascade,
  sequence smallint not null,
  agent_id text not null,
  title text not null,
  instruction text not null,
  status public.agent_run_status not null default 'queued',
  output jsonb,
  error jsonb,
  started_at timestamptz,
  completed_at timestamptz
);

create index agent_tasks_run_idx on public.agent_tasks (agent_run_id, sequence);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_tasks enable row level security;

create policy "conversations: members read" on public.conversations
  for select to authenticated using (deleted_at is null and public.is_org_member(organization_id));
create policy "conversations: ai users insert" on public.conversations
  for insert to authenticated
  with check (public.has_org_permission(organization_id, 'ai.run') and created_by = (select auth.uid()));
create policy "conversations: owner updates" on public.conversations
  for update to authenticated
  using (public.is_org_member(organization_id) and created_by = (select auth.uid()))
  with check (public.is_org_member(organization_id) and created_by = (select auth.uid()));

create policy "messages: members read" on public.messages
  for select to authenticated using (public.is_org_member(organization_id));
create policy "messages: ai users insert" on public.messages
  for insert to authenticated with check (public.has_org_permission(organization_id, 'ai.run'));

create policy "agent_runs: members read" on public.agent_runs
  for select to authenticated using (public.is_org_member(organization_id));
create policy "agent_runs: ai users insert" on public.agent_runs
  for insert to authenticated
  with check (public.has_org_permission(organization_id, 'ai.run') and triggered_by = (select auth.uid()));
create policy "agent_runs: trigger user updates" on public.agent_runs
  for update to authenticated
  using (triggered_by = (select auth.uid()))
  with check (triggered_by = (select auth.uid()));

create policy "agent_tasks: members read" on public.agent_tasks
  for select to authenticated using (public.is_org_member(organization_id));
create policy "agent_tasks: ai users write" on public.agent_tasks
  for insert to authenticated with check (public.has_org_permission(organization_id, 'ai.run'));
create policy "agent_tasks: ai users update" on public.agent_tasks
  for update to authenticated
  using (public.has_org_permission(organization_id, 'ai.run'))
  with check (public.has_org_permission(organization_id, 'ai.run'));
