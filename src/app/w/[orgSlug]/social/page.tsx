import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"

import { PageContainer } from "@/components/page/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { SocialWorkspace } from "@/features/social/social-workspace"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Social Media" }

async function SocialLoader({
  params,
}: {
  params: PageProps<"/w/[orgSlug]/social">["params"]
}) {
  const { orgSlug } = await params
  await connection()
  const now = new Date()
  const from = new Date(now.getTime() - 45 * 86_400_000).toISOString()
  const to = new Date(now.getTime() + 60 * 86_400_000).toISOString()

  const { repository } = await resolveWorkspace(orgSlug)
  const [accounts, items, approvals, jobs] = await Promise.all([
    repository.listConnectedAccounts(),
    repository.listContentItems({ from, to }),
    repository.listApprovals(),
    repository.listPublishingJobs(),
  ])

  const approvedPosts = items.filter((i) => i.status === "approved")

  return (
    <SocialWorkspace
      initialAccounts={accounts}
      initialApprovedPosts={approvedPosts}
      initialApprovals={approvals}
      initialJobs={jobs}
    />
  )
}

export default function SocialPage({ params }: PageProps<"/w/[orgSlug]/social">) {
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
            <Skeleton className="h-72 w-full" />
          </div>
        }
      >
        <SocialLoader params={params} />
      </Suspense>
    </PageContainer>
  )
}

