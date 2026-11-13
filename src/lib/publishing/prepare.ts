import type { GeneratedAsset, RequiredAction } from "@/lib/ai/events"
import type { CopyOutput, ExecutionPlan } from "@/lib/ai/outputs"
import { EXTERNAL_ACTION_LABELS } from "@/lib/approvals/engine"
import {
  canonicalProvider,
  findPlatform,
  isPublishablePlatform,
  platformLabel,
  type PlatformConnection,
} from "@/lib/integrations/connections"
import { captionFromVariant, pickVariantForPlatform, type SocialPostPayload } from "@/lib/publishing/payload"

export interface PreparedAction {
  action: RequiredAction
  /** Present when the action is ready to become an approval request. */
  payload: SocialPostPayload | null
}

export interface PrepareInput {
  externalActions: ExecutionPlan["externalActions"]
  connections: PlatformConnection[]
  copies: CopyOutput[]
  image: (GeneratedAsset & { mimeType: string }) | null
  /** Editable Creative Studio design built from the image, published as the post image once approved. */
  creative?: { projectId: string } | null
  /** Why no image is available (image generation failed or was not planned). */
  imageIssue: string | null
  /** Blocks publishing when validation found prohibited messaging. */
  validationIssue: string | null
  title: string
}

const SPEND_ACTIONS = new Set(["launch_ad_campaign", "increase_budget", "change_targeting"])

/**
 * Decides, for each external action the planner requested, whether it can be
 * prepared as an approval request on a connected account — and if not, why.
 * Pure: the orchestrator persists the approvals.
 */
export function prepareExternalActions(input: PrepareInput): PreparedAction[] {
  const seen = new Set<string>()
  const prepared: PreparedAction[] = []

  for (const requested of input.externalActions) {
    const provider = canonicalProvider(requested.platform) ?? requested.platform.toLowerCase()
    const key = `${requested.actionType}:${provider}`
    if (seen.has(key)) continue
    seen.add(key)

    const label = platformLabel(provider)
    const base = {
      actionType: requested.actionType,
      platform: label,
      description: requested.description || EXTERNAL_ACTION_LABELS[requested.actionType],
    }
    const connection = findPlatform(input.connections, provider)
    const block = (state: RequiredAction["state"], reason: string): PreparedAction => ({ action: { ...base, state, reason }, payload: null })

    if (!connection) {
      prepared.push(block("connection_required", `No ${label} account is connected in this workspace.`))
      continue
    }
    if (SPEND_ACTIONS.has(requested.actionType)) {
      prepared.push(block("unsupported", `Ad launches and budget changes are prepared as drafts only; Tangent can't execute them on ${label} yet. Spend always needs your approval.`))
      continue
    }
    if (requested.actionType !== "publish_post") {
      prepared.push(
        block(
          "unsupported",
          requested.actionType === "schedule_post"
            ? "Scheduled publishing needs the background publishing worker, which isn't running yet. Ask Tangent to publish it now and it will be prepared for your approval."
            : `Tangent can't ${EXTERNAL_ACTION_LABELS[requested.actionType].toLowerCase()} automatically yet.`
        )
      )
      continue
    }
    if (!isPublishablePlatform(provider)) {
      prepared.push(block("unsupported", `Tangent can't publish to ${label} automatically yet; the copy above is ready to post.`))
      continue
    }
    const usable = connection.usable
    if (!usable) {
      prepared.push(block("blocked", connection.accounts[0]?.issue ?? `The connected ${label} account can't publish right now.`))
      continue
    }
    if (input.validationIssue) {
      prepared.push(block("blocked", input.validationIssue))
      continue
    }
    const variant = pickVariantForPlatform(input.copies, provider)
    if (!variant) {
      prepared.push(block("blocked", "No caption was written for this post, so there is nothing to publish."))
      continue
    }
    const image = input.image
    if (provider === "instagram") {
      if (!image) {
        prepared.push(block("blocked", `Instagram posts need an image. ${input.imageIssue ?? "No image was generated."}`))
        continue
      }
      if (image.mimeType !== "image/jpeg") {
        prepared.push(block("blocked", "Instagram's publishing API only accepts JPEG images."))
        continue
      }
    }

    const payload: SocialPostPayload = {
      kind: "social_post",
      platform: provider,
      caption: captionFromVariant(variant),
      imageAssetId: image?.assetId ?? null,
      connectedAccountId: usable.account.id,
      accountName: usable.account.displayName,
      externalAccountId: usable.account.externalAccountId,
      title: (variant.headline || input.title).slice(0, 160),
      ...(input.creative && image ? { creativeProjectId: input.creative.projectId, designRendered: false } : {}),
    }
    prepared.push({
      action: {
        ...base,
        state: "awaiting_approval",
        reason: usable.issue ?? undefined,
        account: { id: usable.account.id, name: usable.account.displayName },
        preview: { caption: payload.caption, imageAssetId: payload.imageAssetId, creativeProjectId: payload.creativeProjectId ?? null },
      },
      payload,
    })
  }
  return prepared
}
