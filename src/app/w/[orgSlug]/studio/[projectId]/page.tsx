import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { CreativeEditor } from "@/features/studio/editor/creative-editor"
import { getImageProvider } from "@/lib/ai/image-provider"
import { referencedAssetIds } from "@/lib/creative/document"
import type { BrandKitStyle } from "@/lib/creative/rebrand"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Design editor" }

type Props = PageProps<"/w/[orgSlug]/studio/[projectId]">

async function EditorLoader({ params }: Props) {
  const { orgSlug, projectId } = await params
  // The editor is fully interactive and per-request (history timestamps, generated ids).
  await connection()
  const { repository } = await resolveWorkspace(orgSlug)
  const project = await repository.getCreativeProject(projectId)
  if (!project) notFound()
  const brands = await repository.listBrandProfiles()
  const logoIds = brands.map((b) => b.logoAssetId).filter((id): id is string => Boolean(id))
  // Logos of every kit are resolved up front so switching kits shows the new logo straight away.
  const assetUrls = await repository.resolveAssetUrls([...new Set([...referencedAssetIds(project.document), ...logoIds])])
  const brandKits: (BrandKitStyle & { isDefault: boolean })[] = [...brands]
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
    .map((b) => ({
      id: b.id,
      name: b.name,
      isDefault: b.isDefault,
      colors: b.colors.map((c) => ({ hex: c.hex, role: c.role })),
      logoAssetId: b.logoAssetId,
      style: {
        headingFont: b.visualStyle.headingFont,
        bodyFont: b.visualStyle.bodyFont,
        iconVariant: b.visualStyle.iconStyle,
        cornerStyle: b.visualStyle.cornerStyle,
      },
    }))
  return (
    <CreativeEditor
      project={project}
      initialAssetUrls={assetUrls}
      brandKits={brandKits}
      imageConfigured={getImageProvider() !== null}
    />
  )
}

export default function EditorPage(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="grid h-[calc(100svh-3rem)] grid-cols-[15rem_1fr_18rem]">
          <Skeleton className="m-3" />
          <div className="flex items-center justify-center bg-muted/40"><Skeleton className="aspect-square w-1/2" /></div>
          <Skeleton className="m-3" />
        </div>
      }
    >
      <EditorLoader {...props} />
    </Suspense>
  )
}
