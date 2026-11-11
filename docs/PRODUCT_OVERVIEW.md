# Tangent — Product Overview

**Tagline:** Your entire marketing department. Powered by AI.
**Philosophy:** Think. Create. Execute. Grow.

Tangent is an AI Marketing Operating System. It is not a chatbot, a content generator or a scheduler on its own —
it is one workspace where a business owner explains their business once, and a coordinated team of AI specialists
plans strategy, creates content, prepares campaigns and analyses performance, with humans approving every external action.

Initial market: India (INR, Indian festivals and seasons, local platforms). Architecture: global-ready (multi-tenant,
provider-agnostic AI and integrations, configurable plans).

## Core principles

1. **One business context.** Every module and agent reads the same business profile, approved intelligence and brand profile.
2. **Human-approved execution.** AI can read and create drafts; anything external (publish, launch, spend, delete) requires approval of the exact version.
3. **Honesty over theatre.** No fake connections, no fake AI output, no unlabelled demo data. Missing credentials produce explicit "not configured" / "connection required" states.
4. **Premium, information-dense UX.** Original design language (see below), meaningful progress states, purposeful motion.

## Modules

| # | Module | Status |
| --- | --- | --- |
| 01 | Overview Dashboard | ✅ Built (demo data, labelled) |
| 02 | AI Command Centre | ✅ Built (orchestrator + 3 agents, streaming progress) |
| 03 | Marketing Intelligence (Marketing Strategy) | ✅ Built (onboarding, AI profile, per-section approval) |
| 04 | Brand Intelligence | ✅ Built (multiple profiles, logo from Asset Library, palette, voice, guardrails) |
| 05 | Creative Studio | ✅ Built (guided AI flow, 16 formats, 11 brand-styled templates, editor, carousels, variations, resize, PNG export, Copy Studio); Video Studio next |
| 06 | Content Planner | ✅ Built (month/week/day/list, approval workflow, AI monthly calendars); scheduling/publishing needs Phase 4 connectors |
| — | Asset Library | ✅ Built (private uploads, AI-image history, search, picker everywhere) |
| 07 | Social Media Management | Phase 4 |
| 08 | Campaign Manager | Phase 5 |
| 09 | SEO Studio | Phase 5 |
| 10 | Ads Manager | Phase 5 |
| 11 | Analytics & Insights | Phase 5 |
| 12 | Integrations | ✅ Gateway contract + honest status; connectors ship per phase |
| 13 | AI Agent Management | ✅ Registry view (11 agents, 3 active) |
| 14 | Workspace & Settings | ✅ Auth, workspaces, roles, invitations, plan & usage, audit history |

Planned modules render a roadmap state (capabilities, what's already in place, required connections) and a
"Try it in Command Centre" action where the active agents can already help.

## Users and roles

Owner, Admin, Marketer, Designer, Analyst, Viewer. Permissions are data (`role_permissions`) mirrored in
`src/lib/auth/permissions.ts` and enforced both server-side and through Postgres row-level security.

## Plans (initial)

| Plan | Price | Notes |
| --- | --- | --- |
| Starter | ₹1,999/month | Single location |
| Growth | ₹4,999/month | Multi-channel |
| Professional | ₹9,999/month | Teams |
| Agency | Custom | Contract-defined entitlements |

Limits are configuration (`plans` / `plan_entitlements`), checked via `checkEntitlement`. Ad spend is never billed through Tangent.

## Design language

- Neutral, very slightly warm foundation; near-black primary (matches the logo); **Signal Orange** brand accent reserved for AI surfaces, active state, focus and key data.
- Space Grotesk for headings, Inter for interface text, tabular numerals for metrics.
- Light and dark themes via CSS variables (`src/app/globals.css`); 0.5rem base radius; minimal shadows and gradients.
- Logo: isometric cube outline forming a T — black on light, white on dark. Current asset is a placeholder (`public/brand/`).

## Demo mode

Without Supabase, Tangent serves one demo workspace (`/w/demo`). Every surface that shows sample data carries a
"Demo data" / "Sample" badge, and edits are stored locally in `.tangent-demo/store.json`.
