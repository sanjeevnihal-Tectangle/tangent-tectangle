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
understand → retrieve context → plan → execute steps → validate → surface actions → present
```

1. **Understand / plan** — the fast model returns an `ExecutionPlan` (intent, task type, 1–4 steps assigned only to *active* agents, requested external actions, limitations).
2. **Retrieve context** — `loadBusinessContext` (sources are shown to the user).
3. **Normalise** — enforce `AI_MAX_STEPS_PER_RUN` and per-agent `maxCallsPerRun`; dropped steps become limitations.
4. **Execute** — steps run sequentially; each receives the business context, the user request, its instruction and the text of earlier outputs (so the Designer can build on the Copywriter). A failed step is reported and the run continues.
5. **Validate** — Zod parse (structured outputs), brand prohibited-phrase scan, budget sanity checks.
6. **External actions** — never executed. Each requested action is emitted as `action.required` (currently always `connection_required` because no connectors exist; once connected it becomes an approval request).
7. **Present** — the fast model streams a concise summary; detailed outputs render as typed cards.

Every run produces: an assistant message with the full run record, an `agent_runs` row with `agent_tasks`, a `usage_records` entry (AI credits = 1 per started 1,000 tokens) and an audit event.

## Streaming events

`run.started`, `stage` (understanding/context/planning/executing/validating/presenting × active/done), `context`, `plan`,
`step.started`, `step.completed` (typed output), `step.failed`, `validation`, `action.required`, `message.delta`,
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
- Never claim to have published, scheduled, launched, sent or spent anything.
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
