import "server-only"

import { ACTIVE_AGENT_IDS, AGENTS } from "@/lib/ai/agents/definitions"
import { outputToText, runAgentTask, SHARED_RULES } from "@/lib/ai/agents/handlers"
import { loadBusinessContext } from "@/lib/ai/context"
import type { RequiredAction, RunEvent } from "@/lib/ai/events"
import { executionPlanSchema } from "@/lib/ai/outputs"
import { normalizePlan } from "@/lib/ai/plan"
import { ProviderError, type ModelProvider, type TokenUsage } from "@/lib/ai/provider"
import { validateOutputs } from "@/lib/ai/validation"
import { EXTERNAL_ACTION_LABELS } from "@/lib/approvals/engine"
import type { AgentRunLog, WorkspaceRepository } from "@/lib/data/types"
import type { RunRecord, StoredMessage } from "@/lib/domain/conversations"

export interface OrchestratorInput {
  provider: ModelProvider
  repository: WorkspaceRepository
  conversationId: string
  history: StoredMessage[]
  message: string
  maxSteps: number
  signal?: AbortSignal
}

export interface OrchestratorResult {
  run: RunRecord
  text: string
  usage: TokenUsage
  log: AgentRunLog
}

const PLANNER_SYSTEM = `${SHARED_RULES}

You are the Tangent Orchestrator. Turn the user's request into an execution plan for specialist agents.
Available agents (only these can be assigned):
${ACTIVE_AGENT_IDS.map((id) => `- ${id}: ${AGENTS[id].summary}`).join("\n")}

Planning rules:
- Use the fewest steps that fully answer the request (usually 1–3). Order steps so later steps can build on earlier ones.
- Requests to publish, schedule, launch ads, change budgets/targeting, send messages or delete content are external actions:
  list them in externalActions. They are never executed automatically; plan the drafts they need instead.
- Put anything that needs unavailable capabilities (live analytics, competitor scraping, SEO crawling, video production,
  publishing) in limitations, and plan the best draft-level help you can.`

const PRESENTER_SYSTEM = `${SHARED_RULES}

You are Tangent presenting the work of the marketing team to the user. Write a concise response (80–180 words):
what was produced, the key recommendation, anything that needs attention (validation issues, limitations) and the next step.
The detailed outputs are shown to the user as cards, so do not repeat them in full.
Plain text only: short paragraphs and "- " bullets; **bold** sparingly. No headings, no tables.`

function historyText(history: StoredMessage[]): string {
  return history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "User" : "Tangent"}: ${m.text.slice(0, 1200)}`)
    .join("\n")
}

function addUsage(total: TokenUsage, next: TokenUsage): TokenUsage {
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
  }
}

/**
 * Runs one Command Centre request: understand → retrieve context → plan →
 * execute agent tasks → validate → present. External actions are surfaced for
 * approval and never executed here. Yields progress events as it goes.
 */
export async function* runOrchestrator(
  input: OrchestratorInput
): AsyncGenerator<RunEvent, OrchestratorResult> {
  const { provider, repository, message, signal } = input
  const runId = crypto.randomUUID()
  const startedAt = new Date()
  const today = startedAt.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }

  const run: RunRecord = {
    runId,
    status: "completed",
    intent: null,
    taskType: null,
    steps: [],
    contextSources: [],
    outputs: [],
    validation: [],
    actions: [],
    limitations: [],
    error: null,
    durationMs: null,
  }
  const tasks: AgentRunLog["tasks"] = []
  const modelsUsed = new Set<string>()

  const finish = (text: string): OrchestratorResult => {
    const completedAt = new Date()
    run.durationMs = completedAt.getTime() - startedAt.getTime()
    return {
      run,
      text,
      usage,
      log: {
        runId,
        conversationId: input.conversationId,
        status: run.status,
        intent: run.intent,
        taskType: run.taskType,
        model: modelsUsed.size ? [...modelsUsed].join(", ") : null,
        usage,
        error: run.error,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        tasks,
      },
    }
  }

  yield { type: "run.started", runId, conversationId: input.conversationId, startedAt: startedAt.toISOString() }

  try {
    yield { type: "stage", stage: "understanding", status: "active" }
    yield { type: "stage", stage: "understanding", status: "done" }

    yield { type: "stage", stage: "context", status: "active" }
    const context = await loadBusinessContext(repository)
    run.contextSources = context.sources
    yield { type: "context", sources: context.sources }
    yield { type: "stage", stage: "context", status: "done" }

    yield { type: "stage", stage: "planning", status: "active" }
    const planResult = await provider.generateStructured({
      tier: "fast",
      system: PLANNER_SYSTEM,
      input: [
        `Today: ${today}`,
        `## Business context\n${context.text}`,
        input.history.length ? `## Conversation so far\n${historyText(input.history)}` : null,
        `## New request\n${message}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: executionPlanSchema,
      schemaName: "execution_plan",
      maxOutputTokens: 2000,
      signal,
    })
    usage = addUsage(usage, planResult.usage)
    modelsUsed.add(planResult.model)
    const plan = planResult.data
    const { steps, dropped } = normalizePlan(plan, input.maxSteps)
    run.intent = plan.intent
    run.taskType = plan.taskType
    run.steps = steps.map(({ instruction: _instruction, ...step }) => step)
    run.limitations = [
      ...plan.limitations,
      ...dropped.map((title) => `Skipped "${title}" to stay within per-run agent limits.`),
    ]
    yield { type: "plan", intent: plan.intent, taskType: plan.taskType, steps: run.steps, limitations: run.limitations }
    yield { type: "stage", stage: "planning", status: "done" }

    yield { type: "stage", stage: "executing", status: "active" }
    const produced: { output: (typeof run.outputs)[number]["output"]; text: string; title: string }[] = []
    let failedSteps = 0
    for (const [index, step] of steps.entries()) {
      signal?.throwIfAborted()
      yield { type: "step.started", stepId: step.id }
      try {
        const result = await runAgentTask(
          provider,
          step.agentId,
          {
            userRequest: message,
            instruction: step.instruction,
            businessContext: context.text,
            priorOutputs: produced.map((p) => `### ${p.title}\n${p.text}`).join("\n\n"),
            today,
          },
          signal
        )
        usage = addUsage(usage, result.usage)
        modelsUsed.add(result.model)
        const text = outputToText(result.output)
        produced.push({ output: result.output, text, title: step.title })
        run.outputs.push({ stepId: step.id, agentId: step.agentId, title: step.title, output: result.output })
        tasks.push({ sequence: index + 1, agentId: step.agentId, title: step.title, instruction: step.instruction, status: "completed", output: result.output, error: null })
        yield { type: "step.completed", stepId: step.id, output: result.output }
      } catch (error) {
        if (signal?.aborted) throw error
        failedSteps += 1
        const reason = error instanceof ProviderError ? error.message : "The agent could not complete this step."
        tasks.push({ sequence: index + 1, agentId: step.agentId, title: step.title, instruction: step.instruction, status: "failed", output: null, error: reason })
        yield { type: "step.failed", stepId: step.id, message: reason }
      }
    }
    yield { type: "stage", stage: "executing", status: "done" }

    yield { type: "stage", stage: "validating", status: "active" }
    run.validation = validateOutputs(produced, failedSteps, context.brand?.prohibitedMessaging ?? [])
    yield { type: "validation", checks: run.validation }
    for (const action of plan.externalActions) {
      const required: RequiredAction = {
        actionType: action.actionType,
        platform: action.platform,
        description: action.description || EXTERNAL_ACTION_LABELS[action.actionType],
        // No provider connectors are live yet, so every external action is blocked on a connection.
        state: "connection_required",
      }
      run.actions.push(required)
      yield { type: "action.required", action: required }
    }
    yield { type: "stage", stage: "validating", status: "done" }

    yield { type: "stage", stage: "presenting", status: "active" }
    let text = ""
    for await (const chunk of provider.streamText({
      tier: "fast",
      system: PRESENTER_SYSTEM,
      input: [
        `## User request\n${message}`,
        `## Plan\n${plan.intent}`,
        produced.length
          ? `## Outputs\n${produced.map((p) => `### ${p.title}\n${p.text}`).join("\n\n")}`
          : "## Outputs\nNo outputs were produced.",
        `## Validation\n${run.validation.map((c) => `${c.label}: ${c.status} — ${c.detail}`).join("\n")}`,
        run.actions.length
          ? `## External actions requested (NOT executed; require a connected account and approval)\n${run.actions.map((a) => `${a.platform}: ${a.description}`).join("\n")}`
          : null,
        run.limitations.length ? `## Limitations\n${run.limitations.join("\n")}` : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
      maxOutputTokens: 800,
      signal,
    })) {
      if (chunk.type === "delta") {
        text += chunk.text
        yield { type: "message.delta", text: chunk.text }
      } else {
        usage = addUsage(usage, chunk.usage)
        modelsUsed.add(chunk.model)
      }
    }
    yield { type: "stage", stage: "presenting", status: "done" }

    if (failedSteps > 0 && produced.length === 0) {
      run.status = "failed"
      run.error = { code: "provider_error", message: "All agent steps failed." }
    }
    const result = finish(text)
    yield { type: "run.completed", durationMs: run.durationMs ?? 0, usage }
    return result
  } catch (error) {
    run.status = "failed"
    run.error = {
      code: error instanceof ProviderError ? "provider_error" : "internal_error",
      message: error instanceof ProviderError ? error.message : "Something went wrong while running the agents.",
    }
    if (!(error instanceof ProviderError)) console.error("[tangent] orchestrator error", error)
    yield { type: "run.failed", code: run.error.code, message: run.error.message }
    return finish("")
  }
}
