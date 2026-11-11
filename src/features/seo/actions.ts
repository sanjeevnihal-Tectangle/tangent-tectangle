"use server"

import { z } from "zod"

import { runAgentTask } from "@/lib/ai/agents/handlers"
import { loadBusinessContext } from "@/lib/ai/context"
import { aiQuotaError, meterAi } from "@/lib/ai/metering"
import type { SeoOutput } from "@/lib/ai/outputs"
import { getModelProvider, ProviderError } from "@/lib/ai/provider"
import { contentItemSchema, normalizeHashtag, type ContentItem } from "@/lib/domain/content"
import { resolveWorkspace } from "@/lib/workspace/server"

export type SeoResult<T> = { ok: true; data: T } | { ok: false; error: string }

const seoResearchInput = z.object({
  topic: z.string().trim().min(3, "Enter a product, service or topic to research").max(800),
  targetCity: z.string().trim().max(100),
  websiteUrl: z.string().trim().max(300),
})

export async function runSeoResearch(
  workspace: string,
  input: z.input<typeof seoResearchInput>
): Promise<SeoResult<SeoOutput>> {
  const parsed = seoResearchInput.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid SEO query" }
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
    const result = await runAgentTask(provider, "seo_specialist", {
      userRequest: parsed.data.topic,
      instruction: [
        `Research 8–12 high-intent search keywords for "${parsed.data.topic}"${parsed.data.targetCity ? ` in ${parsed.data.targetCity}` : ""}.`,
        "Label all monthly volume ranges clearly as AI estimates (since Google Search Console is not connected for live volume).",
        `Provide 3–5 optimised page meta tag sets (titleTag 35–60 chars, metaDescription 120–155 chars)${parsed.data.websiteUrl ? ` for ${parsed.data.websiteUrl}` : ""}.`,
        "Provide 4 SEO blog/guide topics with outlines, plus 5 technical & local SEO checks.",
      ].join("\n"),
      businessContext: business.text,
      priorOutputs: "",
      today: new Date().toISOString().slice(0, 10),
    })
    await meterAi(repository, result.usage, "seo.research")
    if (result.output.kind !== "seo") {
      return { ok: false, error: "Unexpected agent output." }
    }
    await repository.recordAudit({
      action: "seo.research_generated",
      entityType: "seo",
      entityId: null,
      summary: `Generated SEO keyword & content plan for "${parsed.data.topic.slice(0, 60)}"`,
      actor: { type: "agent", id: "seo_specialist" },
    })
    return { ok: true, data: result.output.data }
  } catch (error) {
    if (error instanceof ProviderError) return { ok: false, error: error.message }
    console.error("[tangent] seo research failed", error)
    return { ok: false, error: "Could not complete SEO research." }
  }
}

const blogToPlannerInput = z.object({
  title: z.string().trim().min(2).max(160),
  primaryKeyword: z.string().trim().min(1).max(100),
  outline: z.array(z.string()).max(12),
})

export async function saveBlogTopicToPlanner(
  workspace: string,
  input: z.input<typeof blogToPlannerInput>
): Promise<SeoResult<ContentItem>> {
  const parsed = blogToPlannerInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid blog topic." }
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("content.create")) {
    return { ok: false, error: "Your role cannot create content." }
  }

  const tag = normalizeHashtag(parsed.data.primaryKeyword.replace(/[^a-zA-Z0-9]/g, ""))
  const candidate = contentItemSchema.safeParse({
    id: crypto.randomUUID(),
    title: parsed.data.title.slice(0, 160),
    platform: "linkedin",
    format: "Document",
    caption: [
      `Target keyword: ${parsed.data.primaryKeyword}`,
      "",
      "Article outline:",
      ...parsed.data.outline.map((s, idx) => `${idx + 1}. ${s}`),
    ]
      .join("\n")
      .slice(0, 2200),
    hashtags: /^#[\p{L}\p{N}_]+$/u.test(tag) ? [tag, "#SEO"] : ["#SEO"],
    scheduledFor: null,
    status: "draft",
    creativeProjectId: null,
    mediaAssetIds: [],
    reviewNote: null,
    updatedAt: new Date().toISOString(),
  })
  if (!candidate.success) return { ok: false, error: "Could not save blog outline to planner." }

  const saved = await repository.saveContentItem(candidate.data)
  await repository.recordAudit({
    action: "content.created",
    entityType: "content_item",
    entityId: saved.id,
    summary: `Saved SEO topic "${saved.title}" to Content Planner`,
    actor: { type: "user", id: context.user.id },
  })
  return { ok: true, data: saved }
}

