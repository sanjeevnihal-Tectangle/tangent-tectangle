"use client"

import { ImagePlus, Loader2, Search, Sparkles, Trash2, Upload, Wand2 } from "lucide-react"
import Link from "next/link"
import { useMemo, useRef, useState, useTransition, type DragEvent } from "react"
import { toast } from "sonner"

import { PageHeader } from "@/components/page/page-header"
import { EmptyState, NotConfigured } from "@/components/states/states"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { deleteAsset } from "@/features/assets/actions"
import { uploadFile } from "@/features/assets/upload"
import type { MediaAsset } from "@/lib/domain/media"
import { workspaceHref } from "@/lib/navigation"
import { cn } from "@/lib/utils"

const FILTERS = { all: "All", upload: "Uploads", ai_generated: "AI generated", export: "Design exports" } as const
type Filter = keyof typeof FILTERS

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AssetLibrary({ initial }: { initial: MediaAsset[] }) {
  const { workspace, mode } = useWorkspace()
  const canUpload = useCan("content.create")
  const [assets, setAssets] = useState(initial)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<MediaAsset | null>(null)
  const [deleting, startDeleting] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return assets.filter((a) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "export" ? a.tags.includes("creative-export") : a.source === filter && !a.tags.includes("creative-export"))
      return matchesFilter && (!term || a.name.toLowerCase().includes(term) || a.tags.some((t) => t.toLowerCase().includes(term)))
    })
  }, [assets, filter, search])

  const upload = async (files: FileList | File[] | null) => {
    const list = Array.from(files ?? [])
    if (!list.length) return
    setUploading({ done: 0, total: list.length })
    let failed = 0
    for (const [index, file] of list.entries()) {
      const result = await uploadFile(workspace.slug, file)
      if (result.ok) setAssets((current) => [result.asset, ...current])
      else {
        failed += 1
        toast.error(result.error)
      }
      setUploading({ done: index + 1, total: list.length })
    }
    setUploading(null)
    if (list.length - failed > 0) toast.success(`${list.length - failed} image${list.length - failed > 1 ? "s" : ""} uploaded`)
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (canUpload && mode === "live") void upload(event.dataTransfer.files)
  }

  const remove = (asset: MediaAsset) =>
    startDeleting(async () => {
      const result = await deleteAsset(workspace.slug, asset.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setAssets((current) => current.filter((a) => a.id !== asset.id))
      setPreview(null)
      toast.success("Asset deleted")
    })

  return (
    <div className="space-y-6" onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <PageHeader
        title="Asset Library"
        description="Photos, products, logos and AI-generated images — available in every design."
        actions={
          canUpload ? (
            <>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" multiple hidden onChange={(e) => void upload(e.target.files)} />
              <Button size="sm" onClick={() => fileRef.current?.click()} disabled={Boolean(uploading) || mode === "demo"}>
                {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                {uploading ? `Uploading ${uploading.done}/${uploading.total}…` : "Upload images"}
              </Button>
            </>
          ) : null
        }
      />

      {mode === "demo" ? (
        <NotConfigured title="The Asset Library needs Supabase Storage" description="Connect Supabase to upload and store images privately for your workspace." envVars={["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]} />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search names and tags" className="pl-8" aria-label="Search assets" />
        </div>
        <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={filter} onValueChange={(v) => v && setFilter(v as Filter)} aria-label="Filter assets">
          {(Object.keys(FILTERS) as Filter[]).map((key) => (
            <ToggleGroupItem key={key} value={key} className="px-2.5 text-xs">
              {FILTERS[key]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-xs text-muted-foreground sm:ml-auto">{visible.length} of {assets.length} assets</p>
      </div>

      {assets.length === 0 && mode === "live" ? (
        <div
          className={cn("rounded-lg border-2 border-dashed transition-colors", dragging && "border-brand bg-brand-subtle/40")}
        >
          <EmptyState
            icon={ImagePlus}
            title="Drop images here to start your library"
            description="PNG, JPEG, WebP, GIF or SVG up to 10 MB each. Product shots, team photos and logos work best."
            className="border-0"
            action={canUpload ? <Button onClick={() => fileRef.current?.click()}><Upload /> Choose files</Button> : undefined}
          />
        </div>
      ) : visible.length === 0 && assets.length > 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No assets match this filter.</p>
      ) : (
        <ul className={cn("grid grid-cols-2 gap-3 rounded-lg sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6", dragging && "outline-2 outline-dashed outline-brand outline-offset-4")}>
          {visible.map((asset) => (
            <li key={asset.id}>
              <button type="button" onClick={() => setPreview(asset)} className="group block w-full text-left focus-visible:outline-none">
                <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted group-focus-visible:ring-2 group-focus-visible:ring-ring">
                  {asset.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed storage URLs
                    <img src={asset.url} alt={asset.name} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  ) : null}
                  {asset.source === "ai_generated" ? (
                    <Badge variant="brand" className="absolute top-1.5 left-1.5"><Sparkles /> AI</Badge>
                  ) : null}
                </div>
                <p className="mt-1.5 truncate text-xs font-medium">{asset.name}</p>
                <p className="text-[0.7rem] text-muted-foreground">
                  {asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ""}
                  {formatBytes(asset.sizeBytes)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        {preview ? (
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="truncate pr-6">{preview.name}</DialogTitle>
              <DialogDescription>
                {preview.mimeType} · {formatBytes(preview.sizeBytes)}
                {preview.width && preview.height ? ` · ${preview.width}×${preview.height}` : ""} · added{" "}
                {new Date(preview.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </DialogDescription>
            </DialogHeader>
            {preview.url ? (
              <div className="flex max-h-[55vh] justify-center overflow-hidden rounded-md border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs */}
                <img src={preview.url} alt={preview.name} className="max-h-[55vh] object-contain" />
              </div>
            ) : null}
            {preview.generation ? (
              <p className="rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Generated by {preview.generation.model}:</span> {preview.generation.prompt}
              </p>
            ) : null}
            {preview.tags.length ? (
              <div className="flex flex-wrap gap-1">{preview.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}</div>
            ) : null}
            <DialogFooter className="gap-2 sm:justify-between">
              {canUpload ? (
                <Button variant="destructive" onClick={() => remove(preview)} disabled={deleting}>
                  <Trash2 /> Delete
                </Button>
              ) : <span />}
              <Button asChild>
                <Link href={`${workspaceHref(workspace.slug, "studio")}/new?image=${preview.id}`}>
                  <Wand2 /> Use in a new design
                </Link>
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  )
}
