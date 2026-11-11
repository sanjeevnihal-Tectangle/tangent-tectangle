"use client"

import { Bell } from "lucide-react"
import Link from "next/link"

import { DemoBadge } from "@/components/data/demo-badge"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DEMO_NOTIFICATIONS } from "@/lib/demo/dashboard"
import { minutesAgoLabel } from "@/lib/format"

export function Notifications() {
  const { workspace, mode } = useWorkspace()
  const items = mode === "demo" ? DEMO_NOTIFICATIONS : []

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Notifications${items.length ? ` (${items.length} unread)` : ""}`} className="relative">
          <Bell />
          {items.length > 0 ? (
            <span className="absolute top-1 right-1 size-1.5 rounded-full bg-brand" aria-hidden />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-sm font-medium">Notifications</p>
          {mode === "demo" ? <DemoBadge /> : null}
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          <ul className="divide-y">
            {items.map((n) => (
              <li key={n.id}>
                <Link href={`/w/${workspace.slug}/${n.href}`} className="block px-3 py-2.5 hover:bg-muted/60">
                  <p className="text-sm">{n.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {n.detail} · {minutesAgoLabel(n.minutesAgo)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
