"use server"

import { z } from "zod"

import { ApprovalError } from "@/lib/approvals/engine"
import { APPROVAL_DECISIONS, type ApprovalView } from "@/lib/domain/approvals"
import { approveAndPublish } from "@/lib/publishing/executor"
import { socialPostPayloadSchema, type PublishStatus } from "@/lib/publishing/payload"
import { resolveWorkspace } from "@/lib/workspace/server"

const SPEND_ACTIONS = new Set(["launch_ad_campaign", "increase_budget", "change_targeting"])

const decisionSchema = z.object({
  workspace: z.string().min(1),
  approvalId: z.string().min(1),
  decision: z.enum(APPROVAL_DECISIONS),
  note: z.string().trim().max(1000).nullable(),
})

export type DecideApprovalResult =
  | { ok: true; approval: ApprovalView; publish?: PublishStatus }
  | { ok: false; error: string }

export async function decideApproval(input: z.input<typeof decisionSchema>): Promise<DecideApprovalResult> {
  const parsed = decisionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid decision" }
  const { workspace, approvalId, decision, note } = parsed.data

  if (decision === "request_changes" && !note) {
    return { ok: false, error: "Describe the changes you want." }
  }

  const { context, repository } = await resolveWorkspace(workspace)
  const approvals = await repository.listApprovals()
  const target = approvals.find((a) => a.id === approvalId)
  if (!target) return { ok: false, error: "Approval request not found." }

  const permission = SPEND_ACTIONS.has(target.actionType) ? "ads.approve_spend" : "content.publish"
  if (!context.permissions.includes(permission)) {
    return { ok: false, error: "Your role cannot decide on this type of action." }
  }

  try {
    const approval = await repository.decideApproval(approvalId, decision, note, context.user.id)
    await repository.recordAudit({
      action: `approval.${decision}`,
      entityType: "approval_request",
      entityId: approvalId,
      summary: `${target.title} — ${decision.replace("_", " ")}`,
      actor: { type: "user", id: context.user.id },
      metadata: { version: target.version, note },
    })
    // Agent-prepared social posts execute as soon as they are approved.
    if (decision === "approve") {
      const request = await repository.getApprovalRequest(approvalId)
      if (request && socialPostPayloadSchema.safeParse(request.payload).success) {
        const publish = await approveAndPublish({ repository, approvalId, actorId: context.user.id })
        const refreshed = (await repository.listApprovals()).find((a) => a.id === approvalId) ?? approval
        return { ok: true, approval: refreshed, publish }
      }
    }
    return { ok: true, approval }
  } catch (error) {
    if (error instanceof ApprovalError) return { ok: false, error: error.message }
    console.error("[tangent] approval decision failed", error)
    return { ok: false, error: "Could not record the decision. Try again." }
  }
}
