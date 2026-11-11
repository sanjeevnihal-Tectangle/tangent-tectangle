"use client"

import type { ReactNode } from "react"

import { AppSidebar } from "@/components/shell/app-sidebar"
import { Topbar } from "@/components/shell/topbar"
import { WorkspaceProvider } from "@/components/workspace/workspace-provider"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import type { WorkspaceContext } from "@/lib/domain/workspace"

export function AppShell({ context, children }: { context: WorkspaceContext; children: ReactNode }) {
  return (
    <WorkspaceProvider value={context}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <Topbar />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </WorkspaceProvider>
  )
}
