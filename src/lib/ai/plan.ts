import { AGENTS } from "@/lib/ai/agents/definitions"
import type { PlannedStep } from "@/lib/ai/events"
import type { ExecutionPlan } from "@/lib/ai/outputs"

export interface NormalizedStep extends PlannedStep {
  instruction: string
}

/**
 * Enforces orchestration limits on a model-produced plan: global step cap and
 * each agent's per-run call limit. Dropped steps are reported as limitations.
 */
export function normalizePlan(
  plan: ExecutionPlan,
  maxSteps: number
): { steps: NormalizedStep[]; dropped: string[] } {
  const callsPerAgent = new Map<string, number>()
  const steps: NormalizedStep[] = []
  const dropped: string[] = []

  for (const step of plan.steps) {
    const calls = callsPerAgent.get(step.agent) ?? 0
    const limit = AGENTS[step.agent].limits.maxCallsPerRun
    if (steps.length >= maxSteps || calls >= limit) {
      dropped.push(step.title)
      continue
    }
    callsPerAgent.set(step.agent, calls + 1)
    steps.push({
      id: `step-${steps.length + 1}`,
      agentId: step.agent,
      title: step.title,
      instruction: step.instruction,
    })
  }
  return { steps, dropped }
}
