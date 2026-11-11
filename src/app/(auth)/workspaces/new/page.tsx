import type { Metadata } from "next"

import { CreateWorkspaceForm } from "@/features/workspaces/create-workspace-form"

export const metadata: Metadata = { title: "Create workspace" }

export default function NewWorkspacePage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Create a workspace</h1>
        <p className="text-sm text-muted-foreground">
          One workspace per business. Next, you&apos;ll tell Tangent about the business so every agent has context.
        </p>
      </div>
      <CreateWorkspaceForm />
    </div>
  )
}
