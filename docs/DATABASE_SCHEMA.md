# Database Schema

PostgreSQL on Supabase. Migrations live in `supabase/migrations/` and are applied in order with `supabase db push`.

| Migration | Contents |
| --- | --- |
| `…000100_core_tenancy` | `users`, `organizations`, `memberships`, `invitations`, `permissions`, `role_permissions`, RLS helpers, `create_organization()` |
| `…000200_business_brand` | `business_profiles` (+ AI intelligence), `brand_profiles`, `brand_assets`, `brand-assets` storage bucket |
| `…000300_ai_core` | `conversations`, `messages`, `agent_runs`, `agent_tasks` |
| `…000400_marketing` | `campaigns`, `media_assets`, `content_items`, `analytics_events` |
| `…000500_integrations_approvals_audit` | `connected_accounts`, `private.integration_credentials`, `approval_requests`, `publishing_jobs`, `ad_accounts`, `ad_campaigns`, `audit_logs` |
| `…000600_billing_usage` | `plans`, `plan_entitlements`, `subscriptions`, `usage_records`, `record_usage()` |
| `…000700_invitation_acceptance` | `accept_invitation()` |
| `20261111000100_creative_studio_planner` | `creative_projects`, private `media` storage bucket + policies, media asset names/tags, brand logo → media asset, content approval policy, `content_items.creative_project_id` / `review_note` |

### Creative Studio and planning (Phase 3/4)
- `creative_projects` — design `document` (jsonb, validated by `designDocumentSchema`: pages → background + layers in native pixels), `brief` (objective, concept, AI design spec, template), format/platform, draft/final, soft delete.
- `media_assets` — now has `name`, `tags` (GIN index) and optional `brand_profile_id`; files live in the private `media` bucket at `<organization_id>/<uuid>.<ext>` and are served with short-lived signed URLs.
- `content_items` — creators edit draft/in-review items; holders of `content.approve` can move items between draft, in review and approved. `scheduled`, `published` and `failed` are set only by the publishing engine.

## Tenancy model

- Every tenant table has `organization_id uuid not null references organizations(id) on delete cascade` and an index leading with it.
- `memberships (organization_id, user_id, role)` is the source of access. A user can belong to many organizations.
- RLS helpers (`security definer`, `search_path = ''`):
  - `is_org_member(org)` — caller is a member.
  - `has_org_permission(org, perm)` — caller's role grants `perm` via `role_permissions`.
- Read policies use `is_org_member`; write policies use the matching permission (e.g. `brand.edit`, `campaigns.manage`).
- Sensitive writes (connected accounts, analytics ingestion, subscription changes, publishing jobs) have **no** user write policies — only trusted server jobs using the service role write them.

## Key tables

### Identity and access
- `users` — profile mirror of `auth.users`, populated by trigger on sign-up.
- `organizations` — workspace (`slug` unique, `demo` reserved), soft delete via `deleted_at`.
- `memberships` — role per user per org (`member_role` enum: owner, admin, marketer, designer, analyst, viewer).
- `invitations` — email, role (never owner), `token_hash` (SHA-256 of the single-use token), expiry, accepted/revoked timestamps.
- `permissions`, `role_permissions` — data-driven permission matrix (mirrors `src/lib/auth/permissions.ts`).

### Business and brand
- `business_profiles` — one per org: identity, offering, audience, competitors (jsonb), objectives, budget, channels; plus `intelligence` (jsonb, validated by `marketingIntelligenceContentSchema`) and `intelligence_section_status` (draft/approved per section).
- `brand_profiles` — multiple per org, one default (partial unique index); colours, typography, voice, messaging (jsonb), approved copy, prohibited messaging, visual references, guidelines; soft delete.
- `brand_assets` — files in the private `brand-assets` bucket keyed `<organization_id>/…` with storage RLS.

### AI
- `conversations`, `messages` (assistant messages carry the run record — plan, outputs, validation, required actions — in `metadata`).
- `agent_runs` — execution log per orchestrator run: status, intent, task type, model, token usage, error, timings.
- `agent_tasks` — one row per agent step: agent id, instruction, status, structured output, error.

### Marketing
- `campaigns` — lifecycle enum `draft → planning → production → review → approved → active → completed`, budget in paise, KPIs (jsonb).
- `content_items` — platform, format, caption, hashtags, media, schedule, status (`draft, in_review, approved, scheduled, published, failed`), linked approval request. Users can only edit drafts/in-review rows; status advances via the approval engine.
- `media_assets` — uploads and AI-generated media (`generation` jsonb records provider, model, prompt).
- `analytics_events` — normalised metrics by source/entity/date with `is_estimate` to separate real data from modelled estimates.

### Integrations, approvals, execution
- `connected_accounts` — provider, external id, scopes, status, token expiry (no tokens).
- `private.integration_credentials` — AES-GCM ciphertext of access/refresh tokens; revoked from `anon`/`authenticated`.
- `approval_requests` — versioned (`version`, `previous_version_id`), exact `payload` + `payload_hash` (SHA-256 hex), `financial_impact`, requesting agent/run, decision fields. A trigger makes payload, hash, action, account and financial impact **immutable**; changes require a new version. Decisions on spend actions require `ads.approve_spend`; others require `content.publish`.
- `publishing_jobs` — require an `approval_request_id`; executed by workers only.
- `ad_accounts` — per-account daily/monthly spend limits; `ad_campaigns` — users may only create/edit drafts.

### Audit
- `audit_logs` — append-only (update/delete raise an exception). Written via `log_audit_event()` which always records the caller (`auth.uid()`), or the agent id for agent actions.

### Billing
- `plans`, `plan_entitlements` (`limit_value null` = unlimited), seeded with Starter/Growth/Professional/Agency.
- `subscriptions` — one per org; new orgs start a 14-day Growth trial (trigger); `entitlement_overrides` for custom contracts; written only by verified Razorpay webhooks.
- `usage_records` — metered usage (AI credits, images, videos…), written via `record_usage()`.

## Conventions

- `created_at` / `updated_at` (trigger `set_updated_at`) on mutable tables; `deleted_at` soft delete for user content.
- Money stored as integer paise (`bigint`) except `business_profiles.monthly_budget_inr` (whole rupees, user input).
- All functions use `set search_path = ''` and fully-qualified names.
- Generated TypeScript types (`supabase gen types typescript`) should replace the Zod row parsing in `supabase-repository.ts` once the project is linked.
