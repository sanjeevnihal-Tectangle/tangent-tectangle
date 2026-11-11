"use server"

import { z } from "zod"

import { COPY_PURPOSES } from "@/features/copy/purposes"
import { runAgentTask } from "@/lib/ai/agents/handlers"
import { loadBusinessContext } from "@/lib/ai/context"
import { aiQuotaError, meterAi } from "@/lib/ai/metering"
import type { CopyOutput } from "@/lib/ai/outputs"
import { getModelProvider, ProviderError } from "@/lib/ai/provider"
import { CONTENT_FORMATS, CONTENT_PLATFORMS, contentItemSchema, normalizeHashtag, type ContentItem } from "@/lib/domain/content"
import { resolveWorkspace } from "@/lib/workspace/server"

export type CopyResult<T> = { ok: true; data: T } | { ok: false; error: string }

const generateInput = z.object({
  purpose: z.enum(COPY_PURPOSES),
  platform: z.string().max(40),
  brief: z.string().trim().min(5, "Describe what the copy is for").max(2000),
  variants: z.number().int().min(1).max(10),
  guidance: z.string().max(500),
})

export async function generateCopy(workspace: string, input: z.input<typeof generateInput>): Promise<CopyResult<CopyOutput>> {
  const parsed = generateInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" }
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("ai.run")) return { ok: false, error: "Your role cannot run AI agents." }
  const provider = getModelProvider()
  if (!provider) return { ok: false, error: "AI is not configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY." }
  const quota = aiQuotaError(context)
  if (quota) return { ok: false, error: quota }

  const { purpose, platform, brief, variants, guidance } = parsed.data
  try {
    const business = await loadBusinessContext(repository)
    const result = await runAgentTask(provider, "copywriter", {
      userRequest: brief,
      instruction: [
        `Write exactly ${variants} distinct variant(s) of ${purpose} copy for ${platform}.`,
        "Vary the angle across variants (benefit, emotion, urgency, social proof, curiosity).",
        purpose === "Google search ad" ? "Headlines ≤ 30 characters, body (description) ≤ 90 characters." : null,
        purpose === "YouTube title & description" ? "Headline is the video title (≤ 70 characters); body is the description." : null,
        guidance ? `Extra guidance: ${guidance}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      businessContext: business.text,
      priorOutputs: "",
      today: new Date().toDateString(),
    })
    await meterAi(repository, result.usage, "copy_studio")
    if (result.output.kind !== "copy") return { ok: false, error: "Unexpected agent output." }
    await repository.recordAudit({
      action: "copy.generated",
      entityType: "copy",
      entityId: null,
      summary: `Generated ${result.output.data.variants.length} ${purpose} variant(s)`,
      actor: { type: "agent", id: "copywriter" },
    })
    return { ok: true, data: result.output.data }
  } catch (error) {
    if (error instanceof ProviderError) return { ok: false, error: error.message }
    console.error("[tangent] copy generation failed", error)
    return { ok: false, error: "Could not generate copy." }
  }
}

const toPlannerInput = z.object({
  platform: z.enum(CONTENT_PLATFORMS),
  headline: z.string().max(300),
  body: z.string().max(2200),
  callToAction: z.string().max(300),
  hashtags: z.array(z.string()).max(30),
})

/** Saves one copy variant as a draft post in the Content Planner. */
export async function copyToPlanner(workspace: string, input: z.input<typeof toPlannerInput>): Promise<CopyResult<ContentItem>> {
  const parsed = toPlannerInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid copy." }
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("content.create")) return { ok: false, error: "Your role cannot create content." }
  const { platform, headline, body, callToAction, hashtags } = parsed.data
  const item = contentItemSchema.safeParse({
    id: crypto.randomUUID(),
    title: (headline || body).slice(0, 80) || "Untitled post",
    platform,
    format: CONTENT_FORMATS[platform][0] ?? "Post",
    caption: [headline, body, callToAction].filter(Boolean).join("\n\n").slice(0, 2200),
    hashtags: hashtags.map(normalizeHashtag).filter((h) => /^#[\p{L}\p{N}_]+$/u.test(h)),
    scheduledFor: null,
    status: "draft",
    creativeProjectId: null,
    mediaAssetIds: [],
    reviewNote: null,
    updatedAt: new Date().toISOString(),
  })
  if (!item.success) return { ok: false, error: "This copy can't be saved as a post." }
  const saved = await repository.saveContentItem(item.data)
  await repository.recordAudit({
    action: "content.created",
    entityType: "content_item",
    entityId: saved.id,
    summary: `Saved copy "${saved.title}" to the Content Planner`,
    actor: { type: "user", id: context.user.id },
  })
  return { ok: true, data: saved }
}
