import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { CreativeEditor } from "@/features/studio/editor/creative-editor"
import { loadStudioBrand } from "@/features/studio/server"
import { getImageProvider } from "@/lib/ai/image-provider"
import { referencedAssetIds } from "@/lib/creative/document"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Design editor" }

type Props = PageProps<"/w/[orgSlug]/studio/[projectId]">

async function EditorLoader({ params }: Props) {
  const { orgSlug, projectId } = await params
  // The editor is fully interactive and per-request (history timestamps, generated ids).
  await connection()
  const { context, repository } = await resolveWorkspace(orgSlug)
  const project = await repository.getCreativeProject(projectId)
  if (!project) notFound()
  const [assetUrls, { brand }] = await Promise.all([
    repository.resolveAssetUrls(referencedAssetIds(project.document)),
    loadStudioBrand(repository, context),
  ])
  return (
    <CreativeEditor
      project={project}
      initialAssetUrls={assetUrls}
      swatches={(brand?.colors ?? []).map((c) => c.hex)}
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
