import type { Metadata } from "next"
import { Suspense } from "react"

import { PageContainer } from "@/components/page/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { CreateWizard } from "@/features/studio/create-wizard"
import { getImageProvider } from "@/lib/ai/image-provider"
import { brandOptions, productOptions } from "@/lib/domain/brand-options"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Create a design" }

type Props = PageProps<"/w/[orgSlug]/studio/new">

function first(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null
}

async function WizardLoader({ params, searchParams }: Props) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams])
  const { repository } = await resolveWorkspace(orgSlug)
  const imageId = first(query.image)
  const category = first(query.category)
  let initialImage = null
  const [brands, products] = await Promise.all([repository.listBrandProfiles(), repository.listProducts().catch(() => [])])
  if (imageId) {
    const assets = await repository.listAssets({ limit: 300 })
    initialImage = assets.find((a) => a.id === imageId) ?? null
  }
  const brandId = first(query.brand)
  const productId = first(query.product)
  return (
    <CreateWizard
      initialFormatId={first(query.format)}
      category={category === "image" || category === "social" || category === "ad" ? category : null}
      initialImage={initialImage}
      initialBrief={(first(query.brief) ?? "").slice(0, 2000)}
      imageConfigured={getImageProvider() !== null}
      brands={brandOptions(brands)}
      products={productOptions(products)}
      initialBrandId={brands.some((b) => b.id === brandId) ? brandId : null}
      initialProductId={products.some((p) => p.id === productId) ? productId : null}
    />
  )
}

export default function NewDesignPage(props: Props) {
  return (
    <PageContainer>
      <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-5xl" />}>
        <WizardLoader {...props} />
      </Suspense>
    </PageContainer>
  )
}
