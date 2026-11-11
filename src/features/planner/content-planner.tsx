"use client"

import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format as formatDate,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { ChevronLeft, ChevronRight, Plus, Sparkles } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { PageHeader } from "@/components/page/page-header"
import { useCan } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { GenerateCalendarDialog } from "@/features/planner/generate-dialog"
import { newContentItem, PostDialog, STATUS_VARIANT } from "@/features/planner/post-dialog"
import { PLANNER_VIEWS, type PlannerView } from "@/features/planner/views"
import {
  CONTENT_PLATFORM_LABELS,
  CONTENT_PLATFORMS,
  CONTENT_STATUS_LABELS,
  CONTENT_STATUSES,
  type ContentItem,
  type ContentPlatform,
  type ContentStatus,
} from "@/lib/domain/content"
import { cn } from "@/lib/utils"

const PLATFORM_DOT: Record<ContentPlatform, string> = {
  instagram: "bg-chart-1",
  facebook: "bg-info",
  youtube: "bg-destructive",
  linkedin: "bg-chart-3",
}

const WEEK = { weekStartsOn: 1 } as const

function ItemChip({ item, onOpen, showTime = true }: { item: ContentItem; onOpen: () => void; showTime?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[0.72rem] leading-tight hover:bg-muted"
      title={`${item.title} · ${CONTENT_STATUS_LABELS[item.status]}`}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", PLATFORM_DOT[item.platform])} aria-hidden />
      {showTime && item.scheduledFor ? <span className="tabular shrink-0 text-muted-foreground">{formatDate(new Date(item.scheduledFor), "HH:mm")}</span> : null}
      <span className={cn("min-w-0 flex-1 truncate", item.status === "draft" && "text-muted-foreground")}>{item.title}</span>
      {item.status === "approved" ? <span className="size-1.5 shrink-0 rounded-full bg-success" aria-label="Approved" /> : item.status === "in_review" ? <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-label="In review" /> : null}
    </button>
  )
}

export function ContentPlanner({
  initialItems,
  initialView,
  anchorISO,
  assetUrls: initialAssetUrls,
}: {
  initialItems: ContentItem[]
  initialView: PlannerView
  anchorISO: string
  assetUrls: Record<string, string>
}) {
  const canCreate = useCan("content.create")
  const router = useRouter()
  const pathname = usePathname()
  const anchor = useMemo(() => new Date(anchorISO), [anchorISO])
  const [items, setItems] = useState(initialItems)
  const [view, setView] = useState<PlannerView>(initialView)
  const [assetUrls, setAssetUrls] = useState(initialAssetUrls)
  const [platform, setPlatform] = useState<ContentPlatform | "all">("all")
  const [status, setStatus] = useState<ContentStatus | "all">("all")
  const [editing, setEditing] = useState<{ item: ContentItem; isNew: boolean } | null>(null)
  const [generateOpen, setGenerateOpen] = useState(false)

  const navigate = (date: Date, nextView = view) => {
    router.push(`${pathname}?view=${nextView}&date=${formatDate(date, "yyyy-MM-dd")}`)
  }

  const visible = items.filter((i) => (platform === "all" || i.platform === platform) && (status === "all" || i.status === status))
  const scheduled = visible.filter((i) => i.scheduledFor).sort((a, b) => a.scheduledFor!.localeCompare(b.scheduledFor!))
  const unscheduled = visible.filter((i) => !i.scheduledFor)
  const onDay = (day: Date) => scheduled.filter((i) => isSameDay(new Date(i.scheduledFor!), day))

  const open = (item: ContentItem) => setEditing({ item, isNew: false })
  const create = (day: Date | null) => canCreate && setEditing({ item: newContentItem(day), isNew: true })

  const upsert = (item: ContentItem) => {
    setItems((list) => [item, ...list.filter((i) => i.id !== item.id)])
    setEditing({ item, isNew: false })
  }

  const step = (direction: 1 | -1) => {
    switch (view) {
      case "month":
        return navigate(addMonths(anchor, direction))
      case "week":
        return navigate(addWeeks(anchor, direction))
      case "day":
        return navigate(addDays(anchor, direction))
      case "list":
        return navigate(addMonths(anchor, direction))
      default: {
        const unreachable: never = view
        return unreachable
      }
    }
  }

  const title =
    view === "day"
      ? formatDate(anchor, "EEEE, d MMMM yyyy")
      : view === "week"
        ? `${formatDate(startOfWeek(anchor, WEEK), "d MMM")} – ${formatDate(endOfWeek(anchor, WEEK), "d MMM yyyy")}`
        : formatDate(anchor, "MMMM yyyy")

  const counts = CONTENT_STATUSES.map((s) => [s, items.filter((i) => i.status === s).length] as const).filter(([, n]) => n > 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Content Planner"
        description="Plan, review and approve posts. Publishing needs a connected account and approval of the final version."
        meta={counts.length ? <span className="flex gap-1">{counts.map(([s, n]) => <Badge key={s} variant={STATUS_VARIANT[s]}>{n} {CONTENT_STATUS_LABELS[s].toLowerCase()}</Badge>)}</span> : null}
        actions={
          canCreate ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setGenerateOpen(true)}><Sparkles /> Generate with AI</Button>
              <Button size="sm" onClick={() => create(view === "day" ? anchor : null)}><Plus /> New post</Button>
            </>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft /></Button>
          <Button variant="outline" size="sm" onClick={() => navigate(new Date())}>Today</Button>
          <Button variant="outline" size="icon-sm" onClick={() => step(1)} aria-label="Next"><ChevronRight /></Button>
        </div>
        <h2 className="ml-1 font-sans text-base font-semibold">{title}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={platform} onValueChange={(v) => setPlatform(v as ContentPlatform | "all")}>
            <SelectTrigger size="sm" className="w-36" aria-label="Filter by platform"><SelectValue>{platform === "all" ? "All platforms" : CONTENT_PLATFORM_LABELS[platform]}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All platforms</SelectItem>
              {CONTENT_PLATFORMS.map((p) => <SelectItem key={p} value={p}>{CONTENT_PLATFORM_LABELS[p]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as ContentStatus | "all")}>
            <SelectTrigger size="sm" className="w-32" aria-label="Filter by status"><SelectValue>{status === "all" ? "All statuses" : CONTENT_STATUS_LABELS[status]}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {CONTENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{CONTENT_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={view} onValueChange={(v) => { if (v) { setView(v as PlannerView); navigate(anchor, v as PlannerView) } }} aria-label="Calendar view">
            {PLANNER_VIEWS.map((v) => <ToggleGroupItem key={v} value={v} className="px-2.5 text-xs capitalize">{v}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_16rem]">
        <div className="min-w-0">
          {view === "month" ? (
            <div className="overflow-hidden rounded-lg border">
              <div className="grid grid-cols-7 border-b bg-muted/40 text-xs text-muted-foreground">
                {eachDayOfInterval({ start: startOfWeek(anchor, WEEK), end: endOfWeek(anchor, WEEK) }).map((d) => (
                  <div key={d.toISOString()} className="px-2 py-1.5">{formatDate(d, "EEE")}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {eachDayOfInterval({ start: startOfWeek(startOfMonth(anchor), WEEK), end: endOfWeek(endOfMonth(anchor), WEEK) }).map((day) => {
                  const dayItems = onDay(day)
                  return (
                    <div
                      key={day.toISOString()}
                      onClick={() => create(day)}
                      className={cn("group min-h-28 cursor-pointer border-r border-b p-1 last:border-r-0 [&:nth-child(7n)]:border-r-0", !isSameMonth(day, anchor) && "bg-muted/30")}
                    >
                      <div className="flex items-center justify-between px-1">
                        <span className={cn("tabular text-xs", isToday(day) ? "flex size-5 items-center justify-center rounded-full bg-brand font-medium text-brand-foreground" : isSameMonth(day, anchor) ? "" : "text-muted-foreground")}>
                          {formatDate(day, "d")}
                        </span>
                        {canCreate ? <Plus className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100" /> : null}
                      </div>
                      <div className="mt-0.5 space-y-0.5">
                        {dayItems.slice(0, 3).map((item) => <ItemChip key={item.id} item={item} onOpen={() => open(item)} />)}
                        {dayItems.length > 3 ? (
                          <button type="button" onClick={(e) => { e.stopPropagation(); navigate(day, "day") }} className="px-1.5 text-[0.7rem] text-muted-foreground hover:text-foreground">
                            +{dayItems.length - 3} more
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {view === "week" ? (
            <div className="grid grid-cols-1 overflow-hidden rounded-lg border sm:grid-cols-7">
              {eachDayOfInterval({ start: startOfWeek(anchor, WEEK), end: endOfWeek(anchor, WEEK) }).map((day) => (
                <div key={day.toISOString()} className="min-h-72 border-b p-2 sm:border-r sm:border-b-0 sm:last:border-r-0">
                  <button type="button" onClick={() => navigate(day, "day")} className="mb-2 text-left">
                    <span className="block text-xs text-muted-foreground">{formatDate(day, "EEE")}</span>
                    <span className={cn("tabular font-heading text-lg font-semibold", isToday(day) && "text-brand")}>{formatDate(day, "d")}</span>
                  </button>
                  <div className="space-y-1">
                    {onDay(day).map((item) => <ItemChip key={item.id} item={item} onOpen={() => open(item)} />)}
                    {canCreate ? (
                      <button type="button" onClick={() => create(day)} className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-[0.72rem] text-muted-foreground hover:bg-muted">
                        <Plus className="size-3" /> Add
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {view === "day" ? (
            <div className="rounded-lg border">
              {onDay(anchor).length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">Nothing planned for this day.</p>
              ) : (
                <ul className="divide-y">
                  {onDay(anchor).map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => open(item)} className="flex w-full items-start gap-4 p-3 text-left hover:bg-muted/50">
                        <span className="tabular w-12 shrink-0 font-heading text-sm font-semibold">{formatDate(new Date(item.scheduledFor!), "HH:mm")}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{item.title}</span>
                          <span className="line-clamp-2 text-sm text-muted-foreground">{item.caption || "No caption yet"}</span>
                          <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className={cn("size-1.5 rounded-full", PLATFORM_DOT[item.platform])} /> {CONTENT_PLATFORM_LABELS[item.platform]} · {item.format}
                          </span>
                        </span>
                        {item.mediaAssetIds[0] && assetUrls[item.mediaAssetIds[0]] ? (
                          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                          <img src={assetUrls[item.mediaAssetIds[0]]} alt="" className="size-14 rounded-md border object-cover" />
                        ) : null}
                        <Badge variant={STATUS_VARIANT[item.status]}>{CONTENT_STATUS_LABELS[item.status]}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {view === "list" ? (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="py-2 font-medium">Post</th>
                    <th className="py-2 font-medium">Platform</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[...scheduled.filter((i) => isSameMonth(new Date(i.scheduledFor!), anchor)), ...unscheduled].map((item) => (
                    <tr key={item.id} onClick={() => open(item)} className="cursor-pointer hover:bg-muted/40">
                      <td className="tabular px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">
                        {item.scheduledFor ? formatDate(new Date(item.scheduledFor), "EEE d MMM, HH:mm") : "Unscheduled"}
                      </td>
                      <td className="max-w-md py-2">
                        <span className="block truncate font-medium">{item.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{item.caption}</span>
                      </td>
                      <td className="py-2 text-xs">{CONTENT_PLATFORM_LABELS[item.platform]} · {item.format}</td>
                      <td className="px-3 py-2"><Badge variant={STATUS_VARIANT[item.status]}>{CONTENT_STATUS_LABELS[item.status]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {scheduled.length + unscheduled.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No posts match these filters.</p> : null}
            </div>
          ) : null}
        </div>

        <aside className="space-y-2">
          <h3 className="font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">Unscheduled drafts ({unscheduled.length})</h3>
          {unscheduled.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Designs sent from Creative Studio and posts without a date appear here.</p>
          ) : (
            <ul className="space-y-1.5">
              {unscheduled.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => open(item)} className="flex w-full items-center gap-2 rounded-lg border p-2 text-left hover:bg-muted/50">
                    {item.mediaAssetIds[0] && assetUrls[item.mediaAssetIds[0]] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                      <img src={assetUrls[item.mediaAssetIds[0]]} alt="" className="size-10 shrink-0 rounded border object-cover" />
                    ) : (
                      <span className={cn("size-2 shrink-0 rounded-full", PLATFORM_DOT[item.platform])} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{item.title}</span>
                      <span className="text-[0.7rem] text-muted-foreground">{CONTENT_PLATFORM_LABELS[item.platform]} · {CONTENT_STATUS_LABELS[item.status]}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {editing ? (
        <PostDialog
          key={editing.item.id + editing.item.updatedAt}
          item={editing.item}
          isNew={editing.isNew}
          assetUrls={assetUrls}
          onClose={() => setEditing(null)}
          onSaved={upsert}
          onDeleted={(id) => {
            setItems((list) => list.filter((i) => i.id !== id))
            setEditing(null)
          }}
          onAssetUrl={(id, url) => setAssetUrls((urls) => ({ ...urls, [id]: url }))}
        />
      ) : null}

      <GenerateCalendarDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        anchor={anchor}
        onGenerated={(generated, month) => {
          setItems((list) => [...generated, ...list])
          if (month !== formatDate(anchor, "yyyy-MM")) navigate(new Date(`${month}-01T12:00:00`), "month")
        }}
      />
    </div>
  )
}
