import type {
  ApprovalStatus,
  ExternalActionType,
  FinancialImpact,
} from "@/lib/approvals/engine"

/** Approval request as presented in the UI (payload rendered as labelled fields). */
export interface ApprovalView {
  id: string
  version: number
  actionType: ExternalActionType
  title: string
  account: { provider: string; name: string; connected: boolean } | null
  /** Exact content / configuration that will be executed, field by field. */
  details: { label: string; value: string }[]
  financialImpact: FinancialImpact | null
  requestedByAgent: string
  requestedAt: string
  status: ApprovalStatus
  decisionNote: string | null
  isSample: boolean
}

export const APPROVAL_DECISIONS = ["approve", "reject", "request_changes"] as const
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number]

export function decisionToStatus(decision: ApprovalDecision): ApprovalStatus {
  switch (decision) {
    case "approve":
      return "approved"
    case "reject":
      return "rejected"
    case "request_changes":
      return "changes_requested"
    default: {
      const unreachable: never = decision
      throw new Error(`Unknown decision ${String(unreachable)}`)
    }
  }
}
