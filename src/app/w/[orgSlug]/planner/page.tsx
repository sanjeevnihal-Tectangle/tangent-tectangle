import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"

import { PageContainer } from "@/components/page/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { ContentPlanner } from "@/features/planner/content-planner"
import { isPlannerView } from "@/features/planner/views"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Content Planner" }

type Props = PageProps<"/w/[orgSlug]/planner">

const WINDOW_DAYS = 45

function first(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null
}

async function PlannerLoader({ params, searchParams }: Props) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams])
  const viewParam = first(query.view)
  const view = isPlannerView(viewParam) ? viewParam : "month"
  const dateParam = first(query.date)
  await connection()
  const anchor = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? new Date(`${dateParam}T12:00:00`) : new Date()

  const { repository } = await resolveWorkspace(orgSlug)
  const from = new Date(anchor.getTime() - WINDOW_DAYS * 86_400_000).toISOString()
  const to = new Date(anchor.getTime() + WINDOW_DAYS * 86_400_000).toISOString()
  const items = await repository.listContentItems({ from, to })
  const assetUrls = await repository.resolveAssetUrls([...new Set(items.flatMap((i) => i.mediaAssetIds))])

  return (
    <ContentPlanner
      key={`${view}|${anchor.toISOString().slice(0, 10)}`}
      initialItems={items}
      initialView={view}
      anchorISO={anchor.toISOString()}
      assetUrls={assetUrls}
    />
  )
}

export default function PlannerPage(props: Props) {
  return (
    <PageContainer>
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-12 w-80" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-[32rem] w-full" />
          </div>
        }
      >
        <PlannerLoader {...props} />
      </Suspense>
    </PageContainer>
  )
}
