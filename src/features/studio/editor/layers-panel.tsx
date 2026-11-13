"use client"

import { ArrowDown, ArrowUp, Blend, Circle, Copy, Eye, EyeOff, Grid3x3, ImageIcon, Lock, LockOpen, Plus, Shapes, Sparkles, Square, Trash2, Type } from "lucide-react"

import type { AssetUrls } from "@/components/creative/design-renderer"
import { FitThumbnail } from "@/components/creative/fit-thumbnail"
import { Button } from "@/components/ui/button"
import type { DesignDocument, Layer } from "@/lib/creative/document"
import { cn } from "@/lib/utils"

const ICONS = { text: Type, shape: Square, image: ImageIcon, icon: Shapes, pattern: Grid3x3 } as const

export function LayersPanel({
  document,
  pageIndex,
  selectedId,
  assetUrls,
  maxPages,
  onSelect,
  onPatch,
  onMove,
  onDuplicate,
  onRemove,
  onAddText,
  onAddShape,
  onAddImage,
  onAddIcon,
  onAddPattern,
  onSelectPage,
  onAddPage,
  onRemovePage,
  onMovePage,
}: {
  document: DesignDocument
  pageIndex: number
  selectedId: string | null
  assetUrls: AssetUrls
  maxPages: number
  onSelect: (id: string) => void
  onPatch: (id: string, patch: Partial<Layer>) => void
  onMove: (id: string, direction: 1 | -1) => void
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
  onAddText: () => void
  onAddShape: (shape: "rect" | "ellipse" | "blob") => void
  onAddImage: () => void
  onAddIcon: () => void
  onAddPattern: () => void
  onSelectPage: (index: number) => void
  onAddPage: () => void
  onRemovePage: (index: number) => void
  onMovePage: (index: number, direction: 1 | -1) => void
}) {
  const page = document.pages[pageIndex]!
  const layers = [...page.layers].reverse()

  return (
    <div className="space-y-5 p-3">
      <section className="space-y-2">
        <h2 className="font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">Add</h2>
        <div className="grid grid-cols-4 gap-1.5">
          <Button variant="outline" size="sm" onClick={onAddText} aria-label="Add text"><Type /></Button>
          <Button variant="outline" size="sm" onClick={() => onAddShape("rect")} aria-label="Add rectangle"><Square /></Button>
          <Button variant="outline" size="sm" onClick={() => onAddShape("ellipse")} aria-label="Add circle"><Circle /></Button>
          <Button variant="outline" size="sm" onClick={onAddImage} aria-label="Add image"><ImageIcon /></Button>
          <Button variant="outline" size="sm" onClick={onAddIcon} aria-label="Add icon"><Sparkles /></Button>
          <Button variant="outline" size="sm" onClick={() => onAddShape("blob")} aria-label="Add blob"><Blend /></Button>
          <Button variant="outline" size="sm" onClick={onAddPattern} aria-label="Add pattern"><Grid3x3 /></Button>
        </div>
      </section>

      {maxPages > 1 ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Slides {document.pages.length}/{maxPages}
            </h2>
            <Button variant="ghost" size="icon-xs" onClick={onAddPage} disabled={document.pages.length >= maxPages} aria-label="Duplicate slide">
              <Plus />
            </Button>
          </div>
          <ol className="grid grid-cols-3 gap-1.5">
            {document.pages.map((p, i) => (
              <li key={p.id} className="group relative">
                <button type="button" onClick={() => onSelectPage(i)} className={cn("block w-full rounded-md border-2 p-0.5", i === pageIndex ? "border-brand" : "border-transparent hover:border-border")} aria-label={`Slide ${i + 1}`} aria-current={i === pageIndex ? "true" : undefined}>
                  <FitThumbnail document={document} pageIndex={i} assetUrls={assetUrls} />
                </button>
                <span className="absolute top-1 left-1.5 text-[0.6rem] font-medium text-white mix-blend-difference">{i + 1}</span>
                {i === pageIndex ? (
                  <div className="mt-1 flex justify-center gap-0.5">
                    <Button variant="ghost" size="icon-xs" onClick={() => onMovePage(i, -1)} disabled={i === 0} aria-label="Move slide left"><ArrowUp className="-rotate-90" /></Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => onRemovePage(i)} disabled={document.pages.length <= 1} aria-label="Delete slide"><Trash2 /></Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => onMovePage(i, 1)} disabled={i === document.pages.length - 1} aria-label="Move slide right"><ArrowDown className="-rotate-90" /></Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">Layers</h2>
        {layers.length === 0 ? <p className="text-xs text-muted-foreground">No layers on this page.</p> : null}
        <ul className="space-y-0.5">
          {layers.map((layer) => {
            const Icon = ICONS[layer.type]
            const selected = layer.id === selectedId
            return (
              <li key={layer.id} className={cn("group flex items-center gap-1 rounded-md pr-1", selected ? "bg-brand-subtle" : "hover:bg-muted")}>
                <button type="button" onClick={() => onSelect(layer.id)} className={cn("flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-xs", layer.hidden && "opacity-50")}>
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{layer.type === "text" ? layer.text.split("\n")[0] || layer.name : layer.name}</span>
                </button>
                <div className={cn("flex items-center", selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100")}>
                  <Button variant="ghost" size="icon-xs" onClick={() => onPatch(layer.id, { hidden: !layer.hidden })} aria-label={layer.hidden ? "Show layer" : "Hide layer"}>
                    {layer.hidden ? <EyeOff /> : <Eye />}
                  </Button>
                  <Button variant="ghost" size="icon-xs" onClick={() => onPatch(layer.id, { locked: !layer.locked })} aria-label={layer.locked ? "Unlock layer" : "Lock layer"}>
                    {layer.locked ? <Lock /> : <LockOpen />}
                  </Button>
                  {selected ? (
                    <>
                      <Button variant="ghost" size="icon-xs" onClick={() => onMove(layer.id, 1)} aria-label="Bring forward"><ArrowUp /></Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => onMove(layer.id, -1)} aria-label="Send backward"><ArrowDown /></Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => onDuplicate(layer.id)} aria-label="Duplicate layer"><Copy /></Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => onRemove(layer.id)} aria-label="Delete layer"><Trash2 /></Button>
                    </>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
