"use server"

import { z } from "zod"

import { runAgentTask, SHARED_RULES } from "@/lib/ai/agents/handlers"
import { loadBusinessContext } from "@/lib/ai/context"
import { aspectFor, getImageProvider } from "@/lib/ai/image-provider"
import { aiQuotaError, meterAi, quotaError } from "@/lib/ai/metering"
import type { CreativeOutput } from "@/lib/ai/outputs"
import { getModelProvider, ProviderError } from "@/lib/ai/provider"
import type { DesignDocument } from "@/lib/creative/document"
import { CREATIVE_OBJECTIVES, getFormat, isFormatId, PLATFORM_LABELS, type CreativeFormat } from "@/lib/creative/formats"
import { composeContext } from "@/features/studio/server"
import { composeDocument, DESIGN_LAYOUTS, designSpecSchema, LAYOUT_LABELS, type DesignSpec } from "@/lib/creative/layout"
import { CREATIVE_TEMPLATES, templateSpec } from "@/lib/creative/templates"
import type { WorkspaceRepository } from "@/lib/data/types"
import { CONTENT_FORMATS, type ContentItem, type ContentPlatform } from "@/lib/domain/content"
import { creativeProjectSchema, type CreativeBrief, type CreativeProject } from "@/lib/domain/creative"
import type { MediaAsset } from "@/lib/domain/media"
import type { WorkspaceContext } from "@/lib/domain/workspace"
import { resolveWorkspace } from "@/lib/workspace/server"

export type StudioResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: "ai_not_configured" | "image_not_configured" | "forbidden" }

const NOT_CONFIGURED = { ok: false as const, code: "ai_not_configured" as const, error: "AI is not configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY." }

function failure(error: unknown, fallback: string): { ok: false; error: string } {
  if (error instanceof ProviderError) return { ok: false, error: error.message }
  console.error(`[tangent] ${fallback}`, error)
  return { ok: false, error: fallback }
}

async function requireCreator(workspace: string) {
  const resolved = await resolveWorkspace(workspace)
  if (!resolved.context.permissions.includes("content.create")) {
    return { ...resolved, denied: { ok: false as const, code: "forbidden" as const, error: "Your role cannot create creatives." } }
  }
  return { ...resolved, denied: null }
}

function objectiveLabel(id: string): string {
  return CREATIVE_OBJECTIVES.find((o) => o.id === id)?.label ?? id
}

const DESIGN_SYSTEM = `${SHARED_RULES}

You are the Graphic Designer composing a finished marketing design. A layout engine positions everything; you decide:
- layout: one of ${DESIGN_LAYOUTS.map((l) => `${l} (${LAYOUT_LABELS[l]})`).join(", ")}. Prefer split when a photo is available,
  bold_type for punchy announcements and thumbnails, centered_hero for offers, corner_minimal for quotes and premium tone.
- copy: headline ≤ 8 words, subheadline ≤ 16 words, CTA 2–4 words, optional very short badge. Follow the brand voice.
- palette: background, text and accent hex colours chosen ONLY from the brand palette; text must contrast strongly with background.
- backgroundStyle: "image" only if told a photo is available, otherwise "solid" or "gradient".
- imagePrompt: a photographic prompt matching the concept (no text in the image).
- slides: for carousel formats, 3–6 slides (headline + 1–2 sentence body) after the cover; otherwise an empty list.`

function describeTask(format: CreativeFormat, objective: string, description: string): string {
  return [
    `Format: ${format.label} for ${PLATFORM_LABELS[format.platform]} (${format.width}×${format.height}px${format.maxPages > 1 ? `, carousel up to ${format.maxPages} slides` : ""})`,
    `Objective: ${objectiveLabel(objective)}`,
    `Brief: ${description || "(no brief — propose something fitting the business)"}`,
  ].join("\n")
}

// ---------------------------------------------------------------------------
// Ideas and concepts
// ---------------------------------------------------------------------------

const ideasSchema = z.object({ ideas: z.array(z.string()).describe("Exactly 3 one-sentence creative briefs") })

export async function suggestIdeas(workspace: string, input: { objective: string; formatId: string }): Promise<StudioResult<string[]>> {
  const { context, repository, denied } = await requireCreator(workspace)
  if (denied) return denied
  if (!isFormatId(input.formatId)) return { ok: false, error: "Unknown format." }
  const provider = getModelProvider()
  if (!provider) return NOT_CONFIGURED
  const quota = aiQuotaError(context)
  if (quota) return { ok: false, error: quota }
  try {
    const business = await loadBusinessContext(repository)
    const result = await provider.generateStructured({
      tier: "fast",
      system: `${SHARED_RULES}\n\nYou suggest specific, timely creative ideas (consider the date, Indian festivals and the business's offers).`,
      input: `Today: ${new Date().toDateString()}\n\n## Business context\n${business.text}\n\n## Task\n${describeTask(getFormat(input.formatId), input.objective, "")}\nSuggest 3 distinct briefs.`,
      schema: ideasSchema,
      schemaName: "ideas",
      maxOutputTokens: 800,
    })
    await meterAi(repository, result.usage, "studio.ideas")
    return { ok: true, data: result.data.ideas.slice(0, 3) }
  } catch (error) {
    return failure(error, "Could not suggest ideas.")
  }
}

export async function generateConcepts(
  workspace: string,
  input: { objective: string; formatId: string; description: string }
): Promise<StudioResult<CreativeOutput["concepts"]>> {
  const { context, repository, denied } = await requireCreator(workspace)
  if (denied) return denied
  if (!isFormatId(input.formatId)) return { ok: false, error: "Unknown format." }
  const provider = getModelProvider()
  if (!provider) return NOT_CONFIGURED
  const quota = aiQuotaError(context)
  if (quota) return { ok: false, error: quota }
  try {
    const business = await loadBusinessContext(repository)
    const format = getFormat(input.formatId)
    const result = await runAgentTask(provider, "graphic_designer", {
      userRequest: input.description,
      instruction: `Create exactly 3 clearly different creative concepts.\n${describeTask(format, input.objective, input.description)}`,
      businessContext: business.text,
      priorOutputs: "",
      today: new Date().toDateString(),
    })
    await meterAi(repository, result.usage, "studio.concepts")
    if (result.output.kind !== "creative") return { ok: false, error: "Unexpected agent output." }
    return { ok: true, data: result.output.data.concepts.slice(0, 3) }
  } catch (error) {
    return failure(error, "Could not generate concepts.")
  }
}

// ---------------------------------------------------------------------------
// Creating projects
// ---------------------------------------------------------------------------

async function saveNewProject(
  repository: WorkspaceRepository,
  context: WorkspaceContext,
  input: { name: string; objective: string; format: CreativeFormat; brandProfileId: string | null; document: DesignDocument; brief: CreativeBrief }
): Promise<string> {
  const project: CreativeProject = {
    id: crypto.randomUUID(),
    name: input.name.slice(0, 160),
    objective: input.objective,
    platform: input.format.platform,
    formatId: input.format.id,
    brandProfileId: input.brandProfileId,
    status: "draft",
    document: input.document,
    brief: input.brief,
    updatedAt: new Date().toISOString(),
  }
  await repository.saveCreativeProject(project)
  await repository.recordAudit({
    action: "creative.created",
    entityType: "creative_project",
    entityId: project.id,
    summary: `Created creative "${project.name}"`,
    actor: { type: "user", id: context.user.id },
  })
  return project.id
}

const composeInput = z.object({
  objective: z.string().max(60),
  formatId: z.string().refine(isFormatId, "Unknown format"),
  description: z.string().max(2000),
  concept: z.object({ name: z.string(), visualDirection: z.string(), imagePrompt: z.string() }).nullable(),
  imageAssetId: z.string().nullable(),
})

export async function composeDesign(workspace: string, input: z.input<typeof composeInput>): Promise<StudioResult<{ projectId: string }>> {
  const parsed = composeInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid design request." }
  const { context, repository, denied } = await requireCreator(workspace)
  if (denied) return denied
  const provider = getModelProvider()
  if (!provider) return NOT_CONFIGURED
  const quota = aiQuotaError(context)
  if (quota) return { ok: false, error: quota }

  const { objective, formatId, description, concept, imageAssetId } = parsed.data
  const format = getFormat(formatId)
  try {
    const business = await loadBusinessContext(repository)
    const result = await provider.generateStructured({
      tier: "fast",
      system: DESIGN_SYSTEM,
      input: [
        `## Business and brand context\n${business.text}`,
        `## Task\n${describeTask(format, objective, description)}`,
        concept ? `## Chosen concept\n${concept.name}: ${concept.visualDirection}` : null,
        `A photo is ${imageAssetId ? "available" : "NOT available"} for this design.`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: designSpecSchema,
      schemaName: "design_spec",
      maxOutputTokens: 3000,
    })
    await meterAi(repository, result.usage, "studio.compose")
    const { ctx, brandProfileId } = await composeContext(repository, context, format, imageAssetId)
    const document = composeDocument(result.data, ctx)
    const projectId = await saveNewProject(repository, context, {
      name: concept?.name ? `${concept.name} — ${format.label}` : result.data.headline || format.label,
      objective,
      format,
      brandProfileId,
      document,
      brief: { objective, description, concept, spec: result.data, templateId: null },
    })
    return { ok: true, data: { projectId } }
  } catch (error) {
    return failure(error, "Could not generate the design.")
  }
}

export async function createFromTemplate(workspace: string, templateId: string): Promise<StudioResult<{ projectId: string }>> {
  const { context, repository, denied } = await requireCreator(workspace)
  if (denied) return denied
  const template = CREATIVE_TEMPLATES.find((t) => t.id === templateId)
  if (!template) return { ok: false, error: "Template not found." }
  try {
    const format = getFormat(template.formatId)
    const { ctx, brandProfileId } = await composeContext(repository, context, format, null)
    const spec = templateSpec(template, ctx.businessName, ctx.brandColors)
    const projectId = await saveNewProject(repository, context, {
      name: template.name,
      objective: template.objective,
      format,
      brandProfileId,
      document: composeDocument(spec, ctx),
      brief: { objective: template.objective, description: template.description, concept: null, spec, templateId },
    })
    return { ok: true, data: { projectId } }
  } catch (error) {
    return failure(error, "Could not create from template.")
  }
}

export async function createBlank(workspace: string, formatId: string): Promise<StudioResult<{ projectId: string }>> {
  const { context, repository, denied } = await requireCreator(workspace)
  if (denied) return denied
  if (!isFormatId(formatId)) return { ok: false, error: "Unknown format." }
  try {
    const format = getFormat(formatId)
    const { ctx, brandProfileId } = await composeContext(repository, context, format, null)
    const spec: DesignSpec = {
      layout: "top_headline",
      headline: "Your headline",
      subheadline: "",
      callToAction: "",
      badge: "",
      palette: { background: "", text: "", accent: "" },
      backgroundStyle: "solid",
      imagePrompt: "",
      slides: [],
    }
    const projectId = await saveNewProject(repository, context, {
      name: `Untitled ${format.label}`,
      objective: "awareness",
      format,
      brandProfileId,
      document: composeDocument(spec, ctx),
      brief: { objective: "awareness", description: "", concept: null, spec: null, templateId: null },
    })
    return { ok: true, data: { projectId } }
  } catch (error) {
    return failure(error, "Could not create the design.")
  }
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

export async function saveProject(workspace: string, project: CreativeProject): Promise<StudioResult<{ updatedAt: string }>> {
  const { repository, denied } = await requireCreator(workspace)
  if (denied) return denied
  const parsed = creativeProjectSchema.safeParse(project)
  if (!parsed.success) return { ok: false, error: "The design could not be validated. Undo the last change and try again." }
  try {
    const existing = await repository.getCreativeProject(parsed.data.id)
    if (!existing) return { ok: false, error: "Project not found." }
    const saved = await repository.saveCreativeProject(parsed.data)
    return { ok: true, data: { updatedAt: saved.updatedAt } }
  } catch (error) {
    return failure(error, "Could not save the project.")
  }
}

export async function duplicateProject(workspace: string, projectId: string): Promise<StudioResult<{ projectId: string }>> {
  const { context, repository, denied } = await requireCreator(workspace)
  if (denied) return denied
  const project = await repository.getCreativeProject(projectId)
  if (!project) return { ok: false, error: "Project not found." }
  const projectIdNew = await saveNewProject(repository, context, {
    name: `${project.name} (copy)`,
    objective: project.objective,
    format: getFormat(project.formatId),
    brandProfileId: project.brandProfileId,
    document: project.document,
    brief: project.brief,
  })
  return { ok: true, data: { projectId: projectIdNew } }
}

export async function deleteProject(workspace: string, projectId: string): Promise<StudioResult<null>> {
  const { context, repository, denied } = await requireCreator(workspace)
  if (denied) return denied
  await repository.deleteCreativeProject(projectId)
  await repository.recordAudit({
    action: "creative.deleted",
    entityType: "creative_project",
    entityId: projectId,
    summary: "Deleted a creative project",
    actor: { type: "user", id: context.user.id },
  })
  return { ok: true, data: null }
}

const variationsSchema = z.object({ variants: z.array(designSpecSchema).describe("Exactly 3 distinct alternatives") })

/** Returns three alternative documents (not saved) for the user to pick from. */
export async function generateVariations(workspace: string, projectId: string): Promise<StudioResult<DesignDocument[]>> {
  const { context, repository, denied } = await requireCreator(workspace)
  if (denied) return denied
  const provider = getModelProvider()
  if (!provider) return NOT_CONFIGURED
  const quota = aiQuotaError(context)
  if (quota) return { ok: false, error: quota }
  const project = await repository.getCreativeProject(projectId)
  if (!project) return { ok: false, error: "Project not found." }
  try {
    const format = getFormat(project.formatId)
    const imageAssetId = project.document.pages[0]?.background.type === "image" ? project.document.pages[0].background.assetId : null
    const business = await loadBusinessContext(repository)
    const current = project.brief.spec
    const result = await provider.generateStructured({
      tier: "fast",
      system: DESIGN_SYSTEM,
      input: [
        `## Business and brand context\n${business.text}`,
        `## Task\n${describeTask(format, project.objective, project.brief.description)}`,
        current ? `## Current design\nLayout ${current.layout}; headline "${current.headline}"; CTA "${current.callToAction}"` : null,
        "Create 3 variations that differ meaningfully in layout, copy angle and palette while staying on brief and on brand.",
        `A photo is ${imageAssetId ? "available" : "NOT available"}.`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: variationsSchema,
      schemaName: "design_variations",
      maxOutputTokens: 5000,
    })
    await meterAi(repository, result.usage, "studio.variations")
    const { ctx } = await composeContext(repository, context, format, imageAssetId)
    return { ok: true, data: result.data.variants.slice(0, 3).map((spec) => composeDocument(spec, ctx)) }
  } catch (error) {
    return failure(error, "Could not generate variations.")
  }
}

// ---------------------------------------------------------------------------
// AI images
// ---------------------------------------------------------------------------

export async function generateImage(
  workspace: string,
  input: { prompt: string; formatId: string }
): Promise<StudioResult<MediaAsset>> {
  const { context, repository, denied } = await requireCreator(workspace)
  if (denied) return denied
  const prompt = input.prompt.trim().slice(0, 2000)
  if (prompt.length < 10) return { ok: false, error: "Describe the image in a bit more detail." }
  const provider = getImageProvider()
  if (!provider) {
    return { ok: false, code: "image_not_configured", error: "Image generation is not configured. Set IMAGE_PROVIDER=openai with an OpenAI key that has credits." }
  }
  const quota = quotaError(context, "image_generations_monthly", 1)
  if (quota) return { ok: false, error: quota }
  try {
    const format = getFormat(isFormatId(input.formatId) ? input.formatId : "instagram_post")
    const image = await provider.generate({ prompt, aspect: aspectFor(format.width, format.height) })
    const asset = await repository.uploadAsset({
      name: prompt.slice(0, 60),
      mimeType: image.mimeType,
      bytes: image.bytes,
      width: image.width,
      height: image.height,
      tags: ["ai-generated"],
      source: "ai_generated",
      generation: { provider: image.provider, model: image.model, prompt },
    })
    await repository.recordUsage("image_generations_monthly", 1, { model: image.model })
    await repository.recordAudit({
      action: "asset.generated",
      entityType: "media_asset",
      entityId: asset.id,
      summary: `Generated image: ${prompt.slice(0, 80)}`,
      actor: { type: "agent", id: "graphic_designer" },
    })
    return { ok: true, data: asset }
  } catch (error) {
    return failure(error, "Could not generate the image.")
  }
}

// ---------------------------------------------------------------------------
// Send to Content Planner
// ---------------------------------------------------------------------------

/** multipart: projectId, platform, pages[] (PNG files, one per page) */
export async function sendToPlanner(workspace: string, formData: FormData): Promise<StudioResult<{ contentItemId: string }>> {
  const { context, repository, denied } = await requireCreator(workspace)
  if (denied) return denied
  const project = await repository.getCreativeProject(String(formData.get("projectId") ?? ""))
  if (!project) return { ok: false, error: "Project not found." }
  const files = formData.getAll("pages").filter((f): f is File => f instanceof File)
  if (files.length === 0 || files.some((f) => f.type !== "image/png" || f.size > 10 * 1024 * 1024)) {
    return { ok: false, error: "Export failed: expected PNG pages under 10 MB." }
  }
  try {
    const format = getFormat(project.formatId)
    const assets = []
    for (const [index, file] of files.entries()) {
      assets.push(
        await repository.uploadAsset({
          name: files.length > 1 ? `${project.name} — ${index + 1}` : project.name,
          mimeType: "image/png",
          bytes: new Uint8Array(await file.arrayBuffer()),
          width: format.width,
          height: format.height,
          tags: ["creative-export"],
          source: "upload",
          generation: null,
        })
      )
    }
    const platform: ContentPlatform = format.platform === "facebook" || format.platform === "youtube" || format.platform === "linkedin" ? format.platform : "instagram"
    const spec = project.brief.spec
    const item: ContentItem = {
      id: crypto.randomUUID(),
      title: project.name.slice(0, 160),
      platform,
      format: format.maxPages > 1 ? "Carousel" : format.category === "video_cover" ? (CONTENT_FORMATS[platform][0] ?? "Post") : "Post",
      caption: spec ? [spec.headline, spec.subheadline, spec.callToAction].filter(Boolean).join("\n\n") : "",
      hashtags: [],
      scheduledFor: null,
      status: "draft",
      creativeProjectId: project.id,
      mediaAssetIds: assets.map((a) => a.id),
      reviewNote: null,
      updatedAt: new Date().toISOString(),
    }
    await repository.saveContentItem(item)
    await repository.recordAudit({
      action: "content.created",
      entityType: "content_item",
      entityId: item.id,
      summary: `Sent "${project.name}" to the Content Planner`,
      actor: { type: "user", id: context.user.id },
    })
    return { ok: true, data: { contentItemId: item.id } }
  } catch (error) {
    return failure(error, "Could not send to the Content Planner.")
  }
}
