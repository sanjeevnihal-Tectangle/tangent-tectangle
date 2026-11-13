"use client"

import { Bot, IndianRupee, PlugZap, ShieldCheck } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { DemoBadge } from "@/components/data/demo-badge"
import { StatusPill } from "@/components/data/status-pill"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { decideApproval } from "@/features/approvals/actions"
import { EXTERNAL_ACTION_LABELS, type FinancialImpact } from "@/lib/approvals/engine"
import type { ApprovalDecision, ApprovalView } from "@/lib/domain/approvals"
import { formatINR } from "@/lib/format"

const SPEND_ACTIONS = new Set(["launch_ad_campaign", "increase_budget", "change_targeting"])

function describeImpact(impact: FinancialImpact | null): string {
  if (!impact) return "No direct spend"
  const amount = formatINR(impact.maxSpendPaise / 100)
  switch (impact.period) {
    case "daily":
      return `Up to ${amount} additional per day`
    case "one_time":
      return `Up to ${amount} one-time`
    case "lifetime":
      return `Up to ${amount} over the campaign lifetime`
    default: {
      const unreachable: never = impact.period
      return String(unreachable)
    }
  }
}

function ApprovalDialog({
  approval,
  open,
  onOpenChange,
  onDecided,
}: {
  approval: ApprovalView
  open: boolean
  onOpenChange: (open: boolean) => void
  onDecided: (approval: ApprovalView) => void
}) {
  const { workspace } = useWorkspace()
  const canDecide = useCan(SPEND_ACTIONS.has(approval.actionType) ? "ads.approve_spend" : "content.publish")
  const [note, setNote] = useState("")
  const [pending, startTransition] = useTransition()

  const decide = (decision: ApprovalDecision) =>
    startTransition(async () => {
      const result = await decideApproval({
        workspace: workspace.slug,
        approvalId: approval.id,
        decision,
        note: note.trim() || null,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onDecided(result.approval)
      onOpenChange(false)
      setNote("")
      if (result.publish) {
        if (result.publish.error) toast.error(result.publish.error)
        else toast.success(result.publish.permalink ? `Published: ${result.publish.permalink}` : "Approved and published.")
        return
      }
      toast.success(
        decision === "approve"
          ? approval.account?.connected
            ? "Approved. The action will execute as configured."
            : `Approved. It will not run until ${approval.account?.provider ?? "the account"} is connected.`
          : decision === "reject"
            ? "Rejected. Nothing will be executed."
            : "Changes requested. The agent will prepare a new version for approval."
      )
    })

  const isPending = approval.status === "pending"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill kind="approval" status={approval.status} />
            {approval.isSample ? <DemoBadge label="Sample request" detail="Sample approval request for the demo workspace." /> : null}
          </div>
          <DialogTitle className="pt-1">{approval.title}</DialogTitle>
          <DialogDescription>
            {EXTERNAL_ACTION_LABELS[approval.actionType]} · version {approval.version}. Review the exact configuration below.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 rounded-lg border bg-muted/30 p-3 text-sm">
          <dt className="text-muted-foreground">Account</dt>
          <dd className="flex flex-wrap items-center gap-1.5">
            {approval.account ? `${approval.account.provider} · ${approval.account.name}` : "—"}
            {approval.account && !approval.account.connected ? (
              <span className="inline-flex items-center gap-1 text-xs text-warning">
                <PlugZap className="size-3" /> Not connected
              </span>
            ) : null}
          </dd>
          {approval.details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd className="break-words whitespace-pre-wrap">{d.value}</dd>
            </div>
          ))}
          <dt className="text-muted-foreground">Financial impact</dt>
          <dd className="flex items-center gap-1">
            <IndianRupee className="size-3.5 text-muted-foreground" />
            {describeImpact(approval.financialImpact)}
          </dd>
          <dt className="text-muted-foreground">Requested by</dt>
          <dd className="flex items-center gap-1.5">
            <Bot className="size-3.5 text-brand" />
            {approval.requestedByAgent}
          </dd>
          {approval.decisionNote ? (
            <>
              <dt className="text-muted-foreground">Decision note</dt>
              <dd>{approval.decisionNote}</dd>
            </>
          ) : null}
        </dl>

        {isPending && canDecide ? (
          <div className="space-y-1.5">
            <Label htmlFor={`note-${approval.id}`}>Note (required to request changes)</Label>
            <Textarea
              id={`note-${approval.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Use the second caption and post at 6 PM instead"
              rows={2}
            />
          </div>
        ) : null}

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          Approval is tied to this exact version. If anything changes, Tangent creates a new version that needs approval again.
        </p>

        {isPending ? (
          canDecide ? (
            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="destructive" disabled={pending} onClick={() => decide("reject")}>
                Reject
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" disabled={pending} onClick={() => decide("request_changes")}>
                  Request changes
                </Button>
                <Button disabled={pending} onClick={() => decide("approve")}>
                  Approve
                </Button>
              </div>
            </DialogFooter>
          ) : (
            <p className="text-sm text-muted-foreground">Your role can view but not decide on this request.</p>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export function ApprovalList({ initial, compact = false }: { initial: ApprovalView[]; compact?: boolean }) {
  const [approvals, setApprovals] = useState(initial)
  const [openId, setOpenId] = useState<string | null>(null)

  if (approvals.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No actions are waiting for approval.</p>
  }

  return (
    <ul className="divide-y">
      {approvals.map((approval) => (
        <li key={approval.id}>
          <button
            type="button"
            onClick={() => setOpenId(approval.id)}
            className="flex w-full items-start gap-3 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
          >
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{approval.title}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {approval.account?.provider ?? "Workspace"} · {approval.requestedByAgent}
                {approval.financialImpact && !compact ? ` · ${describeImpact(approval.financialImpact)}` : ""}
              </span>
            </span>
            <StatusPill kind="approval" status={approval.status} />
          </button>
          <ApprovalDialog
            approval={approval}
            open={openId === approval.id}
            onOpenChange={(open) => setOpenId(open ? approval.id : null)}
            onDecided={(updated) => setApprovals((list) => list.map((a) => (a.id === updated.id ? updated : a)))}
          />
        </li>
      ))}
    </ul>
  )
}
