import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"

import { PageContainer } from "@/components/page/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { seedProductsFromBusinessQuiet } from "@/features/messaging/actions"
import { MessagingWorkspace } from "@/features/messaging/messaging-workspace"
import { defaultMessagingSettings, emptyProduct } from "@/lib/domain/messaging"
import { serverEnv } from "@/lib/env/server"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Messaging" }

async function MessagingLoader({
  params,
}: {
  params: PageProps<"/w/[orgSlug]/messaging">["params"]
}) {
  const { orgSlug } = await params
  await connection()
  const { context, repository } = await resolveWorkspace(orgSlug)

  const schemaReady = await repository.messagingSchemaReady()

  let products = schemaReady ? await repository.listProducts() : []
  if (schemaReady && products.length === 0 && context.permissions.includes("campaigns.manage")) {
    const seeded = await seedProductsFromBusinessQuiet(orgSlug)
    if (seeded.ok) products = seeded.data
  }

  if (schemaReady && products.length === 0 && context.mode === "demo") {
    const business = await repository.getBusinessProfile()
    const names = business?.productsAndServices ?? ["Signature offering"]
    const seeded: typeof products = []
    for (const name of names) {
      seeded.push(
        await repository.saveProduct({
          ...emptyProduct(crypto.randomUUID()),
          name,
          description: "Demo product from business profile",
        })
      )
    }
    products = seeded
  }

  const [contacts, audiences, batches, templates, accounts, broadcasts, automations, settings] =
    schemaReady
      ? await Promise.all([
          repository.listContacts({ limit: 200 }),
          repository.listAudiences(),
          repository.listContactImportBatches(),
          repository.listMessageTemplates(),
          repository.listConnectedAccounts(),
          repository.listBroadcasts(),
          repository.listAutomations(),
          repository.getMessagingSettings(),
        ])
      : [
          [],
          [],
          [],
          [],
          await repository.listConnectedAccounts(),
          [],
          [],
          await repository.getMessagingSettings().catch(() => defaultMessagingSettings()),
        ]

  const env = serverEnv()
  const metaConfigured = Boolean(env.META_APP_ID && env.META_APP_SECRET)
  const whatsappAccounts = accounts.filter((a) => a.provider === "whatsapp")
  const instagramAccounts = accounts.filter((a) => a.provider === "instagram")
  const smsAccounts = accounts.filter((a) => a.provider === "msg91")
  const emailAccounts = accounts.filter((a) => a.provider === "resend")

  return (
    <MessagingWorkspace
      initialProducts={products}
      initialContacts={[...contacts]}
      initialAudiences={[...audiences]}
      initialBatches={[...batches]}
      initialTemplates={[...templates]}
      initialBroadcasts={[...broadcasts]}
      initialAutomations={[...automations]}
      initialSettings={settings}
      whatsappAccounts={whatsappAccounts}
      instagramAccounts={instagramAccounts}
      smsAccounts={smsAccounts}
      emailAccounts={emailAccounts}
      metaConfigured={metaConfigured}
      schemaReady={schemaReady}
    />
  )
}

export default function MessagingPage({ params }: PageProps<"/w/[orgSlug]/messaging">) {
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
        <MessagingLoader params={params} />
      </Suspense>
    </PageContainer>
  )
}
