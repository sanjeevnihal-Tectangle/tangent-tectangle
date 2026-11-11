import { describe, expect, it } from "vitest"

import { applyRunEvent, initialRunModel, runModelFromRecord } from "@/features/command-centre/run-model"
import type { RunEvent } from "@/lib/ai/events"
import type { AgentOutput, ExecutionPlan } from "@/lib/ai/outputs"
import { executionPlanSchema } from "@/lib/ai/outputs"
import { normalizePlan } from "@/lib/ai/plan"
import { validateOutputs } from "@/lib/ai/validation"
import { DEMO_CONVERSATIONS } from "@/lib/demo/seed-ai"

const copyOutput: AgentOutput = {
  kind: "copy",
  data: {
    brief: "",
    notes: [],
    variants: [{ platform: "Instagram", format: "Post", headline: "Hi", body: "The best in Bengaluru!", callToAction: "Book", hashtags: [], suggestedDate: "" }],
  },
}

describe("plan normalisation", () => {
  const plan: ExecutionPlan = {
    intent: "Write lots of copy",
    taskType: "content_creation",
    steps: [
      { agent: "copywriter", title: "A", instruction: "a" },
      { agent: "copywriter", title: "B", instruction: "b" },
      { agent: "copywriter", title: "C", instruction: "c" },
      { agent: "graphic_designer", title: "D", instruction: "d" },
    ],
    externalActions: [],
    limitations: [],
  }

  it("enforces per-agent call limits", () => {
    const { steps, dropped } = normalizePlan(plan, 10)
    expect(steps.map((s) => s.title)).toEqual(["A", "B", "D"])
    expect(dropped).toEqual(["C"])
    expect(steps.map((s) => s.id)).toEqual(["step-1", "step-2", "step-3"])
  })

  it("enforces the global step cap", () => {
    expect(normalizePlan(plan, 1).steps).toHaveLength(1)
  })

  it("accepts all 11 active agents and rejects unknown agents", () => {
    const valid = executionPlanSchema.safeParse({
      ...plan,
      steps: [
        { agent: "seo_specialist", title: "SEO", instruction: "audit" },
        { agent: "performance_marketer", title: "Ads", instruction: "plan" },
        { agent: "video_creator", title: "Video", instruction: "script" },
      ],
    })
    expect(valid.success).toBe(true)

    const invalid = executionPlanSchema.safeParse({
      ...plan,
      steps: [{ agent: "unknown_agent", title: "x", instruction: "y" }],
    })
    expect(invalid.success).toBe(false)
  })
})

describe("run event reducer", () => {
  it("builds a run view from streamed events", () => {
    const events: RunEvent[] = [
      { type: "run.started", runId: "r", conversationId: "c", startedAt: "now" },
      { type: "stage", stage: "planning", status: "active" },
      { type: "plan", intent: "Do it", taskType: "content_creation", steps: [{ id: "step-1", agentId: "copywriter", title: "Write" }], limitations: [] },
      { type: "step.started", stepId: "step-1" },
      { type: "step.completed", stepId: "step-1", output: copyOutput },
      { type: "message.delta", text: "Hello " },
      { type: "message.delta", text: "world" },
      { type: "run.completed", durationMs: 1200, usage: { inputTokens: 1, outputTokens: 2 } },
    ]
    const model = events.reduce(applyRunEvent, initialRunModel())
    expect(model.status).toBe("completed")
    expect(model.stepState["step-1"]).toBe("done")
    expect(model.outputs["step-1"]).toEqual(copyOutput)
    expect(model.text).toBe("Hello world")
  })

  it("marks the active stage as failed when the run fails", () => {
    let model = applyRunEvent(initialRunModel(), { type: "stage", stage: "executing", status: "active" })
    model = applyRunEvent(model, { type: "run.failed", code: "provider_error", message: "Rate limited" })
    expect(model.status).toBe("failed")
    expect(model.stages.executing).toBe("failed")
    expect(model.error?.message).toBe("Rate limited")
  })

  it("restores persisted sample runs", () => {
    const record = DEMO_CONVERSATIONS[0]!.messages[1]!.run!
    const model = runModelFromRecord(record, "text")
    expect(model.status).toBe("completed")
    expect(Object.values(model.stepState).every((s) => s === "done")).toBe(true)
  })
})

describe("output validation", () => {
  it("flags prohibited phrases case-insensitively", () => {
    const checks = validateOutputs([{ output: copyOutput, text: "The BEST IN BENGALURU biryani" }], 0, ["best in Bengaluru"])
    expect(checks.find((c) => c.label === "Prohibited messaging")?.status).toBe("fail")
  })

  it("warns when channel budget shares don't sum to 100", () => {
    const strategy: AgentOutput = {
      kind: "strategy",
      data: {
        title: "",
        summary: "",
        objectives: [],
        pillars: [],
        channelPlan: [
          { channel: "Instagram", role: "", budgetSharePercent: 60, cadence: "" },
          { channel: "Google", role: "", budgetSharePercent: 30, cadence: "" },
        ],
        timeline: [],
        risks: [],
        nextSteps: [],
      },
    }
    const checks = validateOutputs([{ output: strategy, text: "" }], 0, [])
    expect(checks.find((c) => c.label === "Budget allocation")?.status).toBe("warn")
  })

  it("reports failed steps", () => {
    expect(validateOutputs([], 2, [])[0]).toMatchObject({ label: "Output schema", status: "fail" })
  })
})
