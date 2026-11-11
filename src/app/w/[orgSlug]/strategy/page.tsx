import type { Metadata } from "next"
import { Suspense } from "react"

import { PageContainer } from "@/components/page/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { IntelligenceView } from "@/features/business/intelligence-view"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Marketing Strategy" }

async function StrategyLoader({ params }: { params: PageProps<"/w/[orgSlug]/strategy">["params"] }) {
  const { orgSlug } = await params
  const { repository } = await resolveWorkspace(orgSlug)
  const [profile, intelligence] = await Promise.all([repository.getBusinessProfile(), repository.getIntelligence()])
  return <IntelligenceView profile={profile} initial={intelligence} />
}

export default function StrategyPage({ params }: PageProps<"/w/[orgSlug]/strategy">) {
  return (
    <PageContainer>
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-12 w-80" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        }
      >
        <StrategyLoader params={params} />
      </Suspense>
    </PageContainer>
  )
}
