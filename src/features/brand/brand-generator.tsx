"use client"

import { ImagePlus, Loader2, Sparkles, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import { AssetPicker } from "@/features/assets/asset-picker"
import { generateBrandProfile } from "@/features/brand/generate"
import { emptyBrandProfile, type BrandProfile } from "@/lib/domain/brand"
import type { MediaAsset } from "@/lib/domain/media"

type Picked = Pick<MediaAsset, "id" | "name" | "url">

/** Dominant colours of an image, measured in the browser so hex values are exact. */
async function measureColors(url: string): Promise<string[]> {
  const img = new Image()
  img.crossOrigin = "anonymous"
  img.src = url
  await img.decode()
  const size = 64
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(img, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 200) continue // transparent logo background
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!
    const key = `${r >> 4},${g >> 4},${b >> 4}`
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 }
    bucket.r += r
    bucket.g += g
    bucket.b += b
    bucket.n += 1
    buckets.set(key, bucket)
  }
  const colours = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map((c) => [Math.round(c.r / c.n), Math.round(c.g / c.n), Math.round(c.b / c.n)] as const)
  const picked: (readonly [number, number, number])[] = []
  for (const c of colours) {
    if (picked.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) > 48)) picked.push(c)
    if (picked.length >= 6) break
  }
  return picked.map((c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase())
}

export function BrandGenerator({
  open,
  onOpenChange,
  current,
  currentSaved,
  currentDirty,
  savedCount,
  onGenerated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The profile being edited, if any (can be filled in place). */
  current: BrandProfile | null
  /** Whether `current` is already saved (an unsaved new kit is filled in place by default). */
  currentSaved: boolean
  /** Whether `current` has unsaved edits that a new draft would replace. */
  currentDirty: boolean
  /** Saved brand kits, to warn before the plan limit is hit. */
  savedCount: number
  onGenerated: (draft: BrandProfile) => void
}) {
  const { workspace, usage } = useWorkspace()
  const limit = usage.find((u) => u.key === "brand_profiles")?.limit ?? null
  const [prompt, setPrompt] = useState("")
  const [logo, setLogo] = useState<Picked | null>(null)
  const [references, setReferences] = useState<Picked[]>([])
  const [picker, setPicker] = useState<"logo" | "reference" | null>(null)
  const [target, setTarget] = useState<"new" | "current">("new")
  const [busy, setBusy] = useState(false)

  // Each time the dialog opens: an unsaved new kit is filled in place; a saved one gets a new kit.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setTarget(current && !currentSaved ? "current" : "new")
  }

  const fillsCurrent = target === "current" && current !== null
  const createsNew = !fillsCurrent || !currentSaved
  const atLimit = createsNew && limit !== null && savedCount >= limit

  const generate = async () => {
    if (!fillsCurrent && currentDirty && !window.confirm("Discard unsaved changes to the current brand kit?")) return
    setBusy(true)
    try {
      const measured: string[] = []
      for (const asset of [logo, ...references]) {
        if (!asset?.url) continue
        try {
          for (const hex of await measureColors(asset.url)) if (!measured.includes(hex) && measured.length < 12) measured.push(hex)
        } catch {
          // Cross-origin or unsupported image: the model still sees the image itself.
        }
      }
      const base = fillsCurrent && current ? current : emptyBrandProfile(crypto.randomUUID(), "New brand kit")
      const result = await generateBrandProfile(
        workspace.slug,
        { prompt, logoAssetId: logo?.id ?? null, referenceAssetIds: references.map((r) => r.id), measuredColors: measured },
        base
      )
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onGenerated(result.data)
      onOpenChange(false)
      // Ready for the next kit.
      setPrompt("")
      setLogo(null)
      setReferences([])
      toast.success("Brand kit drafted. Review it, then save.", {
        description: result.imagesUsed ? `Built from your description and ${result.imagesUsed} image${result.imagesUsed === 1 ? "" : "s"}.` : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  const thumb = (asset: Picked, onRemove: () => void) => (
    <div key={asset.id} className="relative">
      {asset.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
        <img src={asset.url} alt={asset.name} className="size-16 rounded-md border bg-muted object-contain" />
      ) : (
        <div className="flex size-16 items-center justify-center rounded-md border bg-muted text-xs">Image</div>
      )}
      <Button type="button" size="icon" variant="secondary" className="absolute -top-2 -right-2 size-5 rounded-full" aria-label={`Remove ${asset.name}`} onClick={onRemove}>
        <X />
      </Button>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" /> Generate a brand kit with AI
          </DialogTitle>
          <DialogDescription>
            Describe the brand, add your logo and a few reference images. Tangent drafts colours, fonts, voice, messaging and
            visual style; you review it before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="brand-prompt">Describe the brand</Label>
            <Textarea
              id="brand-prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Tangent is an AI marketing platform for Indian small businesses. Friendly but expert, modern tech look, blue and amber, simple illustrations."
              maxLength={3000}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <div className="space-y-1.5">
              <Label>Logo</Label>
              <div className="flex gap-2">
                {logo ? (
                  thumb(logo, () => setLogo(null))
                ) : (
                  <Button type="button" variant="outline" className="size-16 flex-col gap-1 text-xs" onClick={() => setPicker("logo")}>
                    <ImagePlus /> Logo
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reference images (up to 5)</Label>
              <div className="flex flex-wrap gap-2">
                {references.map((r) => thumb(r, () => setReferences((list) => list.filter((x) => x.id !== r.id))))}
                {references.length < 5 ? (
                  <Button type="button" variant="outline" className="size-16 flex-col gap-1 text-xs" onClick={() => setPicker("reference")}>
                    <ImagePlus /> Add
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {current ? (
            <RadioGroup value={target} onValueChange={(v) => setTarget(v as "new" | "current")} className="gap-2">
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="new" /> Create another brand kit
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="current" /> Fill &ldquo;{current.name}&rdquo; (replaces its fields; nothing is saved until you click Save)
              </label>
            </RadioGroup>
          ) : null}
          {atLimit ? (
            <p className="rounded-md bg-warning-subtle px-3 py-2 text-xs" role="status">
              Your plan includes {limit} brand kit{limit === 1 ? "" : "s"} and you have {savedCount}. You can generate a draft, but
              saving it as a new kit needs a plan upgrade or deleting an unused kit. Filling an existing kit always works.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void generate()} disabled={busy || (!prompt.trim() && !logo && references.length === 0)}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>

        <AssetPicker
          open={picker !== null}
          onOpenChange={(o) => !o && setPicker(null)}
          title={picker === "logo" ? "Choose your logo" : "Choose a reference image"}
          onSelect={(asset) => {
            const picked = { id: asset.id, name: asset.name, url: asset.url }
            if (picker === "logo") setLogo(picked)
            else setReferences((list) => (list.some((r) => r.id === asset.id) ? list : [...list, picked].slice(0, 5)))
            setPicker(null)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
