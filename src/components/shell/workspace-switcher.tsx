"use client"

import { Check, ChevronsUpDown, Plus } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { useWorkspace } from "@/components/workspace/workspace-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { DEFAULT_PLANS } from "@/lib/billing/plans"
import { initials } from "@/lib/format"

function WorkspaceAvatar({ name }: { name: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary font-heading text-xs font-semibold text-primary-foreground">
      {initials(name)}
    </span>
  )
}

export function WorkspaceSwitcher() {
  const { workspace, workspaces, mode } = useWorkspace()
  const router = useRouter()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent" aria-label="Switch workspace">
              <WorkspaceAvatar name={workspace.name} />
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium text-sidebar-accent-foreground">{workspace.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {DEFAULT_PLANS[workspace.planId].name} plan{mode === "demo" ? " · Demo" : ""}
                </span>
              </span>
              <ChevronsUpDown className="ml-auto text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start" side="bottom" sideOffset={6}>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
            {workspaces.map((w) => (
              <DropdownMenuItem key={w.id} onSelect={() => router.push(`/w/${w.slug}/overview`)} className="gap-2">
                <WorkspaceAvatar name={w.name} />
                <span className="flex-1 truncate">{w.name}</span>
                {w.id === workspace.id ? <Check className="size-4 text-brand" /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {mode === "live" ? (
              <DropdownMenuItem asChild className="gap-2">
                <Link href="/workspaces/new">
                  <Plus className="size-4" /> Create workspace
                </Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled className="flex-col items-start gap-0.5">
                <span className="flex items-center gap-2">
                  <Plus className="size-4" /> Create workspace
                </span>
                <span className="text-xs text-muted-foreground">Requires Supabase (demo mode)</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
