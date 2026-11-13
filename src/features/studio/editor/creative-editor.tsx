"use client"

import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Copy,
  Download,
  Loader2,
  MoreHorizontal,
  Palette,
  Redo2,
  Scaling,
  Send,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"

import { DesignPageView, type AssetUrls } from "@/components/creative/design-renderer"
import { FitThumbnail } from "@/components/creative/fit-thumbnail"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AssetPicker } from "@/features/assets/asset-picker"
import { deleteProject, duplicateProject, generateImage, generateVariations, saveProject, sendToPlanner } from "@/features/studio/actions"
import {
  addLayer,
  defaultImage,
  defaultShape,
  defaultText,
  duplicateLayer,
  duplicatePage,
  moveLayer,
  movePage,
  removeLayer,
  removePage,
  updateLayer,
  updatePage, defaultIcon, defaultPattern } from "@/features/studio/editor/document-ops"
import { EditorCanvas } from "@/features/studio/editor/editor-canvas"
import { downloadBlob, exportStagePages, slugify } from "@/features/studio/editor/export"
import { LayersPanel } from "@/features/studio/editor/layers-panel"
import { PropertiesPanel } from "@/features/studio/editor/properties-panel"
import { useHistory } from "@/features/studio/editor/use-history"
import { resizeDocument, type Background, type DesignDocument, type Layer } from "@/lib/creative/document"
import { CREATIVE_FORMATS, getFormat } from "@/lib/creative/formats"
import { applyBrandKit, type BrandKitStyle } from "@/lib/creative/rebrand"
import type { CreativeProject } from "@/lib/domain/creative"
import type { MediaAsset } from "@/lib/domain/media"
import { workspaceHref } from "@/lib/navigation"

type SaveState = "saved" | "dirty" | "saving" | "error"
const ZOOMS = { fit: "Fit", "0.25": "25%", "0.5": "50%", "0.75": "75%", "1": "100%" } as const

export function CreativeEditor({
  project: initialProject,
  initialAssetUrls,
  brandKits,
  imageConfigured,
}: {
  project: CreativeProject
  initialAssetUrls: AssetUrls
  /** All brand kits (the default first); the design can be switched to any of them. */
  brandKits: (BrandKitStyle & { isDefault: boolean })[]
  imageConfigured: boolean
}) {
  const { workspace, aiConfigured } = useWorkspace()
  const canEdit = useCan("content.create")
  const router = useRouter()
  const studio = workspaceHref(workspace.slug, "studio")

  const history = useHistory<DesignDocument>(initialProject.document)
  const doc = history.present
  const [name, setName] = useState(initialProject.name)
  const [brandId, setBrandId] = useState<string | null>(
    brandKits.find((k) => k.id === initialProject.brandProfileId)?.id ?? brandKits.find((k) => k.isDefault)?.id ?? brandKits[0]?.id ?? null
  )
  const brandKit = brandKits.find((k) => k.id === brandId) ?? null
  const swatches = useMemo(() => (brandKit?.colors ?? []).map((c) => c.hex), [brandKit])
  const [pageIndex, setPageIndex] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [assetUrls, setAssetUrls] = useState<AssetUrls>(initialAssetUrls)
  const [zoom, setZoom] = useState<keyof typeof ZOOMS>("fit")
  const [request, setRequest] = useState<"idle" | "saving" | "error">("idle")
  const [picker, setPicker] = useState<null | "layer" | "background" | "new-layer">(null)
  const [busy, setBusy] = useState<null | "export" | "planner" | "variations" | "image">(null)
  const [variations, setVariations] = useState<DesignDocument[] | null>(null)
  const [resizeOpen, setResizeOpen] = useState(false)
  const [exportStage, setExportStage] = useState<{ resolve: (blobs: Blob[]) => void; reject: (e: unknown) => void } | null>(null)
  const textInputRef = useRef<HTMLTextAreaElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const gestureSnapshot = useRef<DesignDocument | null>(null)

  const format = getFormat(doc.formatId)
  const page = doc.pages[Math.min(pageIndex, doc.pages.length - 1)]!
  const selected = page.layers.find((l) => l.id === selectedId) ?? null

  // ---- autosave -----------------------------------------------------------
  const [saved, setSaved] = useState({ doc: initialProject.document, name: initialProject.name, brandId })
  const dirty = saved.doc !== doc || saved.name !== name || saved.brandId !== brandId
  const saveState: SaveState = request === "saving" ? "saving" : request === "error" ? "error" : dirty ? "dirty" : "saved"

  const persist = useCallback(
    async (document: DesignDocument, projectName: string, brandProfileId: string | null) => {
      setRequest("saving")
      const result = await saveProject(workspace.slug, {
        ...initialProject,
        brandProfileId,
        name: projectName.trim() || "Untitled design",
        formatId: document.formatId,
        platform: getFormat(document.formatId).platform,
        document,
      })
      if (result.ok) {
        setSaved({ doc: document, name: projectName, brandId: brandProfileId })
        setRequest("idle")
      } else {
        setRequest("error")
        toast.error(result.error)
      }
    },
    [initialProject, workspace.slug]
  )

  useEffect(() => {
    if (!dirty || !canEdit) return
    const timer = setTimeout(() => void persist(doc, name, brandId), 1200)
    return () => clearTimeout(timer)
  }, [doc, name, brandId, dirty, persist, canEdit])

  /** Re-skins the design with another brand kit: colours, fonts, logo, icon style and corners. */
  const switchBrand = (id: string) => {
    const next = brandKits.find((k) => k.id === id)
    if (!next || id === brandId) return
    history.apply((d) => applyBrandKit(d, brandKit, next))
    setBrandId(id)
    toast.success(`Applied the "${next.name}" brand kit`, { description: "Undo (Ctrl+Z) restores the previous look." })
  }

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  // ---- mutations ----------------------------------------------------------
  const patchLayer = useCallback(
    (id: string, patch: Partial<Layer>, coalesceKey?: string) => history.apply((d) => updateLayer(d, pageIndex, id, patch), coalesceKey ? `${id}-${coalesceKey}` : undefined),
    [history, pageIndex]
  )

  const setBackground = (background: Background, coalesceKey?: string) =>
    history.apply((d) => updatePage(d, pageIndex, (p) => ({ ...p, background })), coalesceKey)

  const insertLayer = (layer: Layer) => {
    history.apply((d) => addLayer(d, pageIndex, layer))
    setSelectedId(layer.id)
  }

  const removeSelected = useCallback(() => {
    if (!selectedId) return
    history.apply((d) => removeLayer(d, pageIndex, selectedId))
    setSelectedId(null)
  }, [history, pageIndex, selectedId])

  const duplicateSelected = useCallback(
    (id = selectedId) => {
      if (!id) return
      const result = duplicateLayer(doc, pageIndex, id)
      if (!result.id) return
      history.apply(() => result.document)
      setSelectedId(result.id)
    },
    [doc, history, pageIndex, selectedId]
  )

  // ---- keyboard -----------------------------------------------------------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const typing = target.closest("input, textarea, select, [contenteditable=true], [role=dialog]")
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === "z" && !typing) {
        event.preventDefault()
        if (event.shiftKey) history.redo()
        else history.undo()
      } else if (mod && event.key.toLowerCase() === "y" && !typing) {
        event.preventDefault()
        history.redo()
      } else if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault()
        void persist(doc, name, brandId)
      } else if (typing) {
        return
      } else if (mod && event.key.toLowerCase() === "d" && selectedId) {
        event.preventDefault()
        duplicateSelected()
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault()
        removeSelected()
      } else if (event.key === "Escape") {
        setSelectedId(null)
      } else if (event.key.startsWith("Arrow") && selected && !selected.locked) {
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0
        patchLayer(selected.id, { x: selected.x + dx, y: selected.y + dy }, "nudge")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [history, persist, doc, name, brandId, selectedId, selected, duplicateSelected, removeSelected, patchLayer])

  // ---- images -------------------------------------------------------------
  const applyAsset = (asset: MediaAsset, target: "layer" | "background" | "new-layer") => {
    if (asset.url) setAssetUrls((urls) => ({ ...urls, [asset.id]: asset.url! }))
    const aspect = asset.width && asset.height ? asset.width / asset.height : null
    if (target === "new-layer") insertLayer(defaultImage(doc, asset.id, aspect))
    else if (target === "layer" && selected?.type === "image") patchLayer(selected.id, { assetId: asset.id })
    else {
      const current = page.background
      const fallback = current.type === "solid" ? current.color : current.type === "gradient" ? current.from : current.fallback
      setBackground({ type: "image", assetId: asset.id, fallback, overlayColor: "#000000", overlayOpacity: current.type === "image" ? current.overlayOpacity : 0.3 })
    }
  }

  const makeImage = async (target: "layer" | "background", prompt: string) => {
    setBusy("image")
    const result = await generateImage(workspace.slug, { prompt, formatId: doc.formatId })
    setBusy(null)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    applyAsset(result.data, target === "layer" && selected?.type === "image" ? "layer" : target === "layer" ? "new-layer" : "background")
    toast.success("Image generated and saved to your Asset Library")
  }

  // ---- export -------------------------------------------------------------
  const renderPages = () =>
    new Promise<Blob[]>((resolve, reject) => {
      setExportStage({ resolve, reject })
    })

  useEffect(() => {
    if (!exportStage || !stageRef.current) return
    const stage = stageRef.current
    const run = async () => {
      try {
        // Give images in the off-screen stage a moment to load before rasterising.
        await new Promise((r) => setTimeout(r, 150))
        exportStage.resolve(await exportStagePages(stage, doc.width, doc.height))
      } catch (error) {
        exportStage.reject(error)
      } finally {
        setExportStage(null)
      }
    }
    void run()
  }, [exportStage, doc.width, doc.height])

  const exportPng = async () => {
    setBusy("export")
    try {
      const blobs = await renderPages()
      blobs.forEach((blob, i) => downloadBlob(blob, `${slugify(name)}${blobs.length > 1 ? `-${i + 1}` : ""}.png`))
      toast.success(blobs.length > 1 ? `Downloaded ${blobs.length} slides` : "PNG downloaded")
    } catch (error) {
      console.error(error)
      toast.error("Export failed. If the design uses images, check your connection and try again.")
    } finally {
      setBusy(null)
    }
  }

  const toPlanner = async () => {
    setBusy("planner")
    try {
      await persist(doc, name, brandId)
      const blobs = await renderPages()
      const form = new FormData()
      form.set("projectId", initialProject.id)
      blobs.forEach((blob, i) => form.append("pages", new File([blob], `${slugify(name)}-${i + 1}.png`, { type: "image/png" })))
      const result = await sendToPlanner(workspace.slug, form)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Added to the Content Planner as a draft", {
        action: { label: "Open planner", onClick: () => router.push(workspaceHref(workspace.slug, "planner")) },
      })
    } catch (error) {
      console.error(error)
      toast.error("Could not export the design.")
    } finally {
      setBusy(null)
    }
  }

  const loadVariations = async () => {
    setBusy("variations")
    setVariations([])
    await persist(doc, name, brandId)
    const result = await generateVariations(workspace.slug, initialProject.id)
    setBusy(null)
    if (result.ok) setVariations(result.data)
    else {
      setVariations(null)
      toast.error(result.error)
    }
  }

  const saveLabel = useMemo(() => {
    switch (saveState) {
      case "saved":
        return { icon: <Check className="size-3.5 text-success" />, text: "Saved" }
      case "dirty":
        return { icon: <span className="size-1.5 rounded-full bg-warning" />, text: "Unsaved" }
      case "saving":
        return { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Saving…" }
      case "error":
        return { icon: <CloudOff className="size-3.5 text-destructive" />, text: "Not saved" }
      default: {
        const unreachable: never = saveState
        return unreachable
      }
    }
  }, [saveState])

  return (
    <div className="flex h-[calc(100svh-3rem)] min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-2 md:px-3">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Back to Creative Studio">
          <Link href={studio}><ArrowLeft /></Link>
        </Button>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-40 border-transparent bg-transparent font-medium shadow-none hover:border-input md:w-64" aria-label="Design name" maxLength={160} disabled={!canEdit} />
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex" aria-live="polite">
          {saveLabel.icon} {saveLabel.text}
        </span>
        <span className="hidden text-xs text-muted-foreground lg:inline">· {format.label} · {doc.width}×{doc.height}</span>

        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={history.undo} disabled={!history.canUndo} aria-label="Undo"><Undo2 /></Button>
            </TooltipTrigger>
            <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={history.redo} disabled={!history.canRedo} aria-label="Redo"><Redo2 /></Button>
            </TooltipTrigger>
            <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
          </Tooltip>
          {brandKits.length ? (
            <Select value={brandId ?? ""} onValueChange={(v) => switchBrand(v as string)} disabled={!canEdit}>
              <SelectTrigger size="sm" className="max-w-44" aria-label="Brand kit">
                <SelectValue>
                  <Palette className="text-muted-foreground" />
                  <span className="truncate">{brandKit?.name ?? "Brand kit"}</span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {brandKits.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    <span className="flex -space-x-1" aria-hidden>
                      {(k.colors.length ? k.colors.map((c) => c.hex) : ["#d4d4d4"]).slice(0, 3).map((hex, i) => (
                        <span key={i} className="size-3 rounded-full border border-background" style={{ backgroundColor: hex }} />
                      ))}
                    </span>
                    {k.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select value={zoom} onValueChange={(v) => setZoom(v as keyof typeof ZOOMS)}>
            <SelectTrigger size="sm" className="hidden w-20 md:flex" aria-label="Zoom"><SelectValue>{ZOOMS[zoom]}</SelectValue></SelectTrigger>
            <SelectContent>
              {(Object.keys(ZOOMS) as (keyof typeof ZOOMS)[]).map((z) => <SelectItem key={z} value={z}>{ZOOMS[z]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void loadVariations()} disabled={!aiConfigured || !canEdit || busy !== null} className="hidden md:inline-flex">
            {busy === "variations" ? <Loader2 className="animate-spin" /> : <Sparkles />} Variations
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportPng()} disabled={busy !== null}>
            {busy === "export" ? <Loader2 className="animate-spin" /> : <Download />} <span className="hidden sm:inline">Export PNG</span>
          </Button>
          <Button variant="brand" size="sm" onClick={() => void toPlanner()} disabled={!canEdit || busy !== null}>
            {busy === "planner" ? <Loader2 className="animate-spin" /> : <Send />} <span className="hidden sm:inline">Send to Planner</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More actions"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setResizeOpen(true)} disabled={!canEdit}><Scaling /> Resize to another format</DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canEdit}
                onSelect={async () => {
                  await persist(doc, name, brandId)
                  const result = await duplicateProject(workspace.slug, initialProject.id)
                  if (result.ok) router.push(`${studio}/${result.data.projectId}`)
                  else toast.error(result.error)
                }}
              >
                <Copy /> Duplicate design
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                disabled={!canEdit}
                onSelect={async () => {
                  if (!window.confirm(`Delete "${name}"?`)) return
                  const result = await deleteProject(workspace.slug, initialProject.id)
                  if (result.ok) router.push(studio)
                  else toast.error(result.error)
                }}
              >
                <Trash2 /> Delete design
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Workspace */}
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_18rem]">
        <aside className="hidden min-h-0 overflow-x-hidden overflow-y-auto border-r md:block" aria-label="Layers">
          <fieldset disabled={!canEdit} className="min-w-0">
            <LayersPanel
              document={doc}
              pageIndex={pageIndex}
              selectedId={selectedId}
              assetUrls={assetUrls}
              maxPages={format.maxPages}
              onSelect={setSelectedId}
              onPatch={(id, patch) => patchLayer(id, patch)}
              onMove={(id, direction) => history.apply((d) => moveLayer(d, pageIndex, id, direction))}
              onDuplicate={(id) => duplicateSelected(id)}
              onRemove={(id) => {
                history.apply((d) => removeLayer(d, pageIndex, id))
                setSelectedId(null)
              }}
              onAddText={() => insertLayer(defaultText(doc, swatches[0] ?? "#111111"))}
              onAddShape={(shape) => insertLayer(defaultShape(doc, swatches[1] ?? swatches[0] ?? "#E4572E", shape))}
              onAddImage={() => setPicker("new-layer")}
              onAddIcon={() => insertLayer(defaultIcon(doc, swatches[0] ?? "#111111", swatches[1] ? `${swatches[1]}` : null))}
              onAddPattern={() => insertLayer(defaultPattern(doc, swatches[0] ?? "#111111"))}
              onSelectPage={(i) => {
                setPageIndex(i)
                setSelectedId(null)
              }}
              onAddPage={() => {
                history.apply((d) => duplicatePage(d, pageIndex))
                setPageIndex(pageIndex + 1)
                setSelectedId(null)
              }}
              onRemovePage={(i) => {
                history.apply((d) => removePage(d, i))
                setPageIndex(Math.max(0, i - 1))
                setSelectedId(null)
              }}
              onMovePage={(i, direction) => {
                history.apply((d) => movePage(d, i, direction))
                setPageIndex(i + direction)
              }}
            />
          </fieldset>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col">
          <EditorCanvas
            document={doc}
            pageIndex={Math.min(pageIndex, doc.pages.length - 1)}
            assetUrls={assetUrls}
            selectedId={selectedId}
            zoom={zoom === "fit" ? null : Number(zoom)}
            onSelect={setSelectedId}
            onGestureStart={() => {
              gestureSnapshot.current = doc
            }}
            onGestureChange={(id, patch) => history.preview((d) => updateLayer(d, pageIndex, id, patch))}
            onGestureEnd={() => {
              if (gestureSnapshot.current) history.commitFrom(gestureSnapshot.current)
              gestureSnapshot.current = null
            }}
            onEditText={() => setTimeout(() => textInputRef.current?.focus(), 0)}
          />
          {doc.pages.length > 1 ? (
            <div className="flex h-10 shrink-0 items-center justify-center gap-2 border-t text-xs">
              <Button variant="ghost" size="icon-xs" onClick={() => { setPageIndex((i) => Math.max(0, i - 1)); setSelectedId(null) }} disabled={pageIndex === 0} aria-label="Previous slide"><ChevronLeft /></Button>
              Slide {pageIndex + 1} of {doc.pages.length}
              <Button variant="ghost" size="icon-xs" onClick={() => { setPageIndex((i) => Math.min(doc.pages.length - 1, i + 1)); setSelectedId(null) }} disabled={pageIndex >= doc.pages.length - 1} aria-label="Next slide"><ChevronRight /></Button>
            </div>
          ) : null}
        </div>

        <aside className="hidden min-h-0 overflow-x-hidden overflow-y-auto border-l xl:block" aria-label="Properties">
          <fieldset disabled={!canEdit} className="min-w-0">
            <PropertiesPanel
              document={doc}
              page={page}
              layer={selected}
              swatches={swatches}
              textInputRef={textInputRef}
              imageConfigured={imageConfigured}
              generatingImage={busy === "image"}
              defaultImagePrompt={initialProject.brief.concept?.imagePrompt || initialProject.brief.spec?.imagePrompt || ""}
              onLayerPatch={(patch, key) => selected && patchLayer(selected.id, patch, key)}
              onBackground={setBackground}
              onPickImage={(target) => setPicker(target)}
              onGenerateImage={(target, prompt) => void makeImage(target, prompt)}
            />
          </fieldset>
        </aside>
      </div>

      <AssetPicker
        open={picker !== null}
        onOpenChange={(open) => !open && setPicker(null)}
        onSelect={(asset) => picker && applyAsset(asset, picker)}
        title={picker === "background" ? "Choose a background image" : "Choose an image"}
      />

      <Dialog open={variations !== null} onOpenChange={(open) => !open && setVariations(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Design variations</DialogTitle>
            <DialogDescription>Three alternatives from the Graphic Designer. Applying one replaces the current design (you can undo).</DialogDescription>
          </DialogHeader>
          {busy === "variations" || !variations?.length ? (
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {variations.map((variant, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    history.apply(() => variant)
                    setPageIndex(0)
                    setSelectedId(null)
                    setVariations(null)
                    toast.success("Variation applied")
                  }}
                  className="rounded-lg border p-2 text-left transition-colors hover:border-brand"
                >
                  <FitThumbnail document={variant} assetUrls={assetUrls} />
                  <span className="mt-2 block text-xs font-medium">Use variation {i + 1}</span>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={resizeOpen} onOpenChange={setResizeOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Resize to another format</DialogTitle>
            <DialogDescription>Layers are scaled and repositioned. Review the result and fine-tune; undo restores the original.</DialogDescription>
          </DialogHeader>
          <ul className="grid max-h-[50vh] grid-cols-2 gap-1.5 overflow-y-auto">
            {CREATIVE_FORMATS.filter((f) => f.id !== doc.formatId).map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    history.apply((d) => {
                      const resized = resizeDocument(d, f.id, f.width, f.height)
                      return { ...resized, pages: resized.pages.slice(0, f.maxPages) }
                    })
                    setPageIndex(0)
                    setSelectedId(null)
                    setResizeOpen(false)
                  }}
                >
                  <span className="block font-medium">{f.label}</span>
                  <span className="text-xs text-muted-foreground">{f.width}×{f.height}</span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Off-screen native-size render used for PNG export */}
      {exportStage
        ? createPortal(
            <div ref={stageRef} aria-hidden style={{ position: "fixed", left: -100000, top: 0, pointerEvents: "none" }}>
              {doc.pages.map((p) => (
                <DesignPageView key={p.id} document={doc} page={p} assetUrls={assetUrls} exportId={p.id} />
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
