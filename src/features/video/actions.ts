"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { runAgentTask } from "@/lib/ai/agents/handlers"
import { loadBusinessContext } from "@/lib/ai/context"
import { aiQuotaError, meterAi } from "@/lib/ai/metering"
import { videoOutputSchema, type VideoOutput } from "@/lib/ai/outputs"
import { getModelProvider, ProviderError } from "@/lib/ai/provider"
import {
  contentItemSchema,
  normalizeHashtag,
  type ContentItem,
  type ContentPlatform,
} from "@/lib/domain/content"
import { resolveWorkspace } from "@/lib/workspace/server"

export type VideoResult<T> = { ok: true; data: T } | { ok: false; error: string }

const generateInputSchema = z.object({
  platform: z.enum(["Instagram Reel", "YouTube Short", "Facebook Reel"]),
  topic: z.string().trim().min(5, "Describe what the Reel or Short is about").max(1500),
  durationSeconds: z.number().int().min(10).max(90),
  guidance: z.string().trim().max(500).optional(),
})

export async function generateVideoScript(
  workspace: string,
  input: z.input<typeof generateInputSchema>
): Promise<VideoResult<VideoOutput>> {
  const parsed = generateInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid video brief" }
  }

  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("ai.run")) {
    return { ok: false, error: "Your role cannot run AI agents." }
  }

  const provider = getModelProvider()
  if (!provider) {
    return {
      ok: false,
      error: "AI is not configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY.",
    }
  }

  const quota = aiQuotaError(context)
  if (quota) {
    return { ok: false, error: quota }
  }

  const { platform, topic, durationSeconds, guidance } = parsed.data

  try {
    const business = await loadBusinessContext(repository)
    const result = await runAgentTask(provider, "video_creator", {
      userRequest: topic,
      instruction: [
        `Create a ${durationSeconds}-second ${platform} script and scene-by-scene storyboard.`,
        `Ensure scene durations sum to approximately ${durationSeconds} seconds.`,
        "Write a scroll-stopping 0–3s hook, clear visual directions, natural voiceover lines, punchy on-screen text overlays, and an audio/music mood recommendation.",
        guidance ? `Additional direction: ${guidance}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      businessContext: business.text,
      priorOutputs: "",
      today: new Date().toISOString().slice(0, 10),
    })

    await meterAi(repository, result.usage, "video_studio")

    if (result.output.kind !== "video") {
      return { ok: false, error: "Unexpected agent output." }
    }

    await repository.recordAudit({
      action: "video.script_generated",
      entityType: "video",
      entityId: null,
      summary: `Generated ${durationSeconds}s ${platform} storyboard: ${result.output.data.title}`,
      actor: { type: "agent", id: "video_creator" },
    })

    return { ok: true, data: result.output.data }
  } catch (error) {
    if (error instanceof ProviderError) return { ok: false, error: error.message }
    console.error("[tangent] video script generation failed", error)
    return { ok: false, error: "Could not generate video script." }
  }
}

function mapVideoPlatform(
  platform: VideoOutput["platform"]
): { platform: ContentPlatform; format: string } {
  switch (platform) {
    case "Instagram Reel":
      return { platform: "instagram", format: "Reel" }
    case "YouTube Short":
      return { platform: "youtube", format: "Short" }
    case "Facebook Reel":
      return { platform: "facebook", format: "Reel" }
    default: {
      const _exhaustive: never = platform
      return _exhaustive
    }
  }
}

export async function saveVideoScriptToPlanner(
  workspace: string,
  scriptInput: VideoOutput
): Promise<VideoResult<ContentItem>> {
  const parsed = videoOutputSchema.safeParse(scriptInput)
  if (!parsed.success) {
    return { ok: false, error: "Invalid video script payload." }
  }

  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("content.create")) {
    return { ok: false, error: "Your role cannot create content items." }
  }

  const script = parsed.data
  const mapped = mapVideoPlatform(script.platform)

  const storyboardText = script.scenes
    .map(
      (s) =>
        `[Scene ${s.sceneNumber} · ${s.durationSeconds}s]\nVisual: ${s.visualDirection}\nVO: "${s.voiceoverOrDialogue}"\nText: ${s.onScreenText}`
    )
    .join("\n\n")

  const combinedCaption = [
    script.caption,
    `--- STORYBOARD (${script.totalDurationSeconds}s) ---`,
    `Hook (0-3s): ${script.hook}`,
    storyboardText,
    `CTA: ${script.callToAction}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2200)

  const item = contentItemSchema.safeParse({
    id: crypto.randomUUID(),
    title: script.title.slice(0, 120) || "Untitled Reel script",
    platform: mapped.platform,
    format: mapped.format,
    caption: combinedCaption,
    hashtags: script.hashtags
      .map(normalizeHashtag)
      .filter((h) => /^#[\p{L}\p{N}_]+$/u.test(h))
      .slice(0, 30),
    scheduledFor: null,
    status: "draft",
    creativeProjectId: null,
    mediaAssetIds: [],
    reviewNote: null,
    updatedAt: new Date().toISOString(),
  })

  if (!item.success) {
    return { ok: false, error: "Could not format script for Content Planner." }
  }

  const saved = await repository.saveContentItem(item.data)
  await repository.recordAudit({
    action: "content.created_from_video_studio",
    entityType: "content_item",
    entityId: saved.id,
    summary: `Saved ${script.platform} storyboard "${saved.title}" to planner`,
    actor: { type: "user", id: context.user.id },
  })

  revalidatePath(`/w/${context.workspace.slug}/planner`)
  return { ok: true, data: saved }
}
