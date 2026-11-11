"use client"

import { useEffect } from "react"

import { ErrorState } from "@/components/states/states"
import { Button } from "@/components/ui/button"

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <ErrorState
        title="Something went wrong loading this page"
        description={
          <>
            The error has been logged{error.digest ? ` (reference ${error.digest})` : ""}. Try again, and if it keeps happening contact support.
          </>
        }
        action={
          <Button size="sm" variant="outline" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  )
}
