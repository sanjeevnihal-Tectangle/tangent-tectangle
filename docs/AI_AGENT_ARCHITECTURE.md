# AI Agent Architecture

Tangent does **not** run eleven independent chatbots. One orchestrator plans each request and dispatches steps to
specialised task handlers that share the same business context, schemas, limits and logging.

## Components

| File | Responsibility |
| --- | --- |
| `lib/ai/provider-types.ts` | `ModelProvider` interface (structured generation + text streaming), `ProviderError` with failure kinds |
| `lib/ai/providers/openai.ts` | OpenAI Responses API (`zodTextFormat`), tiers `AI_MODEL_FAST` / `AI_MODEL_REASONING` |
| `lib/ai/providers/anthropic.ts` | Anthropic Messages API (`zodOutputFormat`), tiers `ANTHROPIC_MODEL_FAST` / `ANTHROPIC_MODEL_REASONING` |
| `lib/ai/providers/fallback.ts` | Failover across providers + in-process provider health (cooldowns) |
| `lib/ai/provider.ts` | Builds the failover chain from configured keys and `AI_PROVIDER_ORDER` |
| `lib/ai/context.ts` | Business context retrieval: business profile + **approved** intelligence sections + default brand profile → compact context block + source list |
| `lib/ai/agents/definitions.ts` | Registry of all 11 agents: responsibilities, tools, max operation scope, limits, status/phase (client-safe) |
| `lib/ai/agents/handlers.ts` | Per-agent instructions, model tier, output schema; shared rules; `runAgentTask` (exhaustive over active agents) |
| `lib/ai/outputs.ts` | Zod schemas: execution plan, strategy, copy, creative (all fields required → strict JSON schema) |
| `lib/ai/plan.ts` | `normalizePlan`: global step cap + per-agent call limits |
| `lib/ai/validation.ts` | Post-generation checks: schema success, prohibited phrases, budget allocation sums |
| `lib/ai/orchestrator.ts` | The run pipeline (async generator yielding `RunEvent`s) |
| `lib/ai/events.ts` | Typed event union streamed to the client |
| `lib/integrations/connections.ts` | Live connection status per platform (from `connected_accounts`, no tokens) → planner/agent context and approval targeting |
| `lib/publishing/prepare.ts` | Turns requested external actions into approval-ready payloads on connected accounts, or explains why not |
| `lib/publishing/executor.ts` | Approve → `assertExecutable` → claim (`approved→executing`) → decrypt token → Meta Graph API → record result |
| `features/command-centre/action-cards.tsx` + `actions.ts` | Approval cards (Approve & publish / Reject / Retry) and generated-image previews |
| `app/api/ai/command/route.ts` | Auth, permission (`ai.run`), entitlement check, conversation persistence, NDJSON streaming, run/usage/audit logging |

## Provider failover

Both OpenAI and Anthropic implement the same `ModelProvider` interface and the same Zod schemas, so agents don't
know which vendor answered. `getModelProvider()` wraps every provider that has a key, in `AI_PROVIDER_ORDER`
(default `openai,anthropic`; set `anthropic,openai` to prefer Claude):

| Failure | Behaviour | Provider skipped for |
| --- | --- | --- |
| No credits (`quota`), key rejected (`auth`) | Next provider | 10 minutes |
| Rate limited, 5xx / overloaded / network (`rate_limit`, `unavailable`) | Next provider | 30 seconds |
| Invalid request / unparseable output | Next provider | — |
| User pressed Stop (`cancelled`) | Stop, no failover | — |

Streams only fail over **before** the first text delta, so a response is never stitched from two models. If every
provider fails, the error lists each provider's reason. Skipped providers are still tried last, so a cooldown never
blocks a request outright. Every run logs the models that actually answered (`agent_runs.model`).
`pnpm ai:check` exercises the chain live.

| Tier | OpenAI default | Anthropic default |
| --- | --- | --- |
| fast (planning, copy, creative, summaries) | `gpt-5-mini` | `claude-haiku-5-5` |
| reasoning (strategy, intelligence profile) | `gpt-5` | `claude-sonnet-5-5` |

## Run pipeline

```
understand → retrieve context (+ connections) → plan → execute agent + tool steps → validate → approval cards → present
```

1. **Understand / plan** — the fast model returns an `ExecutionPlan` (intent, `requestBrief` — every specific the user asked for, in their words — task type, 1–4 steps assigned only to *active* agents, requested external actions, `produceImage`, limitations). Every agent receives the request plus `requestBrief`. `productNames` names the catalogue product the request is about; the run then reloads context with that product's details and **its own brand kit** (falling back to the company's default kit). The composer's **Brand kit / Product pickers** override this: a picked product skips detection, a picked kit wins over the product's kit, and "No specific product" disables detection. A post planned for Instagram always sets `produceImage`.
2. **Retrieve context** — `loadBusinessContext` (business profile, products & services catalogue, approved intelligence, brand kit incl. visual style) plus the workspace's connected accounts (`summarizeConnections`), so the planner and every agent see which platforms are connected and ready (sources are shown to the user).
3. **Normalise** — enforce `AI_MAX_STEPS_PER_RUN` and per-agent `maxCallsPerRun`; dropped steps become limitations.
4. **Execute** — steps run sequentially; each receives the business context, the user request, its instruction and the text of earlier outputs (so the Designer can build on the Copywriter). A failed step is reported and the run continues.
5. **Validate** — Zod parse (structured outputs), brand prohibited-phrase scan, budget sanity checks.
6. **Tool steps** (shown in the plan with the agent they belong to):
   - *Generate image* (Graphic Designer, when `produceImage`): renders the designer's first concept with `getImageProvider()` as a JPEG (Instagram only accepts JPEG; square when Instagram is a target), saves it to the Asset Library (`source: ai_generated`), meters `image_generations_monthly`, emits `asset.generated`.
   - *Image* follows the brand kit's visual style: the product's own catalogue image when the request is about a product that has one; otherwise a photo, flat illustration or 3D render (brand colours in the prompt); none for "graphic" brands.
   - *Build the editable design* (Graphic Designer, after all agent steps, with or without an image): `createAgentDesign` asks the fast model for a `DesignSpec` (layout, headline, CTA, badge, brand palette) (plus feature callouts with icons, pattern, decoration and image treatment) from the request, concept, final copy and the brand's visual style, composes it with the layout engine (brand fonts, corner style, icons, patterns, blobs/circles/lines/frame, framed or full-bleed image, logo), and saves it as a Creative Studio project (`creative_projects`, editable in the Studio). Emits `creative.created`. If it fails, the post falls back to the raw image.
   - *Prepare posts for approval* (Social Media Manager, when external actions were requested): `prepareExternalActions` picks the connected account, caption (copy variant for that platform) and image; brand-validation failures block it. Each ready post becomes an `approval_request` with the exact payload and an `action.required` event in state `awaiting_approval`. Otherwise the state is `connection_required`, `blocked` (with the reason) or `unsupported` (ads/spend, scheduling, platforms without a publisher).
7. **Execute on approval** — nothing is posted during the run. The approval card's **Approve & publish** (or approving on the Approvals page) calls `approveAndPublish`, which requires `content.publish`, re-checks the payload hash, claims the request (`approved → executing`, compare-and-set so it can't run twice), decrypts the token server-side and publishes through the Meta Graph API. The card shows the post link/ID or Meta's error; failed posts can be retried as a new approval version.
   Posts with a Creative Studio design (`creativeProjectId`, `designRendered: false`) can't be executed directly: the card shows the current design with **Edit in Creative Studio**, and **Approve & publish** renders the latest design in the browser (same renderer as the Studio, JPEG), uploads it, creates a new approval version whose payload points at that exact image (`designRendered: true`) and publishes it (`publishDesign`).
8. **Present** — the fast model streams a concise summary using the actual tool results; detailed outputs render as typed cards.

Every run produces: an assistant message with the full run record, an `agent_runs` row with `agent_tasks`, a `usage_records` entry (AI credits = 1 per started 1,000 tokens) and an audit event.

## Streaming events

`run.started`, `stage` (understanding/context/planning/executing/validating/presenting × active/done), `context`, `plan`,
`step.started`, `step.completed` (typed output), `step.failed`, `tool.completed`, `asset.generated`, `creative.created`, `validation`, `action.required`, `message.delta`,
`run.completed` (usage, duration), `run.failed`. The client reduces them with `applyRunEvent` (pure, unit-tested) —
users see meaningful progress, not a spinner.

## Agents

| Agent | Status | Tier | Output |
| --- | --- | --- | --- |
| Marketing Strategist | Active | reasoning | `strategy` (objectives, pillars, channel plan, timeline, risks, next steps); also generates the intelligence profile |
| Copywriter | Active | fast | `copy` (platform variants with headline, body, CTA, hashtags, suggested date) |
| Graphic Designer | Active | fast | `creative` (concepts with visual direction, composition, brand colour usage, overlay, image prompt) |
| Market Research | Phase 5 | — | — |
| Brand Strategist | Phase 3 | — | — |
| Video Creator | Phase 3 | — | — |
| SEO Specialist | Phase 5 | — | — |
| Social Media Manager | Phase 4 | — | may request `execute` actions (approval required) |
| Performance Marketing Specialist | Phase 5 | — | may request spend actions (approval required) |
| Growth Marketer | Phase 5 | — | — |
| Marketing Analyst | Phase 5 | — | — |

### Adding an agent

1. Set `status: "active"` in `definitions.ts` and add its id to `ACTIVE_AGENT_IDS`.
2. Add an output schema to `outputs.ts` and a variant to `AgentOutput`.
3. Add instructions + a `case` in `runAgentTask` and `outputToText` (TypeScript's exhaustive `never` checks will flag every place that needs handling, including UI cards).
4. Add an output card in `features/command-centre/output-cards.tsx`.

## Safety rules (shared system prompt)

- Use business/brand context; never use prohibited phrases.
- Never claim to have published, scheduled, launched, sent or spent anything (publishing happens only after approval).
- Trust the connected-platform status in the context; never say Tangent can't see integrations.
- Never invent metrics; label estimates.
- Indian conventions by default (₹, lakh/crore, festivals, local platforms).

## Operation scopes

| Scope | Meaning | Gate |
| --- | --- | --- |
| READ | Read permitted business and marketing data | Role permissions + RLS |
| CREATE | Drafts, designs, plans | `ai.run` + entitlements |
| EXECUTE | External side effects | Approval request of the exact payload (`assertExecutable`) |

## LangGraph compatibility

The orchestrator is a linear graph whose nodes map 1:1 to LangGraph nodes (`plan`, `agent_step`, `validate`, `present`)
over a serialisable state (`RunRecord`). Moving to `@langchain/langgraph` for branching, parallel steps, retries and
checkpointing changes the runtime, not the agent handlers, schemas or events.

## Limits

- Per-run: `AI_MAX_STEPS_PER_RUN` (default 4) and per-agent `maxCallsPerRun`.
- Per-agent `maxOutputTokens`.
- Per-workspace monthly AI credits (`ai_credits_monthly` entitlement), checked before each run with an upper-bound reservation.
- Provider timeouts (120 s) and retries (2); requests are cancellable from the UI (Stop) via `AbortSignal`.

## Brand kits in Creative Studio

- The create wizard has the same Brand kit / Product pickers; ideas, concepts, the composed design and blank canvases all use the chosen kit (or the product's kit when the kit is "Automatic").
- The design editor has a **Brand kit** switcher. `applyBrandKit` (`lib/creative/rebrand.ts`) re-skins the existing design without losing edits: brand colours swap role for role (tints/shades keep their offset), text contrast is re-checked, brand fonts, icon style and corners are re-applied and the logo is replaced (hidden if the new kit has none). It is one undo step; the project's `brandProfileId` is saved with the design.
