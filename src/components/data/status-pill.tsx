import { Badge } from "@/components/ui/badge"
import type { ApprovalStatus } from "@/lib/approvals/engine"
import type { DemoCampaign, DemoContentItem } from "@/lib/demo/dashboard"

type Variant = "muted" | "info" | "warning" | "success" | "brand" | "danger"

function campaignStatus(status: DemoCampaign["status"]): [string, Variant] {
  switch (status) {
    case "draft":
      return ["Draft", "muted"]
    case "planning":
      return ["Planning", "info"]
    case "production":
      return ["Production", "info"]
    case "review":
      return ["Review", "warning"]
    case "approved":
      return ["Approved", "success"]
    case "active":
      return ["Active", "brand"]
    case "completed":
      return ["Completed", "muted"]
    default: {
      const unreachable: never = status
      return [String(unreachable), "muted"]
    }
  }
}

function contentStatus(status: DemoContentItem["status"]): [string, Variant] {
  switch (status) {
    case "draft":
      return ["Draft", "muted"]
    case "in_review":
      return ["In review", "warning"]
    case "approved":
      return ["Approved", "success"]
    case "scheduled":
      return ["Scheduled", "info"]
    default: {
      const unreachable: never = status
      return [String(unreachable), "muted"]
    }
  }
}

export function approvalStatusLabel(status: ApprovalStatus): [string, Variant] {
  switch (status) {
    case "pending":
      return ["Awaiting approval", "warning"]
    case "approved":
      return ["Approved", "success"]
    case "rejected":
      return ["Rejected", "danger"]
    case "changes_requested":
      return ["Changes requested", "info"]
    case "superseded":
      return ["Superseded", "muted"]
    case "executing":
      return ["Executing", "brand"]
    case "executed":
      return ["Executed", "success"]
    case "failed":
      return ["Failed", "danger"]
    case "expired":
      return ["Expired", "muted"]
    default: {
      const unreachable: never = status
      return [String(unreachable), "muted"]
    }
  }
}

export function StatusPill(
  props:
    | { kind: "campaign"; status: DemoCampaign["status"] }
    | { kind: "content"; status: DemoContentItem["status"] }
    | { kind: "approval"; status: ApprovalStatus }
) {
  const [label, variant] =
    props.kind === "campaign"
      ? campaignStatus(props.status)
      : props.kind === "content"
        ? contentStatus(props.status)
        : approvalStatusLabel(props.status)
  return <Badge variant={variant}>{label}</Badge>
}
