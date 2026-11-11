import Link from "next/link"

import { TangentLogo } from "@/components/brand/tangent-logo"
import { Button } from "@/components/ui/button"

/** Fallback only: the proxy normally redirects "/" to the right destination. */
export default function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <TangentLogo className="scale-125" />
      <p className="max-w-md text-muted-foreground">Your entire marketing department. Powered by AI.</p>
      <Button asChild>
        <Link href="/workspaces">Open Tangent</Link>
      </Button>
    </main>
  )
}
