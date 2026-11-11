import type { ExternalActionType } from "@/lib/approvals/engine"
import type { ActiveAgentId } from "@/lib/ai/agents/definitions"
import type { AgentOutput, TaskType } from "@/lib/ai/outputs"

export const RUN_STAGES = [
  "understanding",
  "context",
  "planning",
  "executing",
  "validating",
  "presenting",
] as const
export type RunStage = (typeof RUN_STAGES)[number]

export const RUN_STAGE_LABELS: Record<RunStage, string> = {
  understanding: "Understanding request",
  context: "Retrieving business context",
  planning: "Creating execution plan",
  executing: "Agents working",
  validating: "Validating outputs",
  presenting: "Preparing response",
}

export interface PlannedStep {
  id: string
  agentId: ActiveAgentId
  title: string
}

export interface ValidationCheck {
  label: string
  status: "pass" | "warn" | "fail"
  detail: string
}

export interface RequiredAction {
  actionType: ExternalActionType
  platform: string
  description: string
  /** Why it cannot run immediately. Execution always needs approval. */
  state: "connection_required" | "awaiting_approval"
}

/** Newline-delimited JSON events streamed from /api/ai/command. */
export type RunEvent =
  | { type: "run.started"; runId: string; conversationId: string; startedAt: string }
  | { type: "stage"; stage: RunStage; status: "active" | "done" }
  | { type: "context"; sources: { label: string; detail: string }[] }
  | {
      type: "plan"
      intent: string
      taskType: TaskType
      steps: PlannedStep[]
      limitations: string[]
    }
  | { type: "step.started"; stepId: string }
  | { type: "step.completed"; stepId: string; output: AgentOutput }
  | { type: "step.failed"; stepId: string; message: string }
  | { type: "validation"; checks: ValidationCheck[] }
  | { type: "action.required"; action: RequiredAction }
  | { type: "message.delta"; text: string }
  | {
      type: "run.completed"
      durationMs: number
      usage: { inputTokens: number; outputTokens: number }
    }
  | { type: "run.failed"; code: string; message: string }

export type RunErrorCode =
  | "ai_not_configured"
  | "forbidden"
  | "quota_exceeded"
  | "invalid_request"
  | "provider_error"
  | "internal_error"
