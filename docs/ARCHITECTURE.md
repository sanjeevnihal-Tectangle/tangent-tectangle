# Architecture

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack, **Cache Components** + Partial Prefetching), React 19 |
| Language | TypeScript (strict) |
| UI | Tailwind CSS 4, shadcn/ui (Radix, "nova" style), Lucide, Framer Motion, Recharts |
| Forms & validation | react-hook-form, Zod 4 (shared client/server schemas) |
| Data | Supabase Postgres + Auth + Storage, Row Level Security, SQL migrations |
| AI | OpenAI Responses API behind a provider abstraction; structured outputs via Zod |
| Tests | Vitest (unit); Playwright planned for smoke tests |

Deferred until their phase (documented, not installed): BullMQ + Redis (Phase 4 publishing jobs), FFmpeg (Phase 3 video),
LangGraph runtime (when multi-agent graphs need checkpoints/branching), Sentry (Phase 6), Razorpay SDK (Phase 6).

## Directory structure

```
src/
  app/
    (auth)/                 login, signup, forgot/reset password, workspaces, invite/[token]
    auth/callback/          PKCE code exchange (email confirm, recovery, Google OAuth)
    api/ai/command/         POST → NDJSON stream of orchestrator events
    w/[orgSlug]/            workspace shell (layout) + module pages
      [module]/             roadmap state for planned modules
  components/
    ui/                     shadcn primitives (themed by tokens)
    shell/                  sidebar, topbar, workspace switcher, command palette, notifications
    data/ states/ page/     stat cards, status pills, demo badge, empty/error/not-configured states
    brand/                  Tangent logo (placeholder geometry)
  features/<module>/        module UI + server actions (business, brand, command-centre, dashboard, approvals, team, auth,
                            workspaces, studio (+ editor/), assets, planner, copy)
  components/creative/      design renderer (HTML/CSS, native px), thumbnails, design fonts
  lib/creative/             formats, design document schema, layout engine, templates
  lib/
    ai/                     provider, orchestrator, agents (definitions + handlers), context, plan, validation, events, outputs
    approvals/engine.ts     approval state machine, payload hashing, execution gate
    auth/                   permissions (roles → permissions), auth server actions
    billing/plans.ts        plan catalogue, entitlements, credit metering
    data/                   WorkspaceRepository interface + Supabase and demo implementations
    demo/                   all demonstration fixtures (one place)
    domain/                 shared types and Zod schemas
    env/                    validated env (public vs server-only)
    integrations/           provider registry + Integration Gateway contract
    supabase/               server client, proxy session refresh
    workspace/server.ts     request-scoped workspace resolution (tenant isolation)
  proxy.ts                  (Next 16 "middleware") session refresh + route protection
supabase/migrations/        versioned schema, RLS, seed data
tests/                      Vitest unit tests
```

## Request flow and tenancy

1. `proxy.ts` refreshes the Supabase session cookie. Unauthenticated requests to `/w/*` redirect to `/login`. In demo mode, `/` redirects to `/w/demo/overview`.
2. `app/w/[orgSlug]/layout.tsx` renders a static shell skeleton and streams the real shell behind `<Suspense>` (required by Cache Components for request-time data).
3. `resolveWorkspace(orgSlug)` (React `cache`d per request) reads the user from the session, loads memberships, 404s when the user is not a member, and returns `{ context, repository }`. **Organization ids never come from the client.**
4. The repository uses the user's Supabase session, so every query is also constrained by RLS (defence in depth).
5. Pages are thin: a static header plus an async loader inside `<Suspense>` with a skeleton fallback.

## Modes

| | Demo | Live |
| --- | --- | --- |
| Trigger | Supabase env vars absent | Supabase env vars present |
| Workspace | `/w/demo` only | user's memberships |
| Persistence | `.tangent-demo/store.json` (falls back to memory on read-only FS) | Supabase |
| Auth pages | Explain that Supabase is required | Email, Google, recovery |
| Labelling | `Demo workspace` badge + `Demo data` / `Sample` badges | Demo badges only where data is still sample (dashboard until connectors) |

## Server/client boundary

- `server-only` guards: env (server), Supabase server client, repositories, AI provider/orchestrator/context, integration gateway, workspace resolver.
- Client components receive a serializable `WorkspaceContext` (no secrets) via `WorkspaceProvider`.
- Mutations are Server Actions that re-resolve the workspace and re-check permissions on every call.
- The Command Centre uses a Route Handler for streaming (`application/x-ndjson`).

## Creative pipeline

```
brief ─► Graphic Designer (concepts) ─► design spec (copy, layout, palette, background) ─► layout engine ─► design document
                                                                                                  │
         editor (layers, history, autosave) ◄──────────────────────────────────────────────────────┘
                 │
                 ├─► PNG export in the browser (html-to-image, native resolution)
                 └─► Send to Planner: PNG pages → media assets → draft content item
```

The AI never emits coordinates: it chooses copy, a named layout and palette colours, and `composeDocument` computes geometry,
so every design is well-formed for every format. Palettes are validated (hex + WCAG contrast) and repaired from the brand.
Images are referenced by media asset id; signed URLs are resolved per request.

## Error, loading and empty states

- Every async page section has a skeleton fallback; workspace routes have an `error.tsx` boundary.
- Shared state components: `EmptyState`, `NotConfigured` (lists required env vars), `ConnectionRequired`, `ErrorState`.
- Provider errors are mapped to user-safe messages (`describeProviderError`); unexpected errors are logged server-side.

## Security notes

- Secrets are server-only env vars validated with Zod; nothing secret is prefixed `NEXT_PUBLIC_`.
- OAuth tokens: encrypted, stored in `private.integration_credentials` (not exposed via the Data API).
- Audit log is append-only at the database level (trigger) and written through `log_audit_event` with the caller as actor.
- Approval payloads are immutable (trigger); executors must call `assertExecutable` with the exact payload.
- Redirect targets (`next`) are restricted to same-origin relative paths.

## Testing and quality gates

`pnpm check` runs typecheck (with route type generation), ESLint and Vitest. Critical logic covered by unit tests:
approval engine, entitlements and credits, permissions, plan normalisation, run-event reducer, output validation, schemas.
