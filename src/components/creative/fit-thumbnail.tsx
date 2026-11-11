"use client"

import { useEffect, useRef, useState } from "react"

import { DesignThumbnail, type AssetUrls } from "@/components/creative/design-renderer"
import type { DesignDocument } from "@/lib/creative/document"

/** Thumbnail that fills its container's width (aspect ratio preserved). */
export function FitThumbnail({ document, assetUrls, pageIndex = 0 }: { document: DesignDocument; assetUrls: AssetUrls; pageIndex?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry?.contentRect.width ?? 0)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="w-full" style={{ aspectRatio: `${document.width} / ${document.height}` }}>
      {width > 0 ? <DesignThumbnail document={document} assetUrls={assetUrls} width={width} pageIndex={pageIndex} /> : null}
    </div>
  )
}
