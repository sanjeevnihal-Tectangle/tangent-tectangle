"use server"

import { z } from "zod"

import { runAgentTask } from "@/lib/ai/agents/handlers"
import { loadBusinessContext } from "@/lib/ai/context"
import { aiQuotaError, meterAi } from "@/lib/ai/metering"
import type { AdsOutput } from "@/lib/ai/outputs"
import { getModelProvider, ProviderError } from "@/lib/ai/provider"
import {
  AD_PLATFORM_LABELS,
  AD_PLATFORMS,
  adCampaignPayloadSchema,
  type AdCampaignPayload,
} from "@/lib/domain/ads"
import type { ApprovalView } from "@/lib/domain/approvals"
import { formatINR } from "@/lib/format"
import { resolveWorkspace } from "@/lib/workspace/server"

export type AdsResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export async function submitAdSpendProposal(
  workspace: string,
  input: { payload: AdCampaignPayload; previousVersionId?: string | null }
): Promise<AdsResult<ApprovalView>> {
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("ads.manage") || !context.permissions.includes("ai.run")) {
    return { ok: false, error: "Your role cannot create ad spend proposals." }
  }

  const parsed = adCampaignPayloadSchema.safeParse(input.payload)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] ??= issue.message
    }
    return { ok: false, error: "Check the highlighted fields.", fieldErrors }
  }

  const d = parsed.data
  const totalBudgetInr = d.dailyBudgetInr * d.durationDays

  try {
    const approval = await repository.createApprovalRequest({
      actionType: "launch_ad_campaign",
      title: `Launch ${AD_PLATFORM_LABELS[d.platform]} — ${d.name} (${formatINR(d.dailyBudgetInr)}/day)`,
      previousVersionId: input.previousVersionId ?? null,
      payload: {
        platform: AD_PLATFORM_LABELS[d.platform],
        campaignName: d.name,
        objective: d.objective,
        dailyBudget: `${formatINR(d.dailyBudgetInr)}/day`,
        duration: `${d.durationDays} days (total cap ${formatINR(totalBudgetInr)})`,
        locations: d.targetLocations,
        audience: d.targetAudience,
        headlines: d.headlines.join(" | "),
        descriptions: d.descriptions.join(" | "),
        callToAction: d.callToAction,
        landingPageUrl: d.landingPageUrl || "Not specified",
        abTestHypothesis: d.abTestHypothesis || "None",
      },
      financialImpact: {
        currency: "INR",
        maxSpendPaise: Math.round(d.dailyBudgetInr * 100),
        period: "daily",
      },
      requestedByAgent: "performance_marketer",
    })
    await repository.recordAudit({
      action: input.previousVersionId ? "ads.proposal_revised" : "ads.proposal_created",
      entityType: "approval_request",
      entityId: approval.id,
      summary: `${input.previousVersionId ? `Revised (v${approval.version})` : "Created"} ad campaign proposal "${d.name}"`,
      actor: { type: "user", id: context.user.id },
      metadata: { dailyBudgetInr: d.dailyBudgetInr, durationDays: d.durationDays, version: approval.version },
    })
    return { ok: true, data: approval }
  } catch (error) {
    console.error("[tangent] submit ad spend proposal failed", error)
    return { ok: false, error: "Could not submit the ad campaign proposal." }
  }
}

const limitsInput = z.object({
  accountId: z.string().min(1),
  dailySpendLimitInr: z.number().int().min(0).max(100_000_000).nullable(),
  monthlySpendLimitInr: z.number().int().min(0).max(500_000_000).nullable(),
})

export async function updateAccountSpendLimits(
  workspace: string,
  input: z.input<typeof limitsInput>
): Promise<AdsResult<null>> {
  const parsed = limitsInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid spend limits." }
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("ads.approve_spend")) {
    return { ok: false, error: "Only spend approvers (Owner/Admin) can change account spend limits." }
  }
  try {
    await repository.updateAdAccountLimits(parsed.data.accountId, {
      dailySpendLimitInr: parsed.data.dailySpendLimitInr,
      monthlySpendLimitInr: parsed.data.monthlySpendLimitInr,
    })
    await repository.recordAudit({
      action: "ads.limits_updated",
      entityType: "ad_account",
      entityId: parsed.data.accountId,
      summary: "Updated ad account spend guardrails",
      actor: { type: "user", id: context.user.id },
    })
    return { ok: true, data: null }
  } catch (error) {
    console.error("[tangent] update ad limits failed", error)
    return { ok: false, error: "Could not update ad account spend limits." }
  }
}

const aiAdPlanInput = z.object({
  platform: z.enum(AD_PLATFORMS),
  brief: z.string().trim().min(5, "Describe what you want to advertise").max(1500),
  dailyBudgetInr: z.number().int().min(100).max(10_000_000),
})

export async function generateAdPlanWithAi(
  workspace: string,
  input: z.input<typeof aiAdPlanInput>
): Promise<AdsResult<AdsOutput>> {
  const parsed = aiAdPlanInput.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid ad brief." }
  }
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("ai.run")) {
    return { ok: false, error: "Your role cannot run AI agents." }
  }
  const provider = getModelProvider()
  if (!provider) {
    return { ok: false, error: "AI is not configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY." }
  }
  const quota = aiQuotaError(context)
  if (quota) return { ok: false, error: quota }

  try {
    const business = await loadBusinessContext(repository)
    const platformName = AD_PLATFORM_LABELS[parsed.data.platform]
    const result = await runAgentTask(provider, "performance_marketer", {
      userRequest: parsed.data.brief,
      instruction: [
        `Design a complete ${platformName} campaign with a daily budget of ₹${parsed.data.dailyBudgetInr}/day.`,
        `Set platform to "${parsed.data.platform}" and recommendedDailyBudgetInr to ${parsed.data.dailyBudgetInr}.`,
        "Include 2–3 distinct ad sets / ad groups whose budgetSharePercent sums to 100%, 4–6 headlines (≤ 30 chars for Google Search), 3 descriptions (≤ 90 chars), a clear CTA and a concrete A/B test hypothesis.",
      ].join("\n"),
      businessContext: business.text,
      priorOutputs: "",
      today: new Date().toISOString().slice(0, 10),
    })
    await meterAi(repository, result.usage, "ads.plan")
    if (result.output.kind !== "ads") {
      return { ok: false, error: "Unexpected agent output." }
    }
    await repository.recordAudit({
      action: "ads.plan_generated",
      entityType: "ad_campaign",
      entityId: null,
      summary: `Generated ${platformName} campaign plan "${result.output.data.campaignName}"`,
      actor: { type: "agent", id: "performance_marketer" },
    })
    return { ok: true, data: result.output.data }
  } catch (error) {
    if (error instanceof ProviderError) return { ok: false, error: error.message }
    console.error("[tangent] generate ad plan failed", error)
    return { ok: false, error: "Could not generate the ad campaign plan." }
  }
}

