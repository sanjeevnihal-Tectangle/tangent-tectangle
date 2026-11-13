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
  /** "tool" steps call platform tools (image generation, publishing prep) instead of a model. Absent = agent. */
  kind?: "agent" | "tool"
}

/** An editable Creative Studio design an agent built. */
export interface GeneratedCreative {
  stepId: string
  projectId: string
  name: string
  formatId: string
  width: number
  height: number
}

/** An image an agent generated and saved to the Asset Library. */
export interface GeneratedAsset {
  stepId: string
  assetId: string
  name: string
  /** Short-lived signed URL; refreshed by the client when it expires. */
  url: string | null
  prompt: string
  width: number | null
  height: number | null
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
  /**
   * - connection_required: no usable account for the platform in this workspace
   * - awaiting_approval: an approval request exists; it executes only when a human approves it
   * - blocked: the platform is connected but something the post needs is missing (see reason)
   * - unsupported: connected, but Tangent can't execute this action type automatically yet
   */
  state: "connection_required" | "awaiting_approval" | "blocked" | "unsupported"
  reason?: string
  approvalId?: string
  account?: { id: string; name: string }
  preview?: { caption: string; imageAssetId: string | null; creativeProjectId?: string | null }
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
  | { type: "tool.completed"; stepId: string }
  | { type: "asset.generated"; asset: GeneratedAsset }
  | { type: "creative.created"; creative: GeneratedCreative }
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
