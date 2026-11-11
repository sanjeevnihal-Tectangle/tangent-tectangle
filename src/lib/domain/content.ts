import { z } from "zod"

export const CONTENT_STATUSES = ["draft", "in_review", "approved", "scheduled", "published", "failed"] as const
export type ContentStatus = (typeof CONTENT_STATUSES)[number]

/** Statuses a user can set directly. scheduled/published/failed come from the publishing engine. */
export const EDITABLE_CONTENT_STATUSES = ["draft", "in_review", "approved"] as const

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
}

export const CONTENT_PLATFORMS = ["instagram", "facebook", "youtube", "linkedin"] as const
export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number]

export const CONTENT_PLATFORM_LABELS: Record<ContentPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  linkedin: "LinkedIn",
}

export const CONTENT_FORMATS: Record<ContentPlatform, string[]> = {
  instagram: ["Post", "Carousel", "Reel", "Story"],
  facebook: ["Post", "Video", "Story"],
  youtube: ["Short", "Video", "Community post"],
  linkedin: ["Post", "Document", "Video"],
}

export const contentItemSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(2, "Give the post a title").max(160),
  platform: z.enum(CONTENT_PLATFORMS),
  format: z.string().trim().min(1).max(40),
  caption: z.string().max(2200, "Instagram captions are limited to 2,200 characters"),
  hashtags: z.array(z.string().trim().regex(/^#?[\p{L}\p{N}_]+$/u, "Hashtags can only contain letters, numbers and _")).max(30),
  scheduledFor: z.string().datetime({ offset: true }).nullable(),
  status: z.enum(CONTENT_STATUSES),
  creativeProjectId: z.string().nullable(),
  mediaAssetIds: z.array(z.string()).max(10),
  reviewNote: z.string().max(1000).nullable(),
  updatedAt: z.string(),
})
export type ContentItem = z.infer<typeof contentItemSchema>

export function normalizeHashtag(tag: string): string {
  const trimmed = tag.trim().replace(/\s+/g, "")
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`
}
