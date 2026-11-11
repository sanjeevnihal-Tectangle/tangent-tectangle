"use server"

import { revalidatePath } from "next/cache"

import { runAgentTask } from "@/lib/ai/agents/handlers"
import { loadBusinessContext } from "@/lib/ai/context"
import { aiQuotaError, meterAi } from "@/lib/ai/metering"
import type { ResearchOutput } from "@/lib/ai/outputs"
import { getModelProvider, ProviderError } from "@/lib/ai/provider"
import { businessProfileSchema } from "@/lib/domain/business"
import { resolveWorkspace } from "@/lib/workspace/server"

export type CompetitorActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code?: string; error: string }

export async function saveCompetitorsList(
  workspaceSlug: string,
  competitorsInput: { name: string; website: string }[]
): Promise<CompetitorActionResult<{ count: number }>> {
  const { context, repository } = await resolveWorkspace(workspaceSlug)
  if (!context.permissions.includes("business_profile.edit")) {
    return {
      ok: false,
      error: "Your role cannot edit tracked competitors.",
    }
  }

  const parsed = businessProfileSchema.shape.competitors.safeParse(competitorsInput)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check competitor names and URLs.",
    }
  }

  const profile = await repository.getBusinessProfile()
  if (!profile) {
    return {
      ok: false,
      error: "Complete your Business Profile first before tracking competitors.",
    }
  }

  await repository.saveBusinessProfile({
    ...profile,
    competitors: parsed.data,
  })

  await repository.recordAudit({
    action: "competitors.list_saved",
    entityType: "business_profile",
    entityId: context.workspace.id,
    summary: `Updated tracked competitors (${parsed.data.length})`,
    actor: { type: "user", id: context.user.id },
  })

  revalidatePath(`/w/${context.workspace.slug}/competitors`)
  revalidatePath(`/w/${context.workspace.slug}/strategy`)
  return { ok: true, data: { count: parsed.data.length } }
}

export async function runCompetitorAnalysis(
  workspaceSlug: string,
  focus?: string
): Promise<CompetitorActionResult<ResearchOutput>> {
  const { context, repository } = await resolveWorkspace(workspaceSlug)
  if (!context.permissions.includes("ai.run")) {
    return { ok: false, error: "Your role cannot run AI competitor research." }
  }

  const provider = getModelProvider()
  if (!provider) {
    return {
      ok: false,
      code: "not_configured",
      error: "AI is not configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY.",
    }
  }

  const quota = aiQuotaError(context)
  if (quota) {
    return {
      ok: false,
      code: "quota_exceeded",
      error: quota,
    }
  }

  const [business, intelligence, bizCtx] = await Promise.all([
    repository.getBusinessProfile(),
    repository.getIntelligence(),
    loadBusinessContext(repository),
  ])

  const trackedCompetitors =
    business?.competitors.length
      ? business.competitors
          .map((c) => (c.website ? `${c.name} (${c.website})` : c.name))
          .join(", ")
      : "Identify top direct and category alternatives in our city/industry"

  const instruction = [
    `Conduct a deep competitive intelligence & positioning analysis for ${business?.name ?? context.workspace.name}.`,
    `Tracked competitors: ${trackedCompetitors}.`,
    focus?.trim() ? `Specific research focus: ${focus.trim()}` : null,
    "Produce detailed competitor battlecards (positioning summary, strengths, weaknesses, and our specific counter-positioning wedge), positioning openings we can own, and audience shifts.",
  ]
    .filter(Boolean)
    .join("\n")

  try {
    const res = await runAgentTask(provider, "market_research", {
      userRequest: focus?.trim() || `Competitive intelligence analysis for ${business?.name ?? context.workspace.name}`,
      instruction,
      businessContext: bizCtx.text,
      priorOutputs: "",
      today: new Date().toISOString().slice(0, 10),
    })

    await meterAi(repository, res.usage, "competitors.battlecard_analysis")

    if (res.output.kind !== "research") {
      return { ok: false, error: "Unexpected output kind from Market Research Agent." }
    }

    if (intelligence && context.permissions.includes("business_profile.edit")) {
      const updatedInsights = res.output.data.competitorBattlecards.map((card) => ({
        competitor: card.competitor,
        strengths: card.strengths,
        weaknesses: card.weaknesses,
        opportunity: card.ourWedge,
      }))
      await repository.saveIntelligence({
        ...intelligence,
        content: {
          ...intelligence.content,
          competitorInsights: updatedInsights,
        },
        generatedAt: new Date().toISOString(),
        generatedBy: provider.id,
        isSample: false,
      })
    }

    await repository.recordAudit({
      action: "competitors.ai_analysis_generated",
      entityType: "business_profile",
      entityId: context.workspace.id,
      summary: `Generated competitor battlecards (${res.output.data.competitorBattlecards.length} competitors)`,
      actor: { type: "agent", id: "market_research" },
      metadata: { provider: provider.id },
    })

    revalidatePath(`/w/${context.workspace.slug}/competitors`)
    revalidatePath(`/w/${context.workspace.slug}/strategy`)
    return { ok: true, data: res.output.data }
  } catch (err) {
    if (err instanceof ProviderError) {
      return { ok: false, error: err.message }
    }
    console.error("[tangent] competitor analysis failed", err)
    return { ok: false, error: "Could not complete competitor analysis." }
  }
}
