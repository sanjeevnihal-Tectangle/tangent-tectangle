import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"

import { PageContainer } from "@/components/page/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { SeoWorkspace } from "@/features/seo/seo-workspace"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "SEO Studio" }

async function SeoLoader({
  params,
}: {
  params: PageProps<"/w/[orgSlug]/seo">["params"]
}) {
  const { orgSlug } = await params
  await connection()
  const now = new Date()
  const from = new Date(now.getTime() - 90 * 86_400_000).toISOString()
  const to = now.toISOString()

  const { repository } = await resolveWorkspace(orgSlug)
  const [business, accounts, events] = await Promise.all([
    repository.getBusinessProfile(),
    repository.listConnectedAccounts(),
    repository.listAnalyticsEvents({ from, to }),
  ])

  return (
    <SeoWorkspace
      business={business}
      searchConsoleAccounts={accounts.filter((a) => a.provider === "search_console")}
      searchEvents={events.filter((e) => e.source === "search_console")}
    />
  )
}

export default function SeoPage({ params }: PageProps<"/w/[orgSlug]/seo">) {
  return (
    <PageContainer>
      <Suspense
        fallback={
          <div className="space-y-6">
            <Skeleton className="h-12 w-80" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-80 w-full" />
          </div>
        }
      >
        <SeoLoader params={params} />
      </Suspense>
    </PageContainer>
  )
}

