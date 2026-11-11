import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { AcceptInviteForm } from "@/features/team/accept-invite-form"

export const metadata: Metadata = { title: "Join workspace" }

async function Invite({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params
  return <AcceptInviteForm token={token} />
}

export default function InvitePage(props: PageProps<"/invite/[token]">) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">You&apos;ve been invited to Tangent</h1>
        <p className="text-sm text-muted-foreground">
          Sign in with the email address the invitation was sent to, then accept to join the workspace.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-10 w-full" />}>
        <Invite {...props} />
      </Suspense>
    </div>
  )
}
