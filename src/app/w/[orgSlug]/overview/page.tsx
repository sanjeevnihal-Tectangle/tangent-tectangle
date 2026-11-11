import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"

import { PageContainer } from "@/components/page/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { OverviewDashboard } from "@/features/dashboard/overview-dashboard"
import {
  buildDemoCampaigns,
  buildDemoDailyMetrics,
  buildDemoUpcomingContent,
  DEMO_ACTIVITIES,
  DEMO_RECOMMENDATIONS,
} from "@/lib/demo/dashboard"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Overview" }

function greetingFor(date: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(date)
  )
  if (hour < 5) return "Good evening"
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

async function Overview({ params }: { params: PageProps<"/w/[orgSlug]/overview">["params"] }) {
  const { orgSlug } = await params
  const { repository } = await resolveWorkspace(orgSlug)
  const approvals = await repository.listApprovals()
  await connection()
  const today = new Date()

  return (
    <OverviewDashboard
      data={{
        greeting: greetingFor(today),
        series: buildDemoDailyMetrics(today),
        campaigns: buildDemoCampaigns(today),
        upcoming: buildDemoUpcomingContent(today),
        activities: DEMO_ACTIVITIES,
        recommendations: DEMO_RECOMMENDATIONS,
        approvals,
      }}
    />
  )
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Skeleton className="h-12 w-80" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-80 xl:col-span-2" />
        <Skeleton className="h-80" />
      </div>
    </div>
  )
}

export default function OverviewPage({ params }: PageProps<"/w/[orgSlug]/overview">) {
  return (
    <PageContainer>
      <Suspense fallback={<OverviewSkeleton />}>
        <Overview params={params} />
      </Suspense>
    </PageContainer>
  )
}
