import type { Metadata } from "next"
import { Suspense } from "react"

import { DemoBadge } from "@/components/data/demo-badge"
import { PageContainer, PageHeader } from "@/components/page/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { TeamView } from "@/features/team/team-view"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Team & Members" }

async function TeamLoader({ params }: { params: PageProps<"/w/[orgSlug]/team">["params"] }) {
  const { orgSlug } = await params
  const { context, repository } = await resolveWorkspace(orgSlug)
  const members = await repository.listMembers()
  return (
    <>
      <PageHeader
        title="Team & Members"
        description="Invite your team and control what each role can do."
        meta={context.mode === "demo" ? <DemoBadge label="Sample members" detail="Sample team for the demo workspace." /> : null}
      />
      <TeamView members={members} />
    </>
  )
}

export default function TeamPage({ params }: PageProps<"/w/[orgSlug]/team">) {
  return (
    <PageContainer>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <TeamLoader params={params} />
      </Suspense>
    </PageContainer>
  )
}
