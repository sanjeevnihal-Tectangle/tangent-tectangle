"use client"

import { ImagePlus, Loader2, Search, Sparkles, Upload } from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { searchAssets } from "@/features/assets/actions"
import { uploadFile } from "@/features/assets/upload"
import type { MediaAsset } from "@/lib/domain/media"
import { cn } from "@/lib/utils"

/** Dialog to choose (or upload) an image from the Asset Library. */
export function AssetPicker({
  open,
  onOpenChange,
  onSelect,
  title = "Choose an image",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (asset: MediaAsset) => void
  title?: string
}) {
  const { workspace, mode } = useWorkspace()
  const [assets, setAssets] = useState<MediaAsset[] | null>(null)
  const [search, setSearch] = useState("")
  const [loading, startLoading] = useTransition()
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(
      () =>
        startLoading(async () => {
          const result = await searchAssets(workspace.slug, search)
          if (result.ok) setAssets(result.data)
          else toast.error(result.error)
        }),
      search ? 250 : 0
    )
    return () => clearTimeout(timer)
  }, [open, search, workspace.slug])

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const result = await uploadFile(workspace.slug, file)
      if (result.ok) setAssets((list) => [result.asset, ...(list ?? [])])
      else toast.error(result.error)
    }
    setUploading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>From your Asset Library. Uploads are stored privately in your workspace.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" className="pl-8" aria-label="Search assets" />
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void upload(e.target.files)} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading || mode === "demo"}>
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />} Upload
          </Button>
        </div>
        <div className="max-h-[55vh] min-h-48 overflow-y-auto">
          {assets === null || (loading && assets.length === 0) ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> Loading assets…
            </div>
          ) : assets.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <ImagePlus className="size-6" />
              {mode === "demo" ? "The Asset Library needs Supabase Storage." : "No images yet. Upload your photos, products or logos."}
            </div>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(asset)
                      onOpenChange(false)
                    }}
                    className={cn("group relative block aspect-square w-full overflow-hidden rounded-md border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}
                    title={asset.name}
                  >
                    {asset.url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed storage URLs; next/image optimisation not configured for them
                      <img src={asset.url} alt={asset.name} className="size-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                    ) : null}
                    {asset.source === "ai_generated" ? (
                      <Badge variant="brand" className="absolute top-1 left-1">
                        <Sparkles /> AI
                      </Badge>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
