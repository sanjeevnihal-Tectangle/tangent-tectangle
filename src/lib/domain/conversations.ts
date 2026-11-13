import type { ActiveAgentId } from "@/lib/ai/agents/definitions"
import type {
  GeneratedAsset,
  GeneratedCreative,
  PlannedStep,
  RequiredAction,
  ValidationCheck,
} from "@/lib/ai/events"
import type { AgentOutput, TaskType } from "@/lib/ai/outputs"

export interface ConversationSummary {
  id: string
  title: string
  updatedAt: string
  isSample: boolean
}

export interface RunRecord {
  runId: string
  status: "completed" | "failed"
  intent: string | null
  taskType: TaskType | null
  steps: PlannedStep[]
  contextSources: { label: string; detail: string }[]
  outputs: { stepId: string; agentId: ActiveAgentId; title: string; output: AgentOutput }[]
  validation: ValidationCheck[]
  actions: RequiredAction[]
  /** Images generated during the run (absent on runs recorded before image generation). */
  assets?: GeneratedAsset[]
  /** Editable Creative Studio designs built during the run. */
  creatives?: GeneratedCreative[]
  /** Outcome of tool steps, which have no agent output. */
  toolSteps?: Record<string, { status: "done" | "failed"; error: string | null }>
  limitations: string[]
  error: { code: string; message: string } | null
  durationMs: number | null
}

export interface StoredMessage {
  id: string
  role: "user" | "assistant"
  text: string
  createdAt: string
  run: RunRecord | null
}

export interface Conversation extends ConversationSummary {
  messages: StoredMessage[]
}
