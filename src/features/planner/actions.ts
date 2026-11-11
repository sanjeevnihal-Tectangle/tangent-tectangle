"use server"

import { z } from "zod"

import { SHARED_RULES } from "@/lib/ai/agents/handlers"
import { loadBusinessContext } from "@/lib/ai/context"
import { aiQuotaError, meterAi } from "@/lib/ai/metering"
import { getModelProvider, ProviderError } from "@/lib/ai/provider"
import type { ApprovalView } from "@/lib/domain/approvals"
import {
  CONTENT_PLATFORM_LABELS,
  CONTENT_PLATFORMS,
  CONTENT_STATUS_LABELS,
  contentItemSchema,
  normalizeHashtag,
  type ContentItem,
  type ContentStatus,
} from "@/lib/domain/content"
import { resolveWorkspace } from "@/lib/workspace/server"

export type PlannerResult<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> }

const CONTENT_FIELDS = ["title", "platform", "format", "caption", "hashtags", "scheduledFor", "mediaAssetIds"] as const

function changedContent(a: ContentItem, b: ContentItem): boolean {
  return CONTENT_FIELDS.some((field) => JSON.stringify(a[field]) !== JSON.stringify(b[field]))
}

export async function saveContentItem(workspace: string, input: ContentItem): Promise<PlannerResult<ContentItem>> {
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("content.create")) return { ok: false, error: "Your role cannot create content." }

  const parsed = contentItemSchema.safeParse({ ...input, hashtags: input.hashtags.map(normalizeHashtag) })
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message
    return { ok: false, error: "Some fields need attention.", fieldErrors }
  }

  const existing = await repository.getContentItem(parsed.data.id)
  let item = parsed.data
  if (existing) {
    if (existing.status === "scheduled" || existing.status === "published") {
      return { ok: false, error: `${CONTENT_STATUS_LABELS[existing.status]} posts can't be edited here.` }
    }
    // Status only changes through setContentStatus; edits to approved content need re-approval.
    item = { ...item, status: existing.status, reviewNote: existing.reviewNote }
    if (existing.status === "approved" && changedContent(existing, item)) {
      item = { ...item, status: "draft", reviewNote: "Edited after approval — needs review again." }
    }
  } else {
    item = { ...item, status: "draft", reviewNote: null }
  }

  try {
    const saved = await repository.saveContentItem(item)
    await repository.recordAudit({
      action: existing ? "content.updated" : "content.created",
      entityType: "content_item",
      entityId: saved.id,
      summary: `${existing ? "Updated" : "Created"} "${saved.title}"`,
      actor: { type: "user", id: context.user.id },
    })
    return { ok: true, data: saved }
  } catch (error) {
    console.error("[tangent] save content failed", error)
    return { ok: false, error: "Could not save the post." }
  }
}

const TRANSITIONS: Record<ContentStatus, { to: ContentStatus; permission: "content.create" | "content.approve" }[]> = {
  draft: [{ to: "in_review", permission: "content.create" }],
  in_review: [
    { to: "approved", permission: "content.approve" },
    { to: "draft", permission: "content.create" },
  ],
  approved: [{ to: "draft", permission: "content.approve" }],
  failed: [{ to: "draft", permission: "content.create" }],
  scheduled: [],
  published: [],
}

export async function setContentStatus(
  workspace: string,
  input: { id: string; status: ContentStatus; note: string | null }
): Promise<PlannerResult<ContentItem>> {
  const { context, repository } = await resolveWorkspace(workspace)
  const item = await repository.getContentItem(input.id)
  if (!item) return { ok: false, error: "Post not found." }

  if (input.status === "scheduled" || input.status === "published") {
    return {
      ok: false,
      error: `Scheduling to ${item.platform === "youtube" ? "YouTube" : item.platform[0]!.toUpperCase() + item.platform.slice(1)} needs a connected account. Connect it in Integrations; scheduling will then create an approval request.`,
    }
  }
  const rule = TRANSITIONS[item.status].find((t) => t.to === input.status)
  if (!rule) return { ok: false, error: `Can't move a post from ${CONTENT_STATUS_LABELS[item.status]} to ${CONTENT_STATUS_LABELS[input.status]}.` }
  if (!context.permissions.includes(rule.permission)) {
    return { ok: false, error: rule.permission === "content.approve" ? "Only approvers can do this." : "Your role cannot change this post." }
  }
  if (item.status === "in_review" && input.status === "draft" && context.permissions.includes("content.approve") && !input.note?.trim()) {
    return { ok: false, error: "Add a note describing the changes you want." }
  }

  const saved = await repository.saveContentItem({ ...item, status: input.status, reviewNote: input.note?.trim() || null })
  await repository.recordAudit({
    action: `content.${input.status}`,
    entityType: "content_item",
    entityId: item.id,
    summary: `"${item.title}" → ${CONTENT_STATUS_LABELS[input.status]}`,
    actor: { type: "user", id: context.user.id },
    metadata: input.note ? { note: input.note } : undefined,
  })
  return { ok: true, data: saved }
}

export async function deleteContentItem(workspace: string, id: string): Promise<PlannerResult<null>> {
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("content.create")) return { ok: false, error: "Your role cannot delete content." }
  try {
    await repository.deleteContentItem(id)
    await repository.recordAudit({
      action: "content.deleted",
      entityType: "content_item",
      entityId: id,
      summary: "Deleted a post",
      actor: { type: "user", id: context.user.id },
    })
    return { ok: true, data: null }
  } catch {
    return { ok: false, error: "Could not delete the post (approved posts can only be deleted by approvers)." }
  }
}

const calendarSchema = z.object({
  posts: z.array(
    z.object({
      date: z.string().describe("YYYY-MM-DD within the requested month"),
      time: z.string().describe("HH:MM 24-hour local time (IST)"),
      platform: z.enum(CONTENT_PLATFORMS),
      format: z.string(),
      title: z.string().describe("Internal title, max 8 words"),
      caption: z.string(),
      hashtags: z.array(z.string()),
    })
  ),
})

const calendarInput = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  platforms: z.array(z.enum(CONTENT_PLATFORMS)).min(1),
  postsPerWeek: z.number().int().min(1).max(14),
  focus: z.string().max(500),
})

/** Generates a month of draft posts and saves them to the planner. */
export async function generateCalendar(workspace: string, input: z.input<typeof calendarInput>): Promise<PlannerResult<ContentItem[]>> {
  const parsed = calendarInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Choose a month and at least one platform." }
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("content.create") || !context.permissions.includes("ai.run")) {
    return { ok: false, error: "Your role cannot generate content." }
  }
  const provider = getModelProvider()
  if (!provider) return { ok: false, error: "AI is not configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY." }
  const quota = aiQuotaError(context)
  if (quota) return { ok: false, error: quota }

  const { month, platforms, postsPerWeek, focus } = parsed.data
  const total = Math.min(40, Math.round(postsPerWeek * 4.3))
  try {
    const business = await loadBusinessContext(repository)
    const result = await provider.generateStructured({
      tier: "reasoning",
      system: `${SHARED_RULES}\n\nYou are the Social Media Manager and Copywriter planning a content calendar. Mix content pillars, formats and days; respect Indian festivals and seasons in the month; post at times that suit the audience; write ready-to-review captions in the brand voice.`,
      input: [
        `## Business and brand context\n${business.text}`,
        `## Task\nPlan about ${total} posts for ${month} across: ${platforms.join(", ")}.`,
        "Formats: Instagram Post/Carousel/Reel/Story, Facebook Post/Video/Story, YouTube Short/Video/Community post, LinkedIn Post/Document/Video.",
        focus ? `Focus for this month: ${focus}` : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: calendarSchema,
      schemaName: "content_calendar",
      maxOutputTokens: 12000,
    })
    await meterAi(repository, result.usage, "planner.calendar")

    const saved: ContentItem[] = []
    for (const post of result.data.posts) {
      if (!post.date.startsWith(month) || !/^\d{2}:\d{2}$/.test(post.time)) continue
      const scheduledFor = new Date(`${post.date}T${post.time}:00+05:30`)
      if (Number.isNaN(scheduledFor.getTime())) continue
      const candidate = contentItemSchema.safeParse({
        id: crypto.randomUUID(),
        title: post.title.slice(0, 160) || "Untitled post",
        platform: post.platform,
        format: post.format.slice(0, 40) || "Post",
        caption: post.caption.slice(0, 2200),
        hashtags: post.hashtags.map(normalizeHashtag).filter((h) => /^#[\p{L}\p{N}_]+$/u.test(h)).slice(0, 30),
        scheduledFor: scheduledFor.toISOString(),
        status: "draft",
        creativeProjectId: null,
        mediaAssetIds: [],
        reviewNote: null,
        updatedAt: new Date().toISOString(),
      })
      if (candidate.success) saved.push(await repository.saveContentItem(candidate.data))
    }
    await repository.recordAudit({
      action: "content.calendar_generated",
      entityType: "content_item",
      entityId: null,
      summary: `Generated ${saved.length} draft posts for ${month}`,
      actor: { type: "agent", id: "copywriter" },
    })
    return { ok: true, data: saved }
  } catch (error) {
    if (error instanceof ProviderError) return { ok: false, error: error.message }
    console.error("[tangent] calendar generation failed", error)
    return { ok: false, error: "Could not generate the calendar." }
  }
}

/**
 * Creates a cryptographically hashed approval request for publishing or
 * scheduling an approved post to a social platform.
 */
export async function requestPublishApproval(
  workspace: string,
  contentItemId: string
): Promise<PlannerResult<ApprovalView>> {
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("ai.run")) {
    return { ok: false, error: "Your role cannot submit publishing approval requests." }
  }
  const item = await repository.getContentItem(contentItemId)
  if (!item) return { ok: false, error: "Post not found." }
  if (item.status !== "approved") {
    return { ok: false, error: "Approve the post content first before requesting publishing sign-off." }
  }

  try {
    const accounts = await repository.listConnectedAccounts()
    const match = accounts.find((a) => a.provider === item.platform && a.status === "active")
    const actionType = item.scheduledFor ? "schedule_post" : "publish_post"
    const platformLabel = CONTENT_PLATFORM_LABELS[item.platform]
    const approval = await repository.createApprovalRequest({
      actionType,
      title: `${item.scheduledFor ? "Schedule" : "Publish"} ${platformLabel} ${item.format} — ${item.title}`,
      connectedAccountId: match?.id ?? null,
      payload: {
        contentItemId: item.id,
        platform: platformLabel,
        format: item.format,
        title: item.title,
        caption: item.caption,
        hashtags: item.hashtags.join(" "),
        scheduledFor: item.scheduledFor ?? "Immediate upon approval",
      },
      requestedByAgent: "social_media_manager",
    })
    await repository.recordAudit({
      action: "approval.requested",
      entityType: "approval_request",
      entityId: approval.id,
      summary: `Requested ${actionType.replace("_", " ")} approval for "${item.title}"`,
      actor: { type: "user", id: context.user.id },
    })
    return { ok: true, data: approval }
  } catch (error) {
    console.error("[tangent] request publish approval failed", error)
    return { ok: false, error: "Could not create the publishing approval request." }
  }
}
