"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { ApprovalError } from "@/lib/approvals/engine"
import { approveAndPublish, getPublishStatuses } from "@/lib/publishing/executor"
import type { PublishStatus } from "@/lib/publishing/payload"
import { socialPostPayloadSchema } from "@/lib/publishing/payload"
import { resolveWorkspace } from "@/lib/workspace/server"

export type CommandActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

const idSchema = z.string().min(1).max(64)

function revalidate(slug: string) {
  revalidatePath(`/w/${slug}/approvals`)
  revalidatePath(`/w/${slug}/planner`)
  revalidatePath(`/w/${slug}/assets`)
}

/** Approves an agent-prepared post and publishes it with the connected account. */
export async function approvePublish(workspace: string, approvalId: string): Promise<CommandActionResult<PublishStatus>> {
  if (!idSchema.safeParse(approvalId).success) return { ok: false, error: "Invalid approval." }
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("content.publish")) {
    return { ok: false, error: "Your role can't approve publishing. Ask a workspace owner or admin to approve it." }
  }
  try {
    const status = await approveAndPublish({ repository, approvalId, actorId: context.user.id })
    revalidate(context.workspace.slug)
    return { ok: true, data: status }
  } catch (error) {
    if (error instanceof ApprovalError) return { ok: false, error: error.message }
    console.error("[tangent] approve & publish failed", error)
    return { ok: false, error: "Could not approve and publish. Nothing was posted; try again." }
  }
}

/** Rejects an agent-prepared post. Nothing is published. */
export async function rejectPublish(workspace: string, approvalId: string): Promise<CommandActionResult<PublishStatus>> {
  if (!idSchema.safeParse(approvalId).success) return { ok: false, error: "Invalid approval." }
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("content.publish")) {
    return { ok: false, error: "Your role can't decide on publishing." }
  }
  try {
    await repository.decideApproval(approvalId, "reject", null, context.user.id)
    await repository.recordAudit({
      action: "approval.reject",
      entityType: "approval_request",
      entityId: approvalId,
      summary: "Rejected an agent-prepared post",
      actor: { type: "user", id: context.user.id },
    })
    revalidate(context.workspace.slug)
    const status = (await getPublishStatuses(repository, [approvalId]))[approvalId]
    return status ? { ok: true, data: status } : { ok: false, error: "Approval request not found." }
  } catch (error) {
    if (error instanceof ApprovalError) return { ok: false, error: error.message }
    console.error("[tangent] reject failed", error)
    return { ok: false, error: "Could not record the decision. Try again." }
  }
}

/**
 * Retries a failed publish. Approvals are immutable and a failed one can't run
 * again, so this creates a new version with the identical payload, then approves
 * and publishes it — still a deliberate human action.
 */
export async function retryPublish(workspace: string, approvalId: string): Promise<CommandActionResult<PublishStatus>> {
  if (!idSchema.safeParse(approvalId).success) return { ok: false, error: "Invalid approval." }
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("content.publish")) {
    return { ok: false, error: "Your role can't approve publishing." }
  }
  try {
    const previous = await repository.getApprovalRequest(approvalId)
    if (!previous) return { ok: false, error: "Approval request not found." }
    if (previous.status !== "failed") return { ok: false, error: "Only failed posts can be retried." }
    const payload = socialPostPayloadSchema.safeParse(previous.payload)
    if (!payload.success) return { ok: false, error: "This approval isn't a social post Tangent can publish." }
    const request = {
      actionType: previous.actionType,
      title: `${payload.data.platform === "instagram" ? "Instagram" : "Facebook"} post for ${payload.data.accountName}: ${payload.data.title}`.slice(0, 200),
      payload: { ...payload.data },
      requestedByAgent: previous.requestedByAgent,
      previousVersionId: previous.id,
    }
    let revision
    try {
      revision = await repository.createApprovalRequest({ ...request, connectedAccountId: previous.connectedAccountId })
    } catch {
      revision = await repository.createApprovalRequest(request)
    }
    const status = await approveAndPublish({ repository, approvalId: revision.id, actorId: context.user.id })
    revalidate(context.workspace.slug)
    return { ok: true, data: status }
  } catch (error) {
    if (error instanceof ApprovalError) return { ok: false, error: error.message }
    console.error("[tangent] retry publish failed", error)
    return { ok: false, error: "Could not retry. Nothing was posted." }
  }
}

/** Current approval / publish state for approval cards rendered from saved runs. */
export async function loadPublishStatuses(workspace: string, approvalIds: string[]): Promise<CommandActionResult<Record<string, PublishStatus>>> {
  const ids = z.array(idSchema).max(20).safeParse(approvalIds)
  if (!ids.success) return { ok: false, error: "Invalid request." }
  const { repository } = await resolveWorkspace(workspace)
  try {
    return { ok: true, data: await getPublishStatuses(repository, ids.data) }
  } catch (error) {
    console.error("[tangent] load publish statuses failed", error)
    return { ok: false, error: "Could not load approval status." }
  }
}

/** Fresh signed URLs for generated images (signed URLs expire after a few hours). */
export async function refreshAssetUrls(workspace: string, assetIds: string[]): Promise<CommandActionResult<Record<string, string>>> {
  const ids = z.array(idSchema).max(20).safeParse(assetIds)
  if (!ids.success) return { ok: false, error: "Invalid request." }
  const { repository } = await resolveWorkspace(workspace)
  try {
    return { ok: true, data: await repository.resolveAssetUrls(ids.data) }
  } catch {
    return { ok: false, error: "Could not load the images." }
  }
}
