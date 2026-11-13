import "server-only"

import { ApprovalError, assertExecutable } from "@/lib/approvals/engine"
import type { WorkspaceRepository } from "@/lib/data/types"
import type { ContentItem } from "@/lib/domain/content"
import { serverEnv } from "@/lib/env/server"
import { accountReadiness, platformLabel } from "@/lib/integrations/connections"
import { CredentialCryptoError, decryptToken } from "@/lib/integrations/crypto"
import { IntegrationError } from "@/lib/integrations/gateway"
import { publishFacebookPost, publishInstagramImage, type FetchLike, type PublishResult } from "@/lib/integrations/meta-publisher"
import { socialPostPayloadSchema, type PublishStatus, type SocialPostPayload } from "@/lib/publishing/payload"

/**
 * Executes approved social posts. This is the only code path that decrypts a
 * stored token and publishes; it runs server-side after a human with
 * `content.publish` approved the exact payload in the app.
 */

function userSafeMessage(error: unknown): string {
  if (error instanceof CredentialCryptoError) {
    return error.code === "not_configured"
      ? `${error.message}. Set a permanent INTEGRATION_ENCRYPTION_KEY in the server environment, then reconnect the account.`
      : "The stored access token can't be decrypted with the server's current INTEGRATION_ENCRYPTION_KEY (the key changed after the account was connected). Set a permanent key in the server environment and reconnect the account."
  }
  if (error instanceof IntegrationError || error instanceof ApprovalError) {
    return error.message
  }
  console.error("[tangent] publish failed", error)
  return "Publishing failed unexpectedly. Nothing was posted; try again."
}

async function publishPayload(
  repository: WorkspaceRepository,
  payload: SocialPostPayload,
  fetchImpl?: FetchLike
): Promise<PublishResult> {
  const account = (await repository.listConnectedAccounts()).find((a) => a.id === payload.connectedAccountId)
  if (!account) {
    throw new IntegrationError(`The ${platformLabel(payload.platform)} account "${payload.accountName}" is no longer connected. Reconnect it on the Integrations page.`, "not_configured")
  }
  const readiness = accountReadiness(account)
  if (!readiness.usable) throw new IntegrationError(readiness.issue ?? "This account can't publish right now.", "permission_denied")

  const credential = await repository.getConnectedAccountCredential(account.id)
  if (!credential) {
    throw new IntegrationError(`No access token is stored for "${account.displayName}". Reconnect it on the Integrations page (OAuth or direct token).`, "not_configured")
  }
  const { plaintext: accessToken } = decryptToken(credential.accessTokenCiphertext, serverEnv().INTEGRATION_ENCRYPTION_KEY)

  let imageUrl: string | null = null
  if (payload.imageAssetId) {
    imageUrl = (await repository.resolveAssetUrls([payload.imageAssetId]))[payload.imageAssetId] ?? null
    if (!imageUrl) throw new IntegrationError("The post's image is no longer in the Asset Library.", "provider_error")
  }

  switch (payload.platform) {
    case "instagram":
      if (!imageUrl) throw new IntegrationError("Instagram posts need an image.", "provider_error")
      return publishInstagramImage({ igUserId: payload.externalAccountId, accessToken, imageUrl, caption: payload.caption, fetchImpl })
    case "facebook":
      return publishFacebookPost({ pageId: payload.externalAccountId, accessToken, caption: payload.caption, imageUrl, fetchImpl })
    default: {
      const unreachable: never = payload.platform
      throw new Error(`Unknown platform ${String(unreachable)}`)
    }
  }
}

function contentItemFor(payload: SocialPostPayload, status: "published" | "failed", error: string | null): ContentItem {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: (payload.title || `${platformLabel(payload.platform)} post`).slice(0, 160),
    platform: payload.platform,
    format: "Post",
    caption: payload.caption,
    hashtags: [],
    scheduledFor: now,
    status,
    creativeProjectId: null,
    mediaAssetIds: payload.imageAssetId ? [payload.imageAssetId] : [],
    reviewNote: error ? error.slice(0, 1000) : null,
    updatedAt: now,
  }
}

/** Current state of approvals created by agents, with publish results when available. */
export async function getPublishStatuses(repository: WorkspaceRepository, approvalIds: string[]): Promise<Record<string, PublishStatus>> {
  const ids = [...new Set(approvalIds)].slice(0, 20)
  if (ids.length === 0) return {}
  const [requests, jobs] = await Promise.all([
    Promise.all(ids.map((id) => repository.getApprovalRequest(id))),
    repository.listPublishingJobs().catch(() => []),
  ])
  const result: Record<string, PublishStatus> = {}
  for (const request of requests) {
    if (!request) continue
    const job = jobs.find((j) => j.approvalRequestId === request.id)
    const parsed = socialPostPayloadSchema.safeParse(request.payload)
    const postId = job?.externalPostId ?? null
    result[request.id] = {
      approvalId: request.id,
      approvalStatus: request.status,
      externalPostId: postId,
      permalink: postId && parsed.success && parsed.data.platform === "facebook" ? `https://www.facebook.com/${postId}` : null,
      error: job?.lastError ?? null,
    }
  }
  return result
}

/**
 * Approves (if still pending) and publishes one agent-prepared social post.
 * The caller must already have checked the `content.publish` permission.
 */
export async function approveAndPublish(input: {
  repository: WorkspaceRepository
  approvalId: string
  actorId: string
  fetchImpl?: FetchLike
}): Promise<PublishStatus> {
  const { repository, approvalId, actorId } = input
  const status = (approvalStatus: PublishStatus["approvalStatus"], rest: Partial<PublishStatus> = {}): PublishStatus => ({
    approvalId,
    approvalStatus,
    externalPostId: null,
    permalink: null,
    error: null,
    ...rest,
  })

  let request = await repository.getApprovalRequest(approvalId)
  if (!request) return status("failed", { error: "Approval request not found." })
  const parsed = socialPostPayloadSchema.safeParse(request.payload)
  if (!parsed.success) {
    return status(request.status, { error: "This approval isn't a social post Tangent can publish automatically." })
  }
  const payload = parsed.data

  if (request.status === "pending") {
    await repository.decideApproval(approvalId, "approve", null, actorId)
    await repository.recordAudit({
      action: "approval.approve",
      entityType: "approval_request",
      entityId: approvalId,
      summary: `Approved ${platformLabel(payload.platform)} post for ${payload.accountName}`,
      actor: { type: "user", id: actorId },
      metadata: { version: request.version },
    })
    request = await repository.getApprovalRequest(approvalId)
    if (!request) return status("failed", { error: "Approval request not found." })
  }

  if (request.status === "executed" || request.status === "executing" || request.status === "failed") {
    const existing = (await getPublishStatuses(repository, [approvalId]))[approvalId]
    return existing ?? status(request.status)
  }

  // Throws unless approved and the payload is byte-identical to what was approved.
  await assertExecutable(request, payload)

  const claimed = await repository.setApprovalExecutionStatus(approvalId, "approved", "executing")
  if (!claimed) return status("executing", { error: "This post is already being published." })

  try {
    const result = await publishPayload(repository, payload, input.fetchImpl)
    await repository.setApprovalExecutionStatus(approvalId, "executing", "executed")
    await safely(() =>
      repository.recordPublishing({
        approvalRequestId: approvalId,
        connectedAccountId: payload.connectedAccountId,
        contentItem: contentItemFor(payload, "published", null),
        status: "succeeded",
        externalPostId: result.externalPostId,
        lastError: null,
      })
    )
    await safely(() =>
      repository.recordAudit({
        action: "publishing.succeeded",
        entityType: "approval_request",
        entityId: approvalId,
        summary: `Published to ${platformLabel(payload.platform)} (${payload.accountName})`,
        actor: { type: "user", id: actorId },
        metadata: { platform: payload.platform, externalPostId: result.externalPostId, permalink: result.permalink },
      })
    )
    return status("executed", { externalPostId: result.externalPostId, permalink: result.permalink })
  } catch (error) {
    const message = userSafeMessage(error)
    await safely(() => repository.setApprovalExecutionStatus(approvalId, "executing", "failed"))
    await safely(() =>
      repository.recordPublishing({
        approvalRequestId: approvalId,
        connectedAccountId: payload.connectedAccountId,
        contentItem: contentItemFor(payload, "failed", message),
        status: "failed",
        externalPostId: null,
        lastError: message,
      })
    )
    await safely(() =>
      repository.recordAudit({
        action: "publishing.failed",
        entityType: "approval_request",
        entityId: approvalId,
        summary: `Publishing to ${platformLabel(payload.platform)} failed`,
        actor: { type: "user", id: actorId },
        metadata: { platform: payload.platform, error: message },
      })
    )
    return status("failed", { error: message })
  }
}

async function safely(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (error) {
    console.error("[tangent] publishing bookkeeping failed", error)
  }
}
