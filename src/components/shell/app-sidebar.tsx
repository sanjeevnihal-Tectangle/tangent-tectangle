"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { TangentLogo, TangentMark } from "@/components/brand/tangent-logo"
import { UsageMeter } from "@/components/shell/usage-meter"
import { UserMenu } from "@/components/shell/user-menu"
import { WorkspaceSwitcher } from "@/components/shell/workspace-switcher"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { NAV_GROUPS, workspaceHref } from "@/lib/navigation"

export function AppSidebar() {
  const { workspace } = useWorkspace()
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3 pt-3">
        <Link
          href={workspaceHref(workspace.slug, "overview")}
          prefetch={false}
          className="flex h-8 items-center px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          aria-label="Tangent home"
        >
          <TangentLogo className="group-data-[collapsible=icon]:hidden" />
          <TangentMark className="hidden size-5 group-data-[collapsible=icon]:block" />
        </Link>
        <WorkspaceSwitcher />
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label} className="py-1">
            <SidebarGroupLabel className="text-[0.68rem] font-medium tracking-[0.08em] uppercase">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const href = workspaceHref(workspace.slug, item.segment)
                  const active = pathname === href || pathname.startsWith(`${href}/`)
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        className="relative data-active:before:absolute data-active:before:inset-y-1.5 data-active:before:-left-2 data-active:before:w-0.5 data-active:before:rounded-full data-active:before:bg-brand"
                      >
                        <Link href={href} prefetch={false} aria-current={active ? "page" : undefined}>
                          <item.icon className={active ? "text-brand" : undefined} />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {item.status === "planned" ? (
                        <SidebarMenuBadge className="text-[0.65rem] font-normal text-muted-foreground">
                          Soon
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-2 pb-3">
        <UsageMeter />
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
