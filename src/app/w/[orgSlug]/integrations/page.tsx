import type { Metadata } from "next"
import { Suspense } from "react"

import { PageContainer } from "@/components/page/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { IntegrationsWorkspace } from "@/features/integrations/integrations-workspace"
import { publicEnv } from "@/lib/env/public"
import { serverEnv } from "@/lib/env/server"
import { integrationStatuses } from "@/lib/integrations/gateway"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Integrations" }

function first(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null
}

async function IntegrationsLoader({
  params,
  searchParams,
}: PageProps<"/w/[orgSlug]/integrations">) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams])
  const { repository } = await resolveWorkspace(orgSlug)
  const [integrations, accounts] = await Promise.all([
    Promise.resolve(integrationStatuses()),
    repository.listConnectedAccounts(),
  ])

  const env = serverEnv()
  const encryptionConfigured = Boolean(
    env.INTEGRATION_ENCRYPTION_KEY &&
      Buffer.from(env.INTEGRATION_ENCRYPTION_KEY, "base64").byteLength === 32
  )

  return (
    <IntegrationsWorkspace
      integrations={integrations}
      initialAccounts={accounts}
      encryptionConfigured={encryptionConfigured}
      appUrl={publicEnv.NEXT_PUBLIC_APP_URL}
      errorMsg={first(query.error)}
      connectedProvider={first(query.connected)}
      initialOpenProvider={first(query.connect)}
    />
  )
}

export default function IntegrationsPage(
  props: PageProps<"/w/[orgSlug]/integrations">
) {
  return (
    <PageContainer>
      <Suspense fallback={<Skeleton className="h-[640px] w-full rounded-xl" />}>
        <IntegrationsLoader {...props} />
      </Suspense>
    </PageContainer>
  )
}
