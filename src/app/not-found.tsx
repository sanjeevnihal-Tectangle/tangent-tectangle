import Link from "next/link"

import { TangentMark } from "@/components/brand/tangent-logo"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <TangentMark className="size-8" />
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This page doesn&apos;t exist, or you don&apos;t have access to this workspace.
      </p>
      <Button asChild>
        <Link href="/workspaces">Go to your workspace</Link>
      </Button>
    </main>
  )
}
