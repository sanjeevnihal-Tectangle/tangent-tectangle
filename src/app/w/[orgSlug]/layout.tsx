import { Suspense } from "react"

import { AppShell } from "@/components/shell/app-shell"
import { ShellSkeleton } from "@/components/shell/shell-skeleton"
import { resolveWorkspace } from "@/lib/workspace/server"

async function WorkspaceShell({
  params,
  children,
}: {
  params: LayoutProps<"/w/[orgSlug]">["params"]
  children: React.ReactNode
}) {
  const { orgSlug } = await params
  const { context } = await resolveWorkspace(orgSlug)
  return <AppShell context={context}>{children}</AppShell>
}

export default function WorkspaceLayout({ params, children }: LayoutProps<"/w/[orgSlug]">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <WorkspaceShell params={params}>{children}</WorkspaceShell>
    </Suspense>
  )
}
