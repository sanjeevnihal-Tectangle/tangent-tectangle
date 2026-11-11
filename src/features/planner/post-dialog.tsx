"use client"

import { format as formatDate } from "date-fns"
import { CalendarClock, Check, ImagePlus, Loader2, Palette, PlugZap, Send, Trash2, Undo2, X } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { TagInput } from "@/components/forms/tag-input"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AssetPicker } from "@/features/assets/asset-picker"
import { deleteContentItem, requestPublishApproval, saveContentItem, setContentStatus } from "@/features/planner/actions"
import {
  CONTENT_FORMATS,
  CONTENT_PLATFORM_LABELS,
  CONTENT_PLATFORMS,
  CONTENT_STATUS_LABELS,
  type ContentItem,
  type ContentPlatform,
  type ContentStatus,
} from "@/lib/domain/content"
import { workspaceHref } from "@/lib/navigation"

export const STATUS_VARIANT: Record<ContentStatus, "muted" | "warning" | "success" | "info" | "brand" | "danger"> = {
  draft: "muted",
  in_review: "warning",
  approved: "success",
  scheduled: "info",
  published: "brand",
  failed: "danger",
}

export function newContentItem(date: Date | null): ContentItem {
  const scheduled = date ? new Date(date) : null
  if (scheduled && scheduled.getHours() === 0) scheduled.setHours(12, 0, 0, 0)
  return {
    id: crypto.randomUUID(),
    title: "",
    platform: "instagram",
    format: "Post",
    caption: "",
    hashtags: [],
    scheduledFor: scheduled ? scheduled.toISOString() : null,
    status: "draft",
    creativeProjectId: null,
    mediaAssetIds: [],
    reviewNote: null,
    updatedAt: new Date().toISOString(),
  }
}

export function PostDialog({
  item,
  isNew,
  assetUrls,
  onClose,
  onSaved,
  onDeleted,
  onAssetUrl,
}: {
  item: ContentItem
  isNew: boolean
  assetUrls: Record<string, string>
  onClose: () => void
  onSaved: (item: ContentItem) => void
  onDeleted: (id: string) => void
  onAssetUrl: (id: string, url: string) => void
}) {
  const { workspace } = useWorkspace()
  const canCreate = useCan("content.create")
  const canApprove = useCan("content.approve")
  const [draft, setDraft] = useState(item)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [note, setNote] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const locked = draft.status === "scheduled" || draft.status === "published"
  const scheduled = draft.scheduledFor ? new Date(draft.scheduledFor) : null

  const set = <K extends keyof ContentItem>(key: K, value: ContentItem[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const setSchedule = (dateValue: string, timeValue: string) => {
    if (!dateValue) return set("scheduledFor", null)
    const local = new Date(`${dateValue}T${timeValue || "12:00"}:00`)
    if (!Number.isNaN(local.getTime())) set("scheduledFor", local.toISOString())
  }

  const save = () =>
    startTransition(async () => {
      const result = await saveContentItem(workspace.slug, draft)
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        return
      }
      if (item.status === "approved" && result.data.status === "draft") toast.info("Edited after approval — the post needs review again.")
      else toast.success(isNew ? "Post created" : "Post saved")
      onSaved(result.data)
    })

  const transition = (status: ContentStatus) =>
    startTransition(async () => {
      if (!isNew) {
        const saved = await saveContentItem(workspace.slug, draft)
        if (!saved.ok) {
          setErrors(saved.fieldErrors ?? {})
          toast.error(saved.error)
          return
        }
      }
      const result = await setContentStatus(workspace.slug, { id: draft.id, status, note: note || null })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Moved to ${CONTENT_STATUS_LABELS[status]}`)
      onSaved(result.data)
    })

  const remove = () =>
    startTransition(async () => {
      if (!window.confirm(`Delete "${draft.title || "this post"}"?`)) return
      const result = await deleteContentItem(workspace.slug, draft.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Post deleted")
      onDeleted(draft.id)
    })

  const formats = CONTENT_FORMATS[draft.platform]

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[draft.status]}>{CONTENT_STATUS_LABELS[draft.status]}</Badge>
            {draft.creativeProjectId ? (
              <Button asChild variant="link" size="sm" className="h-auto px-0 text-xs">
                <Link href={`${workspaceHref(workspace.slug, "studio")}/${draft.creativeProjectId}`}><Palette /> Open design</Link>
              </Button>
            ) : null}
          </div>
          <DialogTitle>{isNew ? "New post" : draft.title || "Untitled post"}</DialogTitle>
          <DialogDescription>Times are shown in your local time zone.</DialogDescription>
        </DialogHeader>

        {draft.reviewNote ? <p className="rounded-md bg-info-subtle px-3 py-2 text-sm">Review note: {draft.reviewNote}</p> : null}

        <fieldset disabled={!canCreate || locked || pending} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="post-title">Title (internal)</Label>
            <Input id="post-title" value={draft.title} onChange={(e) => set("title", e.target.value)} aria-invalid={Boolean(errors.title)} placeholder="e.g. Winter menu reveal" />
            {errors.title ? <p className="text-xs text-destructive">{errors.title}</p> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Platform</Label>
              <Select value={draft.platform} onValueChange={(p) => setDraft((d) => ({ ...d, platform: p as ContentPlatform, format: CONTENT_FORMATS[p as ContentPlatform][0] ?? "Post" }))}>
                <SelectTrigger className="w-full"><SelectValue>{CONTENT_PLATFORM_LABELS[draft.platform]}</SelectValue></SelectTrigger>
                <SelectContent>
                  {CONTENT_PLATFORMS.map((p) => <SelectItem key={p} value={p}>{CONTENT_PLATFORM_LABELS[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Format</Label>
              <Select value={draft.format} onValueChange={(f) => set("format", f)}>
                <SelectTrigger className="w-full"><SelectValue>{draft.format}</SelectValue></SelectTrigger>
                <SelectContent>
                  {[...new Set([...formats, draft.format])].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-date">Date</Label>
              <Input id="post-date" type="date" value={scheduled ? formatDate(scheduled, "yyyy-MM-dd") : ""} onChange={(e) => setSchedule(e.target.value, scheduled ? formatDate(scheduled, "HH:mm") : "12:00")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-time">Time</Label>
              <Input id="post-time" type="time" value={scheduled ? formatDate(scheduled, "HH:mm") : ""} disabled={!scheduled} onChange={(e) => scheduled && setSchedule(formatDate(scheduled, "yyyy-MM-dd"), e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="post-caption">Caption</Label>
              <span className={draft.caption.length > 2200 ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{draft.caption.length}/2200</span>
            </div>
            <Textarea id="post-caption" rows={6} value={draft.caption} onChange={(e) => set("caption", e.target.value)} aria-invalid={Boolean(errors.caption)} />
            {errors.caption ? <p className="text-xs text-destructive">{errors.caption}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="post-hashtags">Hashtags</Label>
            <TagInput id="post-hashtags" value={draft.hashtags} onChange={(tags) => set("hashtags", tags)} placeholder="#YourBrand" maxItems={30} invalid={Object.keys(errors).some((k) => k.startsWith("hashtags"))} />
          </div>
          <div className="space-y-1.5">
            <Label>Media</Label>
            <div className="flex flex-wrap gap-2">
              {draft.mediaAssetIds.map((id) => (
                <div key={id} className="relative size-20 overflow-hidden rounded-md border bg-muted">
                  {assetUrls[id] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                    <img src={assetUrls[id]} alt="" className="size-full object-cover" />
                  ) : null}
                  <Button type="button" size="icon-xs" variant="secondary" className="absolute top-1 right-1" onClick={() => set("mediaAssetIds", draft.mediaAssetIds.filter((m) => m !== id))} aria-label="Remove media">
                    <X />
                  </Button>
                </div>
              ))}
              <button type="button" onClick={() => setPickerOpen(true)} className="flex size-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-muted" disabled={draft.mediaAssetIds.length >= 10}>
                <ImagePlus className="size-4" /> Attach
              </button>
            </div>
          </div>
        </fieldset>

        {!isNew && !locked ? (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Workflow</p>
            {draft.status === "in_review" && canApprove ? (
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (required when requesting changes)" className="text-sm" />
            ) : null}
            <div className="flex flex-wrap gap-2">
              {draft.status === "draft" || draft.status === "failed" ? (
                draft.status === "draft" ? (
                  <Button size="sm" variant="outline" onClick={() => transition("in_review")} disabled={pending || !canCreate}><Send /> Submit for review</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => transition("draft")} disabled={pending || !canCreate}><Undo2 /> Back to draft</Button>
                )
              ) : null}
              {draft.status === "in_review" ? (
                <>
                  {canApprove ? <Button size="sm" onClick={() => transition("approved")} disabled={pending}><Check /> Approve</Button> : null}
                  <Button size="sm" variant="outline" onClick={() => transition("draft")} disabled={pending || !canCreate}>
                    <Undo2 /> {canApprove ? "Request changes" : "Withdraw"}
                  </Button>
                </>
              ) : null}
              {draft.status === "approved" && canApprove ? <Button size="sm" variant="outline" onClick={() => transition("draft")} disabled={pending}><Undo2 /> Back to draft</Button> : null}
              {draft.status === "approved" ? (
                <Button
                  size="sm"
                  variant="brand"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await requestPublishApproval(workspace.slug, draft.id)
                      if (res.ok) {
                        toast.success("Publishing approval request created", {
                          action: {
                            label: "Open Social Media",
                            onClick: () => {
                              window.location.href = workspaceHref(workspace.slug, "social")
                            },
                          },
                        })
                      } else {
                        toast.error(res.error)
                      }
                    })
                  }
                >
                  <CalendarClock /> Request publish approval
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Button size="sm" variant="outline" disabled><CalendarClock /> Schedule</Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">
                    Approve the post first, then request publishing sign-off for {CONTENT_PLATFORM_LABELS[draft.platform]}.
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            {draft.status === "approved" ? (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <PlugZap className="mt-0.5 size-3.5 shrink-0" />
                Approved and ready. Requesting publish approval locks a SHA-256 hash of this exact version in{" "}
                <Link href={workspaceHref(workspace.slug, "social")} className="text-brand hover:underline">Social Media</Link>.
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          {!isNew && canCreate && !locked ? (
            <Button variant="destructive" onClick={remove} disabled={pending}><Trash2 /> Delete</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            {canCreate && !locked ? (
              <Button onClick={save} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null} {isNew ? "Create draft" : "Save"}
              </Button>
            ) : null}
          </div>
        </DialogFooter>

        <AssetPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onSelect={(asset) => {
            if (asset.url) onAssetUrl(asset.id, asset.url)
            set("mediaAssetIds", [...new Set([...draft.mediaAssetIds, asset.id])])
          }}
          title="Attach media"
        />
      </DialogContent>
    </Dialog>
  )
}
