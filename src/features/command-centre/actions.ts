"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { ApprovalError } from "@/lib/approvals/engine"
import type { DesignDocument } from "@/lib/creative/document"
import { approveAndPublish, getPublishStatuses, latestApprovalId } from "@/lib/publishing/executor"
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
    approvalId = await latestApprovalId(repository, approvalId)
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
    const previous = await repository.getApprovalRequest(await latestApprovalId(repository, approvalId))
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

function designAssetIds(document: DesignDocument): string[] {
  const ids = new Set<string>()
  for (const page of document.pages) {
    if (page.background.type === "image") ids.add(page.background.assetId)
    for (const layer of page.layers) if (layer.type === "image" && layer.assetId) ids.add(layer.assetId)
  }
  return [...ids]
}

export interface CreativePreview {
  projectId: string
  name: string
  document: DesignDocument
  assetUrls: Record<string, string>
}

/** The current (possibly edited) Creative Studio design behind an agent-prepared post. */
export async function loadCreativePreview(workspace: string, projectId: string): Promise<CommandActionResult<CreativePreview>> {
  if (!idSchema.safeParse(projectId).success) return { ok: false, error: "Invalid design." }
  const { repository } = await resolveWorkspace(workspace)
  try {
    const project = await repository.getCreativeProject(projectId)
    if (!project) return { ok: false, error: "The design was deleted from Creative Studio." }
    const assetUrls = await repository.resolveAssetUrls(designAssetIds(project.document))
    return { ok: true, data: { projectId: project.id, name: project.name, document: project.document, assetUrls } }
  } catch (error) {
    console.error("[tangent] load creative preview failed", error)
    return { ok: false, error: "Could not load the design." }
  }
}

const MAX_RENDER_BYTES = 8 * 1024 * 1024

/**
 * Approves and publishes a post whose image is an editable Creative Studio
 * design. The browser renders the design as the user sees it (JPEG); this saves
 * the render, records it as a new approval version with that exact image, and
 * publishes that version. multipart: image (image/jpeg).
 */
export async function publishDesign(workspace: string, approvalId: string, formData: FormData): Promise<CommandActionResult<PublishStatus>> {
  if (!idSchema.safeParse(approvalId).success) return { ok: false, error: "Invalid approval." }
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("content.publish")) {
    return { ok: false, error: "Your role can't approve publishing. Ask a workspace owner or admin to approve it." }
  }
  const file = formData.get("image")
  if (!(file instanceof File) || file.type !== "image/jpeg" || file.size === 0 || file.size > MAX_RENDER_BYTES) {
    return { ok: false, error: "Rendering the design failed (expected a JPEG under 8 MB). Try again." }
  }
  try {
    const previous = await repository.getApprovalRequest(await latestApprovalId(repository, approvalId))
    if (!previous) return { ok: false, error: "Approval request not found." }
    if (previous.status === "executed" || previous.status === "executing") {
      const current = (await getPublishStatuses(repository, [previous.id]))[previous.id]
      return current ? { ok: true, data: current } : { ok: false, error: "This post is already being published." }
    }
    if (!["pending", "approved", "failed"].includes(previous.status)) {
      return { ok: false, error: `This post can't be published (status: ${previous.status.replace("_", " ")}).` }
    }
    const parsed = socialPostPayloadSchema.safeParse(previous.payload)
    if (!parsed.success || !parsed.data.creativeProjectId) return { ok: false, error: "This post has no Creative Studio design." }
    const project = await repository.getCreativeProject(parsed.data.creativeProjectId)
    if (!project) return { ok: false, error: "The design was deleted from Creative Studio." }

    const asset = await repository.uploadAsset({
      name: `${project.name}`.slice(0, 60),
      mimeType: "image/jpeg",
      bytes: new Uint8Array(await file.arrayBuffer()),
      width: project.document.width,
      height: project.document.height,
      tags: ["creative-export", "command-centre"],
      source: "upload",
      generation: null,
    })
    const payload = { ...parsed.data, imageAssetId: asset.id, designRendered: true }
    const request = {
      actionType: previous.actionType,
      title: `${payload.platform === "instagram" ? "Instagram" : "Facebook"} post for ${payload.accountName}: ${payload.title}`.slice(0, 200),
      payload,
      requestedByAgent: previous.requestedByAgent,
      previousVersionId: previous.id,
    }
    let revision
    try {
      revision = await repository.createApprovalRequest({ ...request, connectedAccountId: previous.connectedAccountId })
    } catch {
      revision = await repository.createApprovalRequest(request)
    }
    await repository.recordAudit({
      action: "creative.rendered",
      entityType: "creative_project",
      entityId: project.id,
      summary: `Rendered "${project.name}" for a ${payload.platform} post`,
      actor: { type: "user", id: context.user.id },
      metadata: { approvalId: revision.id, assetId: asset.id },
    })
    const status = await approveAndPublish({ repository, approvalId: revision.id, actorId: context.user.id })
    revalidate(context.workspace.slug)
    return { ok: true, data: status }
  } catch (error) {
    if (error instanceof ApprovalError) return { ok: false, error: error.message }
    console.error("[tangent] publish design failed", error)
    return { ok: false, error: "Could not publish the design. Nothing was posted; try again." }
  }
}
