"use client"

import { Loader2 } from "lucide-react"
import { useActionState, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createWorkspace, type CreateWorkspaceState } from "@/features/workspaces/actions"

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState<CreateWorkspaceState, FormData>(createWorkspace, { error: null })
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Business or workspace name</Label>
        <Input
          id="name"
          name="name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (!slugTouched) setSlug(slugify(e.target.value))
          }}
          placeholder="e.g. Saffron & Sage"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="slug">Workspace URL</Label>
        <div className="flex items-center rounded-lg border border-input pl-3 text-sm focus-within:ring-3 focus-within:ring-ring/50">
          <span className="text-muted-foreground">/w/</span>
          <input
            id="slug"
            name="slug"
            required
            value={slug}
            onChange={(e) => {
              setSlugTouched(true)
              setSlug(slugify(e.target.value))
            }}
            className="h-8 flex-1 bg-transparent px-1 outline-none"
          />
        </div>
      </div>
      {state.error ? <p className="text-sm text-destructive" role="alert">{state.error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null} Create workspace
      </Button>
    </form>
  )
}
