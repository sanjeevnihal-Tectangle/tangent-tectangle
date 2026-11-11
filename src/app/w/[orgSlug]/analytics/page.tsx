import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"

import { PageContainer } from "@/components/page/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { AnalyticsWorkspace } from "@/features/analytics/analytics-workspace"
import { buildDemoDailyMetrics } from "@/lib/demo/dashboard"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Analytics & Insights" }

export default function AnalyticsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  return (
    <PageContainer>
      <Suspense fallback={<Skeleton className="h-[620px] w-full rounded-xl" />}>
        <AnalyticsLoader params={params} />
      </Suspense>
    </PageContainer>
  )
}

async function AnalyticsLoader({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  await connection()
  const { orgSlug } = await params
  const { repository } = await resolveWorkspace(orgSlug)

  const now = new Date()
  const from = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString()
  const to = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()

  const [
    liveEvents,
    campaigns,
    contentItems,
    creativeProjects,
    connectedAccounts,
  ] = await Promise.all([
    repository.listAnalyticsEvents({ from, to }),
    repository.listCampaigns(),
    repository.listContentItems({ from, to }),
    repository.listCreativeProjects(),
    repository.listConnectedAccounts(),
  ])

  const series = buildDemoDailyMetrics(now)

  return (
    <AnalyticsWorkspace
      series={series}
      liveEvents={liveEvents}
      inventory={{
        campaignsCount: campaigns.length,
        activeCampaignsCount: campaigns.filter((c) => c.status === "active").length,
        contentTotal: contentItems.length,
        contentApproved: contentItems.filter(
          (c) =>
            c.status === "approved" ||
            c.status === "scheduled" ||
            c.status === "published"
        ).length,
        creativeProjectsCount: creativeProjects.length,
        connectedAccountsCount: connectedAccounts.filter(
          (a) => a.status === "active"
        ).length,
      }}
    />
  )
}
