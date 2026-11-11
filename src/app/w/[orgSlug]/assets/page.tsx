import type { Metadata } from "next"
import { Suspense } from "react"

import { PageContainer } from "@/components/page/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { AssetLibrary } from "@/features/assets/asset-library"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Asset Library" }

async function AssetsLoader({ params }: { params: PageProps<"/w/[orgSlug]/assets">["params"] }) {
  const { orgSlug } = await params
  const { repository } = await resolveWorkspace(orgSlug)
  return <AssetLibrary initial={await repository.listAssets({ limit: 300 })} />
}

export default function AssetsPage({ params }: PageProps<"/w/[orgSlug]/assets">) {
  return (
    <PageContainer>
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-12 w-80" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="aspect-square" />)}
            </div>
          </div>
        }
      >
        <AssetsLoader params={params} />
      </Suspense>
    </PageContainer>
  )
}
