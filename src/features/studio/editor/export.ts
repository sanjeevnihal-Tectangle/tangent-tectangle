"use client"

import { toBlob } from "html-to-image"

/** Renders each `[data-export-id]` node inside `stage` to a PNG blob at native size. */
export async function exportStagePages(stage: HTMLElement, width: number, height: number): Promise<Blob[]> {
  const nodes = Array.from(stage.querySelectorAll<HTMLElement>("[data-export-id]"))
  if (typeof document !== "undefined" && "fonts" in document) await document.fonts.ready
  const blobs: Blob[] = []
  for (const node of nodes) {
    const blob = await toBlob(node, { width, height, pixelRatio: 1, cacheBust: true })
    if (!blob) throw new Error("Export produced an empty image")
    blobs.push(blob)
  }
  return blobs
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "design"
  )
}
