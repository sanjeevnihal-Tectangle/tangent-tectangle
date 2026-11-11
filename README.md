# Tangent — AI Marketing OS

**Think. Create. Execute. Grow.** Your entire marketing department. Powered by AI.

Tangent understands a business, plans its marketing, creates on-brand content and runs campaigns — with every
external action (publishing, ad launches, spend) gated behind explicit human approval.

## Quick start

```bash
pnpm install
cp .env.example .env.local   # optional — see below
pnpm dev                     # http://localhost:3000
```

With no environment variables, Tangent runs a **demo workspace** ("Saffron & Sage", a Bengaluru restaurant group).
All demo data is labelled; edits persist to `.tangent-demo/store.json` on your machine.

| To enable | Set |
| --- | --- |
| AI agents (Command Centre, intelligence generation) | `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` (automatic failover; check with `pnpm ai:check`) |
| Accounts, multi-tenant data, RLS (live mode) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` + run the migrations |

### Connecting Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then `supabase link --project-ref <ref>` and `supabase db push` to apply `supabase/migrations/`.
3. In Supabase Auth, enable Email and Google providers and add `http://localhost:3000/auth/callback` as a redirect URL.
4. Set the Supabase variables in `.env.local` and restart. `/` now leads to sign-in and workspace creation.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server (Turbopack) |
| `pnpm build` / `pnpm start` | Production build / server |
| `pnpm typecheck` | Route type generation + `tsc --noEmit` |
| `pnpm lint` | ESLint (Next.js + TypeScript rules) |
| `pnpm test` | Vitest unit tests |
| `pnpm check` | All of the above checks |
| `pnpm ai:check` | Live call through the AI provider chain; shows which provider answered |

## Documentation

- [Product overview](docs/PRODUCT_OVERVIEW.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database schema](docs/DATABASE_SCHEMA.md)
- [AI agent architecture](docs/AI_AGENT_ARCHITECTURE.md)
- [Integrations](docs/INTEGRATIONS.md)
- [Development roadmap](docs/DEVELOPMENT_ROADMAP.md)

## Brand assets

The logo in `public/brand/` is a **placeholder**. See [`public/brand/README.md`](public/brand/README.md) to install the official asset.
