"use server"

import { z } from "zod"

import { AGENTS } from "@/lib/ai/agents/definitions"
import { SHARED_RULES } from "@/lib/ai/agents/handlers"
import { loadBusinessContext } from "@/lib/ai/context"
import { getModelProvider, ProviderError } from "@/lib/ai/provider"
import { checkEntitlement, creditsForTokens, DEFAULT_PLANS, ESTIMATED_CREDITS_PER_RUN } from "@/lib/billing/plans"
import {
  businessProfileSchema,
  INTELLIGENCE_SECTIONS,
  marketingIntelligenceContentSchema,
  type BusinessProfile,
  type IntelligenceSection,
  type MarketingIntelligence,
  type MarketingIntelligenceContent,
} from "@/lib/domain/business"
import { resolveWorkspace } from "@/lib/workspace/server"

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: "ai_not_configured" | "forbidden" | "invalid" | "quota_exceeded"; fieldErrors?: Record<string, string> }

function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join(".")
    if (!result[key]) result[key] = issue.message
  }
  return result
}

export async function saveBusinessProfile(
  workspace: string,
  input: BusinessProfile
): Promise<ActionResult> {
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("business_profile.edit")) {
    return { ok: false, code: "forbidden", error: "Your role cannot edit the business profile." }
  }
  const parsed = businessProfileSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "invalid", error: "Some fields need attention.", fieldErrors: fieldErrors(parsed.error) }
  }
  await repository.saveBusinessProfile(parsed.data)
  await repository.recordAudit({
    action: "business_profile.updated",
    entityType: "business_profile",
    entityId: context.workspace.id,
    summary: `Business profile saved for ${parsed.data.name}`,
    actor: { type: "user", id: context.user.id },
  })
  return { ok: true, data: undefined }
}

const INTELLIGENCE_SYSTEM = `${SHARED_RULES}

You are the Marketing Strategist building a Business Intelligence Profile. From the business context, produce:
a crisp business summary; 2–4 specific customer personas; a value proposition; insights for each named competitor
(if none are named, return an empty list rather than inventing competitors); 3–6 marketing opportunities with impact;
recommended channels with budget shares summing to 100 that respect the monthly budget; a strategy (positioning,
3–4 content pillars, measurable objectives); and a 4-week plan (weeks 1–4) with concrete actions.
Competitor insights are inferred from the information provided — be explicit when something is an assumption.`

export async function generateIntelligence(workspace: string): Promise<ActionResult<MarketingIntelligence>> {
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("ai.run") || !context.permissions.includes("business_profile.edit")) {
    return { ok: false, code: "forbidden", error: "Your role cannot generate the intelligence profile." }
  }
  const provider = getModelProvider()
  if (!provider) {
    return { ok: false, code: "ai_not_configured", error: "AI is not configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to the server environment." }
  }
  const used = context.usage.find((u) => u.key === "ai_credits_monthly")?.used ?? 0
  if (!checkEntitlement(DEFAULT_PLANS[context.workspace.planId].entitlements, "ai_credits_monthly", used, ESTIMATED_CREDITS_PER_RUN).allowed) {
    return { ok: false, code: "quota_exceeded", error: "This workspace has used its AI credits for the month." }
  }

  const businessContext = await loadBusinessContext(repository)
  if (!businessContext.hasBusinessProfile) {
    return { ok: false, code: "invalid", error: "Complete the business profile first." }
  }

  try {
    const result = await provider.generateStructured({
      tier: "reasoning",
      system: INTELLIGENCE_SYSTEM,
      input: `## Business context\n${businessContext.text}`,
      schema: marketingIntelligenceContentSchema,
      schemaName: "marketing_intelligence",
      maxOutputTokens: AGENTS.marketing_strategist.limits.maxOutputTokens,
    })
    const intelligence: MarketingIntelligence = {
      content: result.data,
      sectionStatus: Object.fromEntries(INTELLIGENCE_SECTIONS.map((s) => [s, "draft"])) as MarketingIntelligence["sectionStatus"],
      generatedAt: new Date().toISOString(),
      generatedBy: `${AGENTS.marketing_strategist.name} (${result.model})`,
      isSample: false,
    }
    await repository.saveIntelligence(intelligence)
    await repository.recordUsage("ai_credits_monthly", creditsForTokens(result.usage.inputTokens + result.usage.outputTokens), {
      feature: "intelligence_profile",
    })
    await repository.recordAudit({
      action: "intelligence.generated",
      entityType: "business_profile",
      entityId: context.workspace.id,
      summary: "Marketing intelligence profile generated (draft)",
      actor: { type: "agent", id: "marketing_strategist" },
    })
    return { ok: true, data: intelligence }
  } catch (error) {
    if (error instanceof ProviderError) return { ok: false, error: error.message }
    console.error("[tangent] intelligence generation failed", error)
    return { ok: false, error: "Generation failed. Try again." }
  }
}

const sectionUpdateSchema = z.object({
  section: z.enum(INTELLIGENCE_SECTIONS),
  status: z.enum(["draft", "approved"]),
  /** Replacement content for the section (edits always reset approval to draft unless approving). */
  content: z.unknown().optional(),
})

export async function updateIntelligenceSection(
  workspace: string,
  input: { section: IntelligenceSection; status: "draft" | "approved"; content?: unknown }
): Promise<ActionResult<MarketingIntelligence>> {
  const parsed = sectionUpdateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: "invalid", error: "Invalid update." }
  const { section, status, content } = parsed.data

  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("business_profile.edit")) {
    return { ok: false, code: "forbidden", error: "Your role cannot edit the intelligence profile." }
  }
  const current = await repository.getIntelligence()
  if (!current) return { ok: false, code: "invalid", error: "Generate the intelligence profile first." }

  let nextContent: MarketingIntelligenceContent = current.content
  if (content !== undefined) {
    const candidate = marketingIntelligenceContentSchema.safeParse({ ...current.content, [section]: content })
    if (!candidate.success) return { ok: false, code: "invalid", error: "The edited section is not valid." }
    nextContent = candidate.data
  }

  const updated: MarketingIntelligence = {
    ...current,
    content: nextContent,
    sectionStatus: { ...current.sectionStatus, [section]: status },
  }
  await repository.saveIntelligence(updated)
  await repository.recordAudit({
    action: content !== undefined ? "intelligence.section_edited" : `intelligence.section_${status}`,
    entityType: "business_profile",
    entityId: context.workspace.id,
    summary: `${section} ${content !== undefined ? "edited" : status === "approved" ? "approved" : "returned to draft"}`,
    actor: { type: "user", id: context.user.id },
  })
  return { ok: true, data: updated }
}
