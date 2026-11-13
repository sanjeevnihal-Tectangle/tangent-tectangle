import type { Metadata } from "next"
import { Suspense } from "react"

import { PageContainer } from "@/components/page/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { ProductsManager } from "@/features/products/products-manager"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Products & Services" }

async function ProductsLoader({ params }: { params: PageProps<"/w/[orgSlug]/products">["params"] }) {
  const { orgSlug } = await params
  const { repository } = await resolveWorkspace(orgSlug)
  const [products, brands] = await Promise.all([repository.listProducts(), repository.listBrandProfiles()])
  const imageUrls = await repository.resolveAssetUrls([...new Set(products.flatMap((p) => p.imageAssetIds))]).catch(() => ({}))
  return <ProductsManager initial={products} brands={brands} imageUrls={imageUrls} />
}

export default function ProductsPage({ params }: PageProps<"/w/[orgSlug]/products">) {
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
        <ProductsLoader params={params} />
      </Suspense>
    </PageContainer>
  )
}
