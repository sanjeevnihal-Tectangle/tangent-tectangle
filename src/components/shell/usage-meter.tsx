"use client"

import Link from "next/link"

import { useWorkspace } from "@/components/workspace/workspace-provider"
import { Progress } from "@/components/ui/progress"
import { DEFAULT_PLANS, ENTITLEMENT_LABELS } from "@/lib/billing/plans"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

export function UsageMeter() {
  const { usage, workspace } = useWorkspace()
  const credits = usage.find((u) => u.key === "ai_credits_monthly")
  if (!credits) return null

  const ratio = credits.limit ? Math.min(1, credits.used / credits.limit) : 0
  return (
    <Link
      href={`/w/${workspace.slug}/settings#usage`}
      className="block rounded-lg border border-sidebar-border bg-background/60 p-3 transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:hidden"
    >
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-sidebar-accent-foreground">{ENTITLEMENT_LABELS.ai_credits_monthly}</span>
        <span className="tabular text-muted-foreground">
          {formatNumber(credits.used)}
          {credits.limit !== null ? ` / ${formatNumber(credits.limit)}` : ""}
        </span>
      </div>
      <Progress
        value={ratio * 100}
        aria-label="AI credits used this month"
        className={cn("mt-2 h-1", ratio > 0.9 && "[&>[data-slot=progress-indicator]]:bg-destructive")}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        {DEFAULT_PLANS[workspace.planId].name} plan · resets monthly
      </p>
    </Link>
  )
}
