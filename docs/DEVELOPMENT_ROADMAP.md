# Development Roadmap

Status as of the first implementation slice. ✅ done · 🟡 partial · ⬜ not started.

## Phase 1 — Foundation

| Item | Status | Notes |
| --- | --- | --- |
| Project setup (Next 16, TS strict, Tailwind 4, shadcn, Vitest, ESLint) | ✅ | `pnpm check` passes; production build passes |
| Design system (tokens, light/dark, Space Grotesk + Inter, Signal Orange) | ✅ | `src/app/globals.css` |
| Logo | 🟡 | Placeholder geometry; replace with official asset (`public/brand/README.md`) |
| Application shell (collapsible sidebar, switcher, notifications, usage, profile, ⌘K) | ✅ | |
| Authentication (email, Google, recovery, callback) | ✅ | Needs Supabase project + provider config to exercise |
| Workspaces (create, switch, URL-scoped tenancy) | ✅ | |
| Team invitations + roles | ✅ | Invite links (no email delivery yet) |
| Business onboarding | ✅ | 5-step validated wizard |
| Brand Intelligence | 🟡 | Profiles, palette, typography, voice, messaging, guardrails ✅; logo/asset upload ⬜ (Phase 3 with Asset Library) |
| Supabase schema, RLS, migrations | ✅ | Not yet applied to a live project |

## Phase 2 — AI Core

| Item | Status |
| --- | --- |
| AI Command Centre UI (history, thread, composer, context panel, approvals) | ✅ |
| Orchestrator with streamed progress | ✅ |
| Marketing Strategist, Copywriter, Graphic Designer | ✅ |
| Business context retrieval | ✅ |
| Task execution tracking (`agent_runs`, `agent_tasks`, usage, audit) | ✅ |
| Marketing Intelligence generation + per-section approval | ✅ |
| Conversation rename/delete, run retry, saving outputs to projects | ⬜ |

## Phase 3 — Creative Studio

| Item | Status | Notes |
| --- | --- | --- |
| Guided creation (objective → format → brief → AI concepts → AI design) | ✅ | Graphic Designer concepts + design spec; deterministic layout engine |
| Formats (16) incl. carousels, stories, Reel/Shorts covers, thumbnails, ads, banners, poster | ✅ | `src/lib/creative/formats.ts` |
| Template library (11, styled live with the brand) | ✅ | `src/lib/creative/templates.ts` |
| Editor: canvas, layers, text, shapes, images, backgrounds, drag/resize, snapping, undo/redo, autosave | ✅ | |
| Carousel pages, resize to another format, AI variations | ✅ | |
| PNG export (native resolution, client-side) | ✅ | html-to-image |
| Asset Library (private Supabase Storage, signed URLs) + picker; brand logo from library | ✅ | |
| AI image generation (OpenAI gpt-image) | 🟡 | Implemented behind `IMAGE_PROVIDER=openai`; untested live — OpenAI account has no credits |
| Copy Studio | ✅ | |
| Video Studio (Reels/Shorts generation, FFmpeg) | ⬜ | Needs a video provider |
| Brand Strategist / Video Creator agents | ⬜ | |

## Phase 4 — Content and Social

| Item | Status | Notes |
| --- | --- | --- |
| Content calendar: month/week/day/list, filters, unscheduled drafts | ✅ | |
| Draft → In review → Approved workflow (approver permission; edits after approval reset to draft) | ✅ | |
| AI monthly calendar generation | ✅ | Saved as drafts |
| Send to Planner from Creative Studio (exports pages as media) | ✅ | |
| Meta (Instagram/Facebook) + YouTube OAuth adapters, encrypted credentials | ⬜ | Needs Meta app + Google OAuth credentials |
| Scheduling → approval request → publishing jobs (BullMQ/Redis) | ⬜ | Schedule button explains connection requirement |
| Social Media Manager agent | ⬜ | |

## Phase 5 — Marketing Intelligence
SEO Studio (+ Search Console), Analytics & Insights with real sources, Campaign Manager, Ads Manager (Meta/Google, spend limits),
competitor intelligence, remaining agents (Market Research, SEO, Performance, Growth, Analyst), LangGraph runtime if branching is needed.

## Phase 6 — Commercial launch
Razorpay subscriptions + webhooks, usage management UI, Sentry + structured logging, security review, Playwright smoke tests, beta launch.

## Immediate next steps

1. Add OpenAI credits and set `IMAGE_PROVIDER=openai` to enable AI image generation (then verify end to end).
2. Create a Meta developer app and Google OAuth client; build the Instagram/Facebook/YouTube adapters and the scheduling → publishing pipeline.
3. Install the official logo.
4. Playwright smoke tests: onboarding, brand save, template → editor → export, planner workflow, streamed Command Centre run (mocked provider).
5. Video Studio (provider choice + FFmpeg worker).

## Known limitations of this slice

- Dashboard metrics are demo data in both modes until analytics connectors exist (always labelled).
- Approving an action records the decision but nothing executes — no connectors yet (by design; the UI says so).
- Usage snapshot sums the month's `usage_records` per request; move to a materialised view or RPC at scale.
- `approval_requests` transition validity is enforced in application code; a database trigger for allowed transitions is a hardening follow-up.
