"use client"

import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { acceptInvitation } from "@/features/team/actions"

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(async () => acceptInvitation(token), null)
  return (
    <form action={action} className="space-y-3">
      {state?.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null} Accept invitation
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Not signed in?{" "}
        <Link href={`/login?next=/invite/${encodeURIComponent(token)}`} className="font-medium text-foreground hover:underline">
          Sign in first
        </Link>
      </p>
    </form>
  )
}
