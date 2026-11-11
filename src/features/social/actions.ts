"use server"

import { z } from "zod"

import { runAgentTask } from "@/lib/ai/agents/handlers"
import { loadBusinessContext } from "@/lib/ai/context"
import { aiQuotaError, meterAi } from "@/lib/ai/metering"
import type { CopyOutput } from "@/lib/ai/outputs"
import { getModelProvider, ProviderError } from "@/lib/ai/provider"
import { CONTENT_PLATFORM_LABELS, CONTENT_PLATFORMS } from "@/lib/domain/content"
import { resolveWorkspace } from "@/lib/workspace/server"

export type SocialResult<T> = { ok: true; data: T } | { ok: false; error: string }

const socialPackInput = z.object({
  theme: z.string().trim().min(5, "Describe the theme or promotion").max(1500),
  platforms: z.array(z.enum(CONTENT_PLATFORMS)).min(1, "Pick at least one platform"),
  count: z.number().int().min(2).max(12),
})

export async function generateSocialPack(
  workspace: string,
  input: z.input<typeof socialPackInput>
): Promise<SocialResult<CopyOutput>> {
  const parsed = socialPackInput.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
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
    const platformNames = parsed.data.platforms.map((p) => CONTENT_PLATFORM_LABELS[p]).join(", ")
    const result = await runAgentTask(provider, "social_media_manager", {
      userRequest: parsed.data.theme,
      instruction: `Create a coordinated pack of ${parsed.data.count} social media posts across ${platformNames}. Include a mix of formats (Reels, Carousels, Stories, Community posts), strong hooks, clear CTAs, relevant hashtags and suggested posting dates.`,
      businessContext: business.text,
      priorOutputs: "",
      today: new Date().toISOString().slice(0, 10),
    })
    await meterAi(repository, result.usage, "social.pack")
    if (result.output.kind !== "copy") {
      return { ok: false, error: "Unexpected agent output." }
    }
    await repository.recordAudit({
      action: "social.pack_generated",
      entityType: "content_item",
      entityId: null,
      summary: `Generated ${result.output.data.variants.length} social post drafts`,
      actor: { type: "agent", id: "social_media_manager" },
    })
    return { ok: true, data: result.output.data }
  } catch (error) {
    if (error instanceof ProviderError) return { ok: false, error: error.message }
    console.error("[tangent] generate social pack failed", error)
    return { ok: false, error: "Could not generate the social pack." }
  }
}

