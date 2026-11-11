import type { Metadata } from "next"
import { Suspense } from "react"

import { PageContainer } from "@/components/page/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { AdsWorkspace } from "@/features/ads/ads-workspace"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Ads Manager" }

async function AdsLoader({
  params,
}: {
  params: PageProps<"/w/[orgSlug]/ads">["params"]
}) {
  const { orgSlug } = await params
  const { repository } = await resolveWorkspace(orgSlug)
  const [accounts, approvals, business] = await Promise.all([
    repository.listAdAccounts(),
    repository.listApprovals(),
    repository.getBusinessProfile(),
  ])

  return (
    <AdsWorkspace
      initialAccounts={accounts}
      initialApprovals={approvals}
      business={business}
    />
  )
}

export default function AdsPage({ params }: PageProps<"/w/[orgSlug]/ads">) {
  return (
    <PageContainer>
      <Suspense
        fallback={
          <div className="space-y-6">
            <Skeleton className="h-12 w-80" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <Skeleton className="h-80 w-full" />
          </div>
        }
      >
        <AdsLoader params={params} />
      </Suspense>
    </PageContainer>
  )
}

