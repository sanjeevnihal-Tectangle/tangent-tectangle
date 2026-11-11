"use server"

import { z } from "zod"

import { runAgentTask } from "@/lib/ai/agents/handlers"
import { loadBusinessContext } from "@/lib/ai/context"
import { aiQuotaError, meterAi } from "@/lib/ai/metering"
import type { AnalyticsOutput } from "@/lib/ai/outputs"
import { getModelProvider, ProviderError } from "@/lib/ai/provider"
import { resolveWorkspace } from "@/lib/workspace/server"

export type AnalyticsResult<T> = { ok: true; data: T } | { ok: false; error: string }

const reportInput = z.object({
  windowDays: z.number().int().min(7).max(180),
  contextSummary: z.string().max(3000),
})

export async function generateAnalyticsReport(
  workspace: string,
  input: z.input<typeof reportInput>
): Promise<AnalyticsResult<AnalyticsOutput>> {
  const parsed = reportInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid analytics report request." }

  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("analytics.view") || !context.permissions.includes("ai.run")) {
    return { ok: false, error: "Your role cannot run the AI Marketing Analyst." }
  }
  const provider = getModelProvider()
  if (!provider) {
    return { ok: false, error: "AI is not configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY." }
  }
  const quota = aiQuotaError(context)
  if (quota) return { ok: false, error: quota }

  try {
    const business = await loadBusinessContext(repository)
    const result = await runAgentTask(provider, "marketing_analyst", {
      userRequest: `Analyse marketing performance over the last ${parsed.data.windowDays} days.`,
      instruction: [
        `Evaluate the following workspace snapshot (${parsed.data.windowDays}-day reporting window):`,
        parsed.data.contextSummary,
        "Explain what is working, call out any efficiency anomalies or risks, and give 3–5 concrete, prioritised recommendations. If channel metrics are labelled as sample data, explicitly note that live recommendations will sharpen once OAuth connectors sync.",
      ].join("\n\n"),
      businessContext: business.text,
      priorOutputs: "",
      today: new Date().toISOString().slice(0, 10),
    })
    await meterAi(repository, result.usage, "analytics.summary")
    if (result.output.kind !== "analytics") {
      return { ok: false, error: "Unexpected agent output." }
    }
    await repository.recordAudit({
      action: "analytics.report_generated",
      entityType: "analytics",
      entityId: null,
      summary: `Generated ${parsed.data.windowDays}-day AI performance summary`,
      actor: { type: "agent", id: "marketing_analyst" },
    })
    return { ok: true, data: result.output.data }
  } catch (error) {
    if (error instanceof ProviderError) return { ok: false, error: error.message }
    console.error("[tangent] generate analytics report failed", error)
    return { ok: false, error: "Could not generate the analytics summary." }
  }
}

