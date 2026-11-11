import { RUN_STAGES, type PlannedStep, type RequiredAction, type RunEvent, type RunStage, type ValidationCheck } from "@/lib/ai/events"
import type { AgentOutput, TaskType } from "@/lib/ai/outputs"
import type { RunRecord } from "@/lib/domain/conversations"

export type StageState = "pending" | "active" | "done" | "failed"
export type StepState = "pending" | "running" | "done" | "failed"

/** View model shared by live (streaming) runs and persisted run records. */
export interface RunViewModel {
  status: "running" | "completed" | "failed"
  stages: Record<RunStage, StageState>
  intent: string | null
  taskType: TaskType | null
  steps: PlannedStep[]
  stepState: Record<string, StepState>
  outputs: Record<string, AgentOutput>
  stepErrors: Record<string, string>
  contextSources: { label: string; detail: string }[]
  validation: ValidationCheck[]
  actions: RequiredAction[]
  limitations: string[]
  text: string
  error: { code: string; message: string } | null
  durationMs: number | null
}

function stages(state: StageState): Record<RunStage, StageState> {
  return Object.fromEntries(RUN_STAGES.map((s) => [s, state])) as Record<RunStage, StageState>
}

export function initialRunModel(): RunViewModel {
  return {
    status: "running",
    stages: stages("pending"),
    intent: null,
    taskType: null,
    steps: [],
    stepState: {},
    outputs: {},
    stepErrors: {},
    contextSources: [],
    validation: [],
    actions: [],
    limitations: [],
    text: "",
    error: null,
    durationMs: null,
  }
}

export function runModelFromRecord(record: RunRecord, text: string): RunViewModel {
  const outputs = Object.fromEntries(record.outputs.map((o) => [o.stepId, o.output]))
  return {
    status: record.status,
    stages: stages(record.status === "failed" ? "failed" : "done"),
    intent: record.intent,
    taskType: record.taskType,
    steps: record.steps,
    stepState: Object.fromEntries(record.steps.map((s) => [s.id, outputs[s.id] ? "done" : "failed"])),
    outputs,
    stepErrors: {},
    contextSources: record.contextSources,
    validation: record.validation,
    actions: record.actions,
    limitations: record.limitations,
    text,
    error: record.error,
    durationMs: record.durationMs,
  }
}

/** Pure reducer applying one streamed event to the run view model. */
export function applyRunEvent(model: RunViewModel, event: RunEvent): RunViewModel {
  switch (event.type) {
    case "run.started":
      return model
    case "stage":
      return { ...model, stages: { ...model.stages, [event.stage]: event.status } }
    case "context":
      return { ...model, contextSources: event.sources }
    case "plan":
      return {
        ...model,
        intent: event.intent,
        taskType: event.taskType,
        steps: event.steps,
        limitations: event.limitations,
        stepState: Object.fromEntries(event.steps.map((s) => [s.id, "pending" as const])),
      }
    case "step.started":
      return { ...model, stepState: { ...model.stepState, [event.stepId]: "running" } }
    case "step.completed":
      return {
        ...model,
        stepState: { ...model.stepState, [event.stepId]: "done" },
        outputs: { ...model.outputs, [event.stepId]: event.output },
      }
    case "step.failed":
      return {
        ...model,
        stepState: { ...model.stepState, [event.stepId]: "failed" },
        stepErrors: { ...model.stepErrors, [event.stepId]: event.message },
      }
    case "validation":
      return { ...model, validation: event.checks }
    case "action.required":
      return { ...model, actions: [...model.actions, event.action] }
    case "message.delta":
      return { ...model, text: model.text + event.text }
    case "run.completed":
      return { ...model, status: "completed", durationMs: event.durationMs }
    case "run.failed": {
      const failedStages = Object.fromEntries(
        RUN_STAGES.map((s) => [s, model.stages[s] === "active" ? "failed" : model.stages[s]])
      ) as Record<RunStage, StageState>
      return { ...model, status: "failed", stages: failedStages, error: { code: event.code, message: event.message } }
    }
    default: {
      const unreachable: never = event
      return unreachable
    }
  }
}
