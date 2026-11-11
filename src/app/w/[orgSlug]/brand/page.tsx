import type { Metadata } from "next"
import { Suspense } from "react"

import { PageContainer } from "@/components/page/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { BrandManager } from "@/features/brand/brand-manager"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Brand Intelligence" }

async function BrandLoader({ params }: { params: PageProps<"/w/[orgSlug]/brand">["params"] }) {
  const { orgSlug } = await params
  const { repository } = await resolveWorkspace(orgSlug)
  return <BrandManager initial={await repository.listBrandProfiles()} />
}

export default function BrandPage({ params }: PageProps<"/w/[orgSlug]/brand">) {
  return (
    <PageContainer>
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-12 w-80" />
            <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
              <Skeleton className="h-40" />
              <Skeleton className="h-96" />
            </div>
          </div>
        }
      >
        <BrandLoader params={params} />
      </Suspense>
    </PageContainer>
  )
}
