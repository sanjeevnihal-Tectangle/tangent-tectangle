"use server"

import { z } from "zod"

import { SHARED_RULES } from "@/lib/ai/agents/handlers"
import { loadBusinessContext } from "@/lib/ai/context"
import { aiQuotaError, meterAi } from "@/lib/ai/metering"
import { getModelProvider, ProviderError } from "@/lib/ai/provider"
import { MARKETING_CHANNELS } from "@/lib/domain/business"
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUSES,
  campaignSchema,
  type Campaign,
  type CampaignStatus,
} from "@/lib/domain/campaigns"
import { resolveWorkspace } from "@/lib/workspace/server"

export type CampaignResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export async function saveCampaignAction(
  workspace: string,
  input: Campaign
): Promise<CampaignResult<Campaign>> {
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("campaigns.manage")) {
    return { ok: false, error: "Your role cannot manage campaigns." }
  }

  const parsed = campaignSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] ??= issue.message
    }
    return { ok: false, error: "Check the highlighted fields.", fieldErrors }
  }

  const existing = await repository.getCampaign(parsed.data.id)
  try {
    const saved = await repository.saveCampaign(parsed.data)
    await repository.recordAudit({
      action: existing ? "campaign.updated" : "campaign.created",
      entityType: "campaign",
      entityId: saved.id,
      summary: `${existing ? "Updated" : "Created"} campaign "${saved.name}"`,
      actor: { type: "user", id: context.user.id },
    })
    return { ok: true, data: saved }
  } catch (error) {
    console.error("[tangent] save campaign failed", error)
    return { ok: false, error: "Could not save the campaign." }
  }
}

export async function setCampaignStatus(
  workspace: string,
  input: { id: string; status: CampaignStatus }
): Promise<CampaignResult<Campaign>> {
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("campaigns.manage")) {
    return { ok: false, error: "Your role cannot update campaign status." }
  }
  if (!CAMPAIGN_STATUSES.includes(input.status)) {
    return { ok: false, error: "Invalid campaign status." }
  }
  const existing = await repository.getCampaign(input.id)
  if (!existing) return { ok: false, error: "Campaign not found." }

  try {
    const saved = await repository.saveCampaign({ ...existing, status: input.status })
    await repository.recordAudit({
      action: `campaign.${input.status}`,
      entityType: "campaign",
      entityId: saved.id,
      summary: `"${saved.name}" → ${CAMPAIGN_STATUS_LABELS[input.status]}`,
      actor: { type: "user", id: context.user.id },
    })
    return { ok: true, data: saved }
  } catch (error) {
    console.error("[tangent] set campaign status failed", error)
    return { ok: false, error: "Could not update campaign status." }
  }
}

export async function deleteCampaignAction(
  workspace: string,
  id: string
): Promise<CampaignResult<null>> {
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("campaigns.manage")) {
    return { ok: false, error: "Your role cannot delete campaigns." }
  }
  try {
    await repository.deleteCampaign(id)
    await repository.recordAudit({
      action: "campaign.deleted",
      entityType: "campaign",
      entityId: id,
      summary: "Deleted a campaign",
      actor: { type: "user", id: context.user.id },
    })
    return { ok: true, data: null }
  } catch (error) {
    console.error("[tangent] delete campaign failed", error)
    return { ok: false, error: "Could not delete the campaign." }
  }
}

const aiCampaignBlueprintSchema = z.object({
  name: z.string(),
  objective: z.string(),
  audience: z.string(),
  channels: z.array(z.enum(MARKETING_CHANNELS)).min(1).max(6),
  conversionGoal: z.string(),
  kpis: z
    .array(
      z.object({
        metric: z.string(),
        target: z.string(),
        current: z.string(),
      })
    )
    .min(2)
    .max(5),
})

const aiInputSchema = z.object({
  brief: z.string().trim().min(5, "Describe what the campaign is about").max(1500),
  budgetInr: z.number().int().min(0).max(100_000_000),
  durationDays: z.number().int().min(3).max(180),
})

export async function generateCampaignWithAi(
  workspace: string,
  input: z.input<typeof aiInputSchema>
): Promise<CampaignResult<Campaign>> {
  const parsed = aiInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid campaign brief." }
  }
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("campaigns.manage") || !context.permissions.includes("ai.run")) {
    return { ok: false, error: "Your role cannot generate campaigns with AI." }
  }
  const provider = getModelProvider()
  if (!provider) {
    return { ok: false, error: "AI is not configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY." }
  }
  const quota = aiQuotaError(context)
  if (quota) return { ok: false, error: quota }

  try {
    const [business, profile] = await Promise.all([
      loadBusinessContext(repository),
      repository.getBusinessProfile(),
    ])
    const result = await provider.generateStructured({
      tier: "reasoning",
      system: `${SHARED_RULES}\n\nYou are the Marketing Strategist designing a multi-channel campaign blueprint. Pick the most effective channels from the allowed enum, define a specific target audience, set a clear conversion goal, and specify 3–4 measurable KPIs (set current to "0 (baseline)").`,
      input: [
        `## Business and brand context\n${business.text}`,
        `## Campaign brief\n${parsed.data.brief}`,
        `Budget: ₹${parsed.data.budgetInr.toLocaleString("en-IN")} over ${parsed.data.durationDays} days.`,
      ].join("\n\n"),
      schema: aiCampaignBlueprintSchema,
      schemaName: "campaign_blueprint",
      maxOutputTokens: 3000,
    })
    await meterAi(repository, result.usage, "campaigns.blueprint")

    const start = new Date()
    const end = new Date(start.getTime() + parsed.data.durationDays * 86_400_000)
    const toDate = (d: Date) => d.toISOString().slice(0, 10)

    const candidate = campaignSchema.safeParse({
      id: crypto.randomUUID(),
      name: result.data.name.slice(0, 160),
      objective: result.data.objective.slice(0, 160),
      audience: result.data.audience.slice(0, 800),
      channels: result.data.channels,
      startDate: toDate(start),
      endDate: toDate(end),
      budgetInr: parsed.data.budgetInr,
      landingPageUrl: profile?.website ?? "",
      conversionGoal: result.data.conversionGoal.slice(0, 160),
      kpis: result.data.kpis.map((k) => ({
        metric: k.metric.slice(0, 80),
        target: k.target.slice(0, 80),
        current: k.current.slice(0, 80) || "0",
      })),
      status: "planning",
      brandProfileId: business.brand?.id ?? null,
      updatedAt: new Date().toISOString(),
    })
    if (!candidate.success) {
      return { ok: false, error: "AI returned an invalid campaign structure. Please try again." }
    }

    const saved = await repository.saveCampaign(candidate.data)
    await repository.recordAudit({
      action: "campaign.ai_generated",
      entityType: "campaign",
      entityId: saved.id,
      summary: `Generated campaign "${saved.name}" with AI`,
      actor: { type: "agent", id: "marketing_strategist" },
    })
    return { ok: true, data: saved }
  } catch (error) {
    if (error instanceof ProviderError) return { ok: false, error: error.message }
    console.error("[tangent] generate campaign failed", error)
    return { ok: false, error: "Could not generate the campaign." }
  }
}
