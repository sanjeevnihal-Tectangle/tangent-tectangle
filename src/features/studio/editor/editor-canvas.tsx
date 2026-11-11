"use client"

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

import { DesignPageView, type AssetUrls } from "@/components/creative/design-renderer"
import type { DesignDocument, Layer } from "@/lib/creative/document"
import { cn } from "@/lib/utils"

type Gesture =
  | { kind: "move"; layerId: string; startX: number; startY: number; originX: number; originY: number }
  | { kind: "resize"; layerId: string; startX: number; startY: number; originW: number; originH: number }

const SNAP_PX = 6

export function EditorCanvas({
  document,
  pageIndex,
  assetUrls,
  selectedId,
  zoom,
  onSelect,
  onGestureStart,
  onGestureChange,
  onGestureEnd,
  onEditText,
}: {
  document: DesignDocument
  pageIndex: number
  assetUrls: AssetUrls
  selectedId: string | null
  /** null = fit to the available space */
  zoom: number | null
  onSelect: (layerId: string | null) => void
  onGestureStart: () => void
  onGestureChange: (layerId: string, patch: Partial<Layer>) => void
  onGestureEnd: () => void
  onEditText: () => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [fitScale, setFitScale] = useState(0.4)
  const gesture = useRef<Gesture | null>(null)
  const [guides, setGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false })
  const page = document.pages[pageIndex]!

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      setFitScale(Math.max(0.05, Math.min((width - 48) / document.width, (height - 48) / document.height)))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [document.width, document.height])

  const scale = zoom ?? fitScale

  const begin = (event: ReactPointerEvent, layer: Layer, kind: Gesture["kind"]) => {
    event.stopPropagation()
    onSelect(layer.id)
    if (layer.locked) return
    try {
      ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
    } catch {
      // Capture is best-effort; moves still reach the canvas container.
    }
    onGestureStart()
    gesture.current =
      kind === "move"
        ? { kind, layerId: layer.id, startX: event.clientX, startY: event.clientY, originX: layer.x, originY: layer.y }
        : { kind, layerId: layer.id, startX: event.clientX, startY: event.clientY, originW: layer.width, originH: layer.height }
  }

  const move = (event: ReactPointerEvent) => {
    const g = gesture.current
    if (!g) return
    const dx = (event.clientX - g.startX) / scale
    const dy = (event.clientY - g.startY) / scale
    if (g.kind === "move") {
      const layer = page.layers.find((l) => l.id === g.layerId)
      if (!layer) return
      let x = g.originX + dx
      let y = g.originY + dy
      const snap = SNAP_PX / scale
      const snapX = Math.abs(x + layer.width / 2 - document.width / 2) < snap
      const snapY = Math.abs(y + layer.height / 2 - document.height / 2) < snap
      if (snapX) x = document.width / 2 - layer.width / 2
      if (snapY) y = document.height / 2 - layer.height / 2
      setGuides({ x: snapX, y: snapY })
      onGestureChange(g.layerId, { x: Math.round(x), y: Math.round(y) })
    } else {
      onGestureChange(g.layerId, { width: Math.max(8, Math.round(g.originW + dx)), height: Math.max(8, Math.round(g.originH + dy)) })
    }
  }

  const end = () => {
    if (!gesture.current) return
    gesture.current = null
    setGuides({ x: false, y: false })
    onGestureEnd()
  }

  return (
    <div ref={viewportRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/40 [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:16px_16px]">
      <div
        className="relative shrink-0 shadow-[0_1px_3px_rgb(0_0_0/0.12),0_8px_24px_rgb(0_0_0/0.08)]"
        style={{ width: document.width * scale, height: document.height * scale }}
        onPointerDown={() => onSelect(null)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }}>
          <DesignPageView document={document} page={page} assetUrls={assetUrls} />
        </div>

        {guides.x ? <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-brand" /> : null}
        {guides.y ? <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-brand" /> : null}

        {page.layers.map((layer) =>
          layer.hidden ? null : (
            <div
              key={layer.id}
              role="button"
              tabIndex={-1}
              aria-label={`Select ${layer.name}`}
              onPointerDown={(e) => begin(e, layer, "move")}
              onDoubleClick={() => layer.type === "text" && onEditText()}
              className={cn(
                "absolute outline-offset-0",
                layer.locked ? "cursor-default" : "cursor-move",
                selectedId === layer.id ? "outline-2 outline-brand" : "hover:outline-1 hover:outline-brand/50"
              )}
              style={{
                left: layer.x * scale,
                top: layer.y * scale,
                width: layer.width * scale,
                height: layer.height * scale,
                transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
              }}
            >
              {selectedId === layer.id && !layer.locked ? (
                <span
                  role="presentation"
                  onPointerDown={(e) => begin(e, layer, "resize")}
                  className="absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-sm border-2 border-brand bg-background"
                />
              ) : null}
            </div>
          )
        )}
      </div>
    </div>
  )
}
