import type { Metadata } from "next"
import { Suspense } from "react"

import { PageContainer, PageHeader } from "@/components/page/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { OnboardingWizard } from "@/features/business/onboarding-wizard"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Business onboarding" }

async function OnboardingLoader({ params }: { params: PageProps<"/w/[orgSlug]/onboarding">["params"] }) {
  const { orgSlug } = await params
  const { repository } = await resolveWorkspace(orgSlug)
  const profile = await repository.getBusinessProfile()
  return <OnboardingWizard initial={profile} />
}

export default function OnboardingPage({ params }: PageProps<"/w/[orgSlug]/onboarding">) {
  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        title="Tell Tangent about your business"
        description="This profile is shared context for every AI agent — strategy, copy and creative all start here. You can edit it any time."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <OnboardingLoader params={params} />
      </Suspense>
    </PageContainer>
  )
}
