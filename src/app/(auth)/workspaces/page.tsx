import { redirect } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { isSupabaseConfigured } from "@/lib/env/public"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/** Sends the signed-in user to their first workspace, or to workspace creation. */
async function WorkspaceRedirect(): Promise<never> {
  await connection()
  if (!isSupabaseConfigured()) redirect("/w/demo/overview")

  const supabase = await createSupabaseServerClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims?.sub) redirect("/login")

  const { data } = await supabase
    .from("memberships")
    .select("organizations!inner(slug)")
    .eq("user_id", claims.claims.sub)
    .is("organizations.deleted_at", null)
    .order("created_at")
    .limit(1)
  const slug = (data?.[0] as { organizations?: { slug?: string } } | undefined)?.organizations?.slug
  redirect(slug ? `/w/${slug}/overview` : "/workspaces/new")
}

export default function WorkspacesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-24 w-full" />}>
      <WorkspaceRedirect />
    </Suspense>
  )
}
