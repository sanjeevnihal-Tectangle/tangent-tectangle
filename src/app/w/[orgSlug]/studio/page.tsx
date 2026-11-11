import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"

import { PageContainer } from "@/components/page/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { loadStudioBrand } from "@/features/studio/server"
import { StudioHome } from "@/features/studio/studio-home"
import { referencedAssetIds } from "@/lib/creative/document"
import { getFormat } from "@/lib/creative/formats"
import { composeDocument } from "@/lib/creative/layout"
import { CREATIVE_TEMPLATES, templateSpec } from "@/lib/creative/templates"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Creative Studio" }

async function StudioLoader({ params }: { params: PageProps<"/w/[orgSlug]/studio">["params"] }) {
  const { orgSlug } = await params
  // Relative timestamps and freshly composed templates are request-time values.
  await connection()
  const { context, repository } = await resolveWorkspace(orgSlug)
  const [projects, { brand, businessName }] = await Promise.all([repository.listCreativeProjects(), loadStudioBrand(repository, context)])
  const assetUrls = await repository.resolveAssetUrls([...new Set(projects.flatMap((p) => referencedAssetIds(p.preview)))])
  const brandColors = brand?.colors ?? []

  const templates = CREATIVE_TEMPLATES.map((template) => {
    const format = getFormat(template.formatId)
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      formatId: template.formatId,
      document: composeDocument(templateSpec(template, businessName, brandColors), {
        format,
        brandColors,
        businessName,
        logoAssetId: null,
        imageAssetId: null,
      }),
    }
  })

  return <StudioHome projects={projects} templates={templates} assetUrls={assetUrls} brand={brand} businessName={businessName} />
}

export default function StudioPage({ params }: PageProps<"/w/[orgSlug]/studio">) {
  return (
    <PageContainer>
      <Suspense
        fallback={
          <div className="space-y-6">
            <Skeleton className="h-12 w-80" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-24" />)}
            </div>
            <Skeleton className="h-72 w-full" />
          </div>
        }
      >
        <StudioLoader params={params} />
      </Suspense>
    </PageContainer>
  )
}
