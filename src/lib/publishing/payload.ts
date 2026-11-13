import { z } from "zod"

import type { CopyOutput } from "@/lib/ai/outputs"
import type { ApprovalStatus } from "@/lib/approvals/engine"
import { canonicalProvider, PUBLISHABLE_PLATFORMS, type PublishablePlatform } from "@/lib/integrations/connections"

/**
 * Exact content of a social post awaiting approval. Stored as the approval
 * request payload (hashed, immutable); the executor publishes exactly this.
 * No tokens: the account is referenced by id and its token stays in the vault.
 */
export const socialPostPayloadSchema = z.object({
  kind: z.literal("social_post"),
  platform: z.enum(PUBLISHABLE_PLATFORMS),
  caption: z.string().max(2200),
  imageAssetId: z.string().nullable(),
  connectedAccountId: z.string().min(1),
  accountName: z.string(),
  externalAccountId: z.string().min(1),
  title: z.string().max(160),
  /**
   * Editable Creative Studio design for this post. While designRendered is not
   * true, imageAssetId is only the background photo: the final image is the
   * design rendered when the user approves (see publishDesign).
   */
  creativeProjectId: z.string().optional(),
  designRendered: z.boolean().optional(),
})
export type SocialPostPayload = z.infer<typeof socialPostPayloadSchema>

export const INSTAGRAM_MAX_HASHTAGS = 30
export const CAPTION_MAX_LENGTH = 2200

type CopyVariant = CopyOutput["variants"][number]

function normalizeTag(tag: string): string | null {
  const cleaned = tag.trim().replace(/\s+/g, "").replace(/^#+/, "")
  return /^[\p{L}\p{N}_]+$/u.test(cleaned) ? `#${cleaned}` : null
}

/** Builds a publishable caption from a copy variant (body, CTA, hashtags), within platform limits. */
export function captionFromVariant(variant: CopyVariant): string {
  const body = variant.body.trim()
  const cta = variant.callToAction.trim()
  const includeCta = cta && !body.toLowerCase().includes(cta.toLowerCase())
  const tags = [...new Set(variant.hashtags.map(normalizeTag).filter((t): t is string => Boolean(t)))]
    .filter((t) => !body.includes(t))
    .slice(0, INSTAGRAM_MAX_HASHTAGS)
  const caption = [body, includeCta ? cta : null, tags.length ? tags.join(" ") : null].filter(Boolean).join("\n\n")
  return caption.length > CAPTION_MAX_LENGTH ? caption.slice(0, CAPTION_MAX_LENGTH - 1).trimEnd() + "…" : caption
}

/** Picks the copy variant written for a platform, falling back to the first variant. */
export function pickVariantForPlatform(copies: CopyOutput[], platform: PublishablePlatform): CopyVariant | null {
  const variants = copies.flatMap((c) => c.variants)
  return variants.find((v) => canonicalProvider(v.platform) === platform) ?? variants[0] ?? null
}

/** Result of an executed (or failed) publish, shown on the approval card. */
export interface PublishStatus {
  approvalId: string
  approvalStatus: ApprovalStatus
  externalPostId: string | null
  permalink: string | null
  error: string | null
}
