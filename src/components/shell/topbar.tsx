"use client"

import { Sparkles } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { CommandPalette } from "@/components/shell/command-palette"
import { Notifications } from "@/components/shell/notifications"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { NAV_GROUPS, workspaceHref } from "@/lib/navigation"

function useCurrentNav() {
  const pathname = usePathname()
  const segment = pathname.split("/")[3] ?? ""
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => i.segment === segment)
    if (item) return { group: group.label, item }
  }
  return null
}

export function Topbar() {
  const { workspace, mode } = useWorkspace()
  const current = useCurrentNav()

  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="hidden sm:inline-flex">{current?.group ?? "Workspace"}</BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:block" />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">{current?.item.label ?? "Onboarding"}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      {mode === "demo" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="warning" className="ml-1 hidden cursor-default sm:inline-flex" tabIndex={0}>
              Demo workspace
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-72">
            Supabase is not configured, so Tangent is running a sample workspace. Metrics are illustrative and
            edits are stored locally on this machine. Nothing is connected or published.
          </TooltipContent>
        </Tooltip>
      ) : null}

      <div className="ml-auto flex items-center gap-1.5">
        <CommandPalette />
        <Notifications />
        <Button asChild size="sm" variant="brand" className="ml-1">
          <Link href={workspaceHref(workspace.slug, "command-centre")}>
            <Sparkles /> <span className="hidden sm:inline">Ask Tangent</span>
          </Link>
        </Button>
      </div>
    </header>
  )
}
