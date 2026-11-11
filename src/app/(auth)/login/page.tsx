import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { LoginForm } from "@/features/auth/auth-forms"

export const metadata: Metadata = { title: "Sign in" }

async function LoginWithParams({ searchParams }: PageProps<"/login">) {
  const query = await searchParams
  const next = typeof query.next === "string" && query.next.startsWith("/") && !query.next.startsWith("//") ? query.next : "/workspaces"
  return <LoginForm next={next} callbackError={query.error === "callback" || query.error === "oauth"} />
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <Suspense fallback={<Skeleton className="h-80 w-full" />}>
      <LoginWithParams {...props} />
    </Suspense>
  )
}
