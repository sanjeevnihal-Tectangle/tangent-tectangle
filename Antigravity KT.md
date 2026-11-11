# Antigravity KT — Tangent (AI Marketing OS)

You are taking over an in-progress codebase. Read this file fully before changing anything.
Then read `/docs/*.md` (product, architecture, schema, agents, integrations, roadmap).

---

## 1. What Tangent is

An AI marketing operating system for businesses (India first). The modules all share one
context per business: business profile, approved intelligence and brand profile.
Philosophy: **Think. Create. Execute. Grow.**

Non-negotiable product rules (enforce them in every change):

1. **Never fake success.** No simulated connections, publishes, AI output or metrics. If
   credentials are missing, show an explicit "not configured" or "connection required" state.
2. **Label demo data** everywhere it appears (`DemoBadge`, "Sample" labels).
3. **Human-approved execution.** AI may READ and CREATE drafts. EXECUTE (publish, launch ads,
   spend, change budgets or targeting, send messages, delete published content) only runs
   against an approved `approval_request` whose payload hash matches exactly
   (`src/lib/approvals/engine.ts` → `assertExecutable`). Any change creates a new version
   that needs approval again.
4. **Secrets are server-only.** Nothing secret may carry the `NEXT_PUBLIC_` prefix. OAuth
   tokens go encrypted into `private.integration_credentials` (never sent to the browser).
5. **Tenant isolation.** The organization id always comes from `resolveWorkspace(orgSlug)` and
   the user's session, never from the client. RLS enforces it again in Postgres.
6. **Plan limits are configuration.** Call `checkEntitlement()` / `quotaError()`, not
   hard-coded plan ids.
7. **Audit everything.** Call `repository.recordAudit()` on every mutation. `audit_logs` is
   append-only.

---

## 2. Current status (as of 11 Nov 2026)

| Area | Status |
|---|---|
| Design system, app shell, navigation, Ctrl+K palette, light/dark themes | ✅ |
| Auth (email, Google, password recovery), workspaces, roles, invitations | ✅ (Google provider not yet enabled in Supabase) |
| Overview dashboard | ✅ (always labelled demo data until analytics connectors exist) |
| AI Command Centre (orchestrator, 3 agents, streaming progress, approvals) | ✅ |
| Business onboarding + Marketing Strategy (AI intelligence profile, per-section approval) | ✅ |
| Brand Intelligence (multiple profiles, logo from Asset Library) | ✅ |
| Creative Studio (guided AI flow, 16 formats, 11 templates, editor, carousels, variations, resize, PNG export) | ✅ |
| Copy Studio | ✅ |
| Asset Library (private Supabase Storage, signed URLs, picker) | ✅ |
| Content Planner (month/week/day/list, Draft → In review → Approved, AI monthly calendar) | ✅ |
| AI provider failover (OpenAI ⇄ Anthropic) | ✅ |
| AI image generation (OpenAI gpt-image) | 🟡 Code written; **untested** (OpenAI account has no credits; `IMAGE_PROVIDER=none`) |
| Video Studio | ⬜ |
| Social connectors (Meta/Instagram/Facebook, YouTube), scheduling, publishing jobs | ⬜ Phase 4 |
| Campaigns, SEO Studio, Ads Manager, Analytics, Competitors | ⬜ Phase 5. Each shows a roadmap page via `src/app/w/[orgSlug]/[module]/page.tsx` + `src/lib/roadmap.ts` |
| Billing (Razorpay), Sentry, Playwright smoke tests | ⬜ Phase 6 |

**Not yet verified live** (built and typechecked, but never clicked through by a signed-in user):
- Uploading an asset to Supabase Storage (Asset Library, asset picker)
- "Send to Planner" from the editor (exports PNG pages → uploads them → creates a draft post)
- AI image generation

Verify these first (see §9).

---

## 3. Environment and infrastructure

- OS: Windows, PowerShell. Package manager: **pnpm**. Node 24.
- Supabase project is live; all 8 migrations are applied.
- `.env` holds real keys (git-ignored). **Never print or echo values.** To inspect, list key
  names only.
- `.env.example` documents every variable.
- The user runs `npm run dev` on port 3000 and is signed in to workspace slug `krackbot-marketing`.

Key env vars:

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Live mode (absent → demo mode) |
| `SUPABASE_DB_URL` | Postgres URL for the Supabase CLI only (password is URL-encoded) |
| `OPENAI_API_KEY`, `AI_MODEL_FAST` (gpt-5-mini), `AI_MODEL_REASONING` (gpt-5) | OpenAI (**no credits currently**) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL_FAST` (claude-haiku-5-5), `ANTHROPIC_MODEL_REASONING` (claude-sonnet-5-5) | Anthropic (working; currently serves all AI) |
| `AI_PROVIDER_ORDER` | Failover order, default `openai,anthropic` |
| `IMAGE_PROVIDER` (`none`/`openai`), `IMAGE_MODEL` | Image generation |
| `NEXT_PUBLIC_TANGENT_FORCE_DEMO=true` | Force the demo workspace even with Supabase set (handy for testing without a login) |
| `NEXT_DIST_DIR` | Separate build folder for a second local server (e.g. `.next-demo`) |

### Commands

```bash
pnpm dev                 # dev server
pnpm typecheck           # next typegen + tsc (route types are generated, so always use this)
pnpm lint
pnpm test                # vitest (57 tests)
pnpm check               # typecheck + lint + test (must pass before you finish)
pnpm build               # production build (must pass; it catches Cache Components errors)
pnpm ai:check            # live call through the AI provider chain; shows which provider answered
```

Apply a new migration (PowerShell; never print the URL):

```powershell
$dbUrl = ((Select-String -Path .env -Pattern '^SUPABASE_DB_URL=').Line -split '=',2)[1]
pnpm dlx supabase@latest db push --db-url "$dbUrl" --yes
```

Demo-mode second server, for testing without the user's login:

```powershell
$env:NEXT_DIST_DIR=".next-demo"; $env:NEXT_PUBLIC_TANGENT_FORCE_DEMO="true"; pnpm exec next dev -p 3005
# open http://localhost:3005/w/demo/...  — afterwards stop it and delete .next-demo and .tangent-demo
```

---

## 4. Stack and versions

Next.js **16.4** (App Router, Turbopack, **Cache Components + Partial Prefetching on**),
React 19.3, TypeScript 5 strict, Tailwind 4, shadcn/ui (Radix, "nova" style), Lucide,
Framer Motion, Recharts, Zod 4, react-hook-form, Supabase (`@supabase/ssr`), OpenAI SDK 7,
Anthropic SDK 1.8, html-to-image, date-fns, Vitest, tsx.

`AGENTS.md` (written by Next) says it plainly: **this Next version differs from your
training data.** Read `node_modules/next/dist/docs/` before using an unfamiliar API.

---

## 5. Critical gotchas (each of these has already caused a bug)

1. **Middleware is `src/proxy.ts`** (Next 16 rename). It refreshes the Supabase session,
   protects `/w/*`, and in demo mode redirects `/` → `/w/demo/overview`.
2. **Cache Components:** any request-time read (cookies, params, searchParams) must sit
   inside `<Suspense>`. Page pattern used everywhere: a sync `Page` → `<Suspense fallback={Skeleton}>`
   → an async `Loader` that awaits params. Using `new Date()`, `Date.now()` or `Math.random()`
   (including client components rendered by that loader) requires `await connection()` from
   `next/server` first. See `studio/page.tsx`, `planner/page.tsx`, `overview/page.tsx`.
3. **`"use server"` files may export ONLY async functions** (plus types). Put constants in a
   separate module (e.g. `src/features/copy/purposes.ts`).
4. **Server components cannot use non-component values exported from `"use client"` files**;
   they receive a client reference, not the value. Shared constants go in plain modules
   (e.g. `src/features/planner/views.ts`).
5. **React state updates inside `startTransition(async …)` only commit when the async work
   finishes.** Set loading or step state synchronously *before* the transition (see
   `create-wizard.tsx` `loadConcepts`).
6. **Radix `<SelectValue />` renders empty on SSR.** Always pass explicit children:
   `<SelectValue>{label}</SelectValue>`.
7. **ESLint React rules are strict:** no `setState` synchronously inside effects, no ref
   writes during render. For autosave, derive "dirty" by comparing against a saved snapshot
   (see `creative-editor.tsx`).
8. `<fieldset>` needs `className="min-w-0"` inside grid or flex layouts.
9. In the dev overlay, "hydration mismatch" warnings mentioning `data-cursor-ref` come from
   browser automation tooling, not the app.
10. **Don't edit files with PowerShell regex**: `$(...)` inside replacement strings gets
    written literally. Use a proper file-edit tool.
11. **Anthropic structured outputs:** keep Zod schemas with all fields required (empty
    strings or arrays for "none"). All current agent schemas are verified to work with Claude.

---

## 6. Architecture map

```
src/
  app/
    (auth)/          login, signup, forgot/reset password, workspaces (resolver), workspaces/new, invite/[token]
    auth/callback/   PKCE exchange
    api/ai/command/  POST → NDJSON stream of orchestrator RunEvents
    w/[orgSlug]/     layout (shell) + overview, command-centre, strategy, onboarding, brand,
                     studio (+ new, copy, [projectId] editor), assets, planner, agents,
                     integrations, team, settings, [module] (roadmap pages), error.tsx
  components/        ui/ (shadcn), shell/, creative/ (renderer, thumbnails, fonts), data/, states/, page/
  features/<module>/ UI + server actions: business, brand, command-centre, dashboard, approvals,
                     team, auth, workspaces, studio (+ editor/), assets, planner, copy
  lib/
    ai/              provider.ts (failover chain), provider-types.ts, providers/{openai,anthropic,fallback}.ts,
                     image-provider.ts, orchestrator.ts, agents/{definitions,handlers}.ts, context.ts,
                     outputs.ts (Zod schemas), plan.ts, validation.ts, events.ts, metering.ts
    approvals/engine.ts   state machine, payload hashing, assertExecutable
    auth/            permissions.ts (roles → permissions), actions.ts
    billing/plans.ts      plans, entitlements, credits
    creative/        formats.ts, document.ts (design doc schema + resize), layout.ts (layout engine), templates.ts
    data/            types.ts (WorkspaceRepository), supabase-repository.ts, demo-repository.ts
    demo/            all demo fixtures
    domain/          shared types + Zod schemas (business, brand, content, creative, media, …)
    env/             public.ts, server.ts (Zod-validated)
    integrations/    providers.ts (registry), gateway.ts (adapter contract; ADAPTERS is empty)
    workspace/server.ts   resolveWorkspace(orgSlug) → { context, repository }
supabase/migrations/      8 SQL migrations (RLS everywhere)
tests/                    vitest unit tests
scripts/check-ai.ts       pnpm ai:check
```

### Patterns to follow

- **Data access** always goes through `WorkspaceRepository`, which has two implementations,
  Supabase and demo. Any new method must be added to both, plus `types.ts`.
- **Server actions** follow `resolveWorkspace(slug)` → permission check → validate with Zod →
  repository → `recordAudit` → return `{ ok: true, data } | { ok: false, error }`.
- **AI calls:** `getModelProvider()` (null → "not configured") → `aiQuotaError(context)` →
  `provider.generateStructured({ tier, system, input, schema, schemaName, maxOutputTokens })`
  → `meterAi(repository, usage, feature)`. Map `ProviderError` messages for the user.
- **Agents:** only `marketing_strategist`, `copywriter` and `graphic_designer` are active
  (`ACTIVE_AGENT_IDS`). To add one, follow `docs/AI_AGENT_ARCHITECTURE.md` → "Adding an agent".
  Exhaustive `never` switches flag every place that needs updating.
- **Creative:** the AI produces a `DesignSpec` (copy, layout name, palette, background). Then
  `composeDocument()` computes the geometry. Don't ask the AI for coordinates.
- **Every switch over a union or enum needs a `never` default.** No inline imports.
- UI: shadcn components, `PageContainer` / `PageHeader`, `EmptyState` / `NotConfigured` /
  `ConnectionRequired` / `ErrorState`, `DemoBadge`, brand accent via `variant="brand"`.

---

## 7. Database

Migrations are in `supabase/migrations/`; all are applied to the live project. New schema
changes go in a **new** timestamped file; never edit applied ones. Tables include
organizations, memberships, invitations, role_permissions, business_profiles,
brand_profiles, brand_assets, media_assets, creative_projects, conversations, messages,
agent_runs, agent_tasks, campaigns, content_items, publishing_jobs, connected_accounts,
private.integration_credentials, approval_requests (immutable payload),
ad_accounts, ad_campaigns, analytics_events, audit_logs (append-only), plans,
plan_entitlements, subscriptions, usage_records. Storage buckets: `media`, `brand-assets`
(private, keyed `<org_id>/…`). Details are in `docs/DATABASE_SCHEMA.md`.

---

## 8. Next work, in priority order

1. **Verify the untested live paths** (§9) in the user's signed-in workspace, and fix what breaks.
2. **Phase 4 — social connectors:**
   - Meta (Instagram Business + Facebook Pages) and YouTube OAuth adapters implementing
     `ProviderAdapter` in `src/lib/integrations/gateway.ts`.
   - Routes `/api/integrations/[provider]/{connect,callback,webhook}`, with state signed and
     bound to the org and user.
   - AES-256-GCM token encryption (`INTEGRATION_ENCRYPTION_KEY`).
   - "Schedule" in the planner → create `approval_request` (exact payload + hash) → on approval
     → `publishing_jobs` → worker (BullMQ + Redis) that calls `assertExecutable` before the API call.
   - Needs from the user: Meta developer app (App ID/secret, review for permissions), Google
     OAuth client with YouTube scope, Redis URL.
3. **Video Studio:** pick a provider, add an FFmpeg worker, generate Reels/Shorts.
4. **Phase 5:** Campaign Manager (the `campaigns` table exists), Analytics (real sources, an
   "estimate vs actual" flag already exists), SEO Studio (+ Search Console), Ads Manager
   (spend limits + approvals), remaining agents.
5. **Phase 6:** Razorpay subscriptions + webhooks, Sentry, Playwright smoke tests, security review.
6. **Nice-to-haves already noted:** conversation rename/delete, a DB trigger enforcing approval
   transitions, a materialised usage view, generated Supabase types replacing the Zod row parsing.

---

## 9. How to verify your work (required before you say "done")

1. `pnpm check` and `pnpm build` both pass with zero errors.
2. Test in a browser. The user's server is on :3000 (live, needs their login). Without a login,
   use the demo server on :3005 (§3).
3. Live checks still outstanding (ask the user to sign in, or have them run these):
   - Asset Library: upload a PNG/JPEG → it appears with a thumbnail → delete works.
   - Brand Intelligence: choose a logo from the library → save → the logo shows in the Studio Brand Kit.
   - Editor: Send to Planner → a draft with the image appears under "Unscheduled drafts".
   - Planner: Generate with AI → drafts appear in the chosen month.
4. Report honestly what you verified versus what you only typechecked.

---

## 10. Working agreements with the user

- Explain the plan briefly, then build. Keep changes focused and match existing code style.
- Don't commit unless asked (current changes are uncommitted on top of the initial Next commit).
- Ask before writing to remote shared state (DB migrations on the live Supabase, external APIs).
- Never echo `.env` values. Inspect key names only.
- If an external service blocks you (credits, credentials, app review), stop and tell the user
  exactly what's needed. Don't build a fake workaround.
