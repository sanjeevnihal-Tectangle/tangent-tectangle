import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"

import { PageContainer } from "@/components/page/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { CampaignsWorkspace } from "@/features/campaigns/campaigns-workspace"
import { buildDemoCampaigns } from "@/lib/demo/dashboard"
import type { Campaign } from "@/lib/domain/campaigns"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Campaigns" }

async function CampaignsLoader({
  params,
}: {
  params: PageProps<"/w/[orgSlug]/campaigns">["params"]
}) {
  const { orgSlug } = await params
  await connection()
  const { context, repository } = await resolveWorkspace(orgSlug)
  const stored = await repository.listCampaigns()

  if (stored.length === 0 && context.mode === "demo") {
    const sample: Campaign[] = buildDemoCampaigns(new Date()).map((d) => ({
      id: d.id,
      name: d.name,
      objective: d.objective,
      audience: "Urban food lovers, families and corporate event planners",
      channels: ["instagram", "facebook", "google_ads"],
      startDate: d.startDate,
      endDate: d.endDate,
      budgetInr: d.budget,
      landingPageUrl: "",
      conversionGoal: d.objective,
      kpis: [
        { metric: "Conversions", target: String(Math.max(100, d.conversions || 250)), current: String(d.conversions) },
        ...(d.roas ? [{ metric: "ROAS", target: "4.0×", current: `${d.roas}×` }] : []),
      ],
      status: d.status,
      brandProfileId: null,
      updatedAt: new Date().toISOString(),
    }))
    return <CampaignsWorkspace initialCampaigns={sample} isSampleSeed />
  }

  return <CampaignsWorkspace initialCampaigns={stored} />
}

export default function CampaignsPage({ params }: PageProps<"/w/[orgSlug]/campaigns">) {
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
        <CampaignsLoader params={params} />
      </Suspense>
    </PageContainer>
  )
}

