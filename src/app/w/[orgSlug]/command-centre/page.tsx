import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { CommandCentre } from "@/features/command-centre/command-centre"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "AI Command Centre" }

type Props = PageProps<"/w/[orgSlug]/command-centre">

function first(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null
}

async function CommandCentreLoader({ params, searchParams }: Props) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams])
  const conversationId = first(query.c)
  const prompt = first(query.prompt)

  const { repository } = await resolveWorkspace(orgSlug)
  const [conversations, active, approvals, profile, brands] = await Promise.all([
    repository.listConversations(),
    conversationId ? repository.getConversation(conversationId) : Promise.resolve(null),
    repository.listApprovals(),
    repository.getBusinessProfile(),
    repository.listBrandProfiles(),
  ])
  const brand = brands.find((b) => b.isDefault) ?? brands[0] ?? null

  return (
    <CommandCentre
      key={active?.id ?? "new"}
      conversations={conversations}
      active={active}
      initialPrompt={prompt ? prompt.slice(0, 4000) : null}
      approvals={approvals.filter((a) => a.status === "pending")}
      business={
        profile
          ? {
              name: profile.name,
              industry: profile.industry,
              location: [profile.city, profile.region].filter(Boolean).join(", "),
            }
          : null
      }
      brandName={brand?.name ?? null}
    />
  )
}

export default function CommandCentrePage(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="grid h-[calc(100svh-3rem)] lg:grid-cols-[15rem_1fr] xl:grid-cols-[15rem_1fr_19rem]">
          <div className="hidden space-y-2 border-r p-3 lg:block">
            <Skeleton className="h-8" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
          <div className="flex flex-col items-center justify-center gap-3 p-6">
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-24 w-full max-w-3xl" />
          </div>
        </div>
      }
    >
      <CommandCentreLoader {...props} />
    </Suspense>
  )
}
