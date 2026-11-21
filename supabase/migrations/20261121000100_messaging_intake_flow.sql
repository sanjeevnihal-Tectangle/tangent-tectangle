-- Configurable inbox intake flow: welcome message + qualification questions.
-- Idempotent — safe to re-run.

alter table public.messaging_settings
  add column if not exists intake_flow_enabled boolean not null default true;

alter table public.messaging_settings
  add column if not exists intake_auto_send boolean not null default false;

alter table public.messaging_settings
  add column if not exists intake_welcome_message text not null default
    'Hi! Thanks for reaching out. We help businesses grow with marketing and software tools.';

alter table public.messaging_settings
  add column if not exists intake_questions jsonb not null default
    '[{"id":"business_type","key":"business_type","prompt":"Quick question — what type of business are you in?"}]'::jsonb;
