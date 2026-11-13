"use client"

import { toJpeg } from "html-to-image"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"

import { DesignPageView } from "@/components/creative/design-renderer"
import type { CreativePreview } from "@/features/command-centre/actions"

/**
 * Renders the first page of a Creative Studio design at native size, off
 * screen, and returns it as a JPEG (Instagram's publishing API only accepts
 * JPEG). Uses the same renderer as the Studio editor, so the post matches what
 * the user sees there.
 */
export async function renderDesignJpeg(preview: CreativePreview): Promise<Blob> {
  const page = preview.document.pages[0]
  if (!page) throw new Error("The design has no pages")
  const host = document.createElement("div")
  host.setAttribute("aria-hidden", "true")
  Object.assign(host.style, { position: "fixed", left: "-100000px", top: "0", pointerEvents: "none" })
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    flushSync(() => {
      root.render(<DesignPageView document={preview.document} page={page} assetUrls={preview.assetUrls} exportId={page.id} />)
    })
    if ("fonts" in document) await document.fonts.ready
    const node = host.querySelector<HTMLElement>("[data-export-id]")
    if (!node) throw new Error("The design could not be rendered")
    const dataUrl = await toJpeg(node, {
      width: preview.document.width,
      height: preview.document.height,
      pixelRatio: 1,
      quality: 0.92,
      cacheBust: true,
      backgroundColor: "#FFFFFF",
    })
    return await (await fetch(dataUrl)).blob()
  } finally {
    root.unmount()
    host.remove()
  }
}
