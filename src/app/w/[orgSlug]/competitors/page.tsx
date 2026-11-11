import type { Metadata } from "next"
import { Suspense } from "react"

import { PageContainer } from "@/components/page/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { CompetitorsWorkspace } from "@/features/competitors/competitors-workspace"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Competitor Intelligence" }

export default function CompetitorsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  return (
    <PageContainer>
      <Suspense fallback={<Skeleton className="h-[560px] w-full rounded-xl" />}>
        <CompetitorsLoader params={params} />
      </Suspense>
    </PageContainer>
  )
}

async function CompetitorsLoader({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { repository } = await resolveWorkspace(orgSlug)
  const [business, intelligence] = await Promise.all([
    repository.getBusinessProfile(),
    repository.getIntelligence(),
  ])

  return <CompetitorsWorkspace business={business} intelligence={intelligence} />
}
