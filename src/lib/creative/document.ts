import { z } from "zod"

/*
 * Creative design document: pages of absolutely positioned layers in the
 * format's native pixel space. Rendered with HTML/CSS in the editor and
 * exported to PNG in the browser. Images reference media assets by id; URLs
 * are resolved at load time (storage URLs are short-lived signed URLs).
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const DESIGN_FONTS = ["heading", "body", "serif", "display", "condensed"] as const
export type DesignFont = (typeof DESIGN_FONTS)[number]

export const DESIGN_FONT_LABELS: Record<DesignFont, string> = {
  heading: "Space Grotesk",
  body: "Inter",
  serif: "Fraunces",
  display: "Poppins",
  condensed: "Bebas Neue",
}

const baseLayer = {
  id: z.string(),
  name: z.string().max(80),
  x: z.number(),
  y: z.number(),
  width: z.number().min(1),
  height: z.number().min(1),
  rotation: z.number().min(-360).max(360),
  opacity: z.number().min(0).max(1),
  locked: z.boolean(),
  hidden: z.boolean(),
}

export const textLayerSchema = z.object({
  ...baseLayer,
  type: z.literal("text"),
  text: z.string().max(2000),
  font: z.enum(DESIGN_FONTS),
  fontSize: z.number().min(4).max(800),
  fontWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700), z.literal(800)]),
  color: hex,
  align: z.enum(["left", "center", "right"]),
  lineHeight: z.number().min(0.6).max(3),
  letterSpacing: z.number().min(-0.2).max(1),
  uppercase: z.boolean(),
  /** Optional highlight box behind the text (e.g. CTA buttons, price tags). */
  background: hex.nullable(),
  padding: z.number().min(0).max(200),
  radius: z.number().min(0).max(1000),
})

export const shapeLayerSchema = z.object({
  ...baseLayer,
  type: z.literal("shape"),
  shape: z.enum(["rect", "ellipse"]),
  fill: hex,
  radius: z.number().min(0).max(2000),
})

export const imageLayerSchema = z.object({
  ...baseLayer,
  type: z.literal("image"),
  assetId: z.string().nullable(),
  fit: z.enum(["cover", "contain"]),
  radius: z.number().min(0).max(2000),
})

export const layerSchema = z.discriminatedUnion("type", [textLayerSchema, shapeLayerSchema, imageLayerSchema])
export type Layer = z.infer<typeof layerSchema>
export type TextLayer = z.infer<typeof textLayerSchema>
export type ShapeLayer = z.infer<typeof shapeLayerSchema>
export type ImageLayer = z.infer<typeof imageLayerSchema>

export const backgroundSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("solid"), color: hex }),
  z.object({ type: z.literal("gradient"), from: hex, to: hex, angle: z.number().min(0).max(360) }),
  z.object({
    type: z.literal("image"),
    assetId: z.string(),
    fallback: hex,
    overlayColor: hex,
    overlayOpacity: z.number().min(0).max(1),
  }),
])
export type Background = z.infer<typeof backgroundSchema>

export const pageSchema = z.object({
  id: z.string(),
  background: backgroundSchema,
  layers: z.array(layerSchema).max(60),
})
export type DesignPage = z.infer<typeof pageSchema>

export const designDocumentSchema = z.object({
  version: z.literal(1),
  formatId: z.string(),
  width: z.number().int().min(50).max(4000),
  height: z.number().int().min(50).max(4000),
  pages: z.array(pageSchema).min(1).max(10),
})
export type DesignDocument = z.infer<typeof designDocumentSchema>

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

/** All media asset ids referenced by a document (for URL resolution). */
export function referencedAssetIds(document: DesignDocument): string[] {
  const ids = new Set<string>()
  for (const page of document.pages) {
    if (page.background.type === "image") ids.add(page.background.assetId)
    for (const layer of page.layers) {
      if (layer.type === "image" && layer.assetId) ids.add(layer.assetId)
    }
  }
  return [...ids]
}

/** Proportionally re-lays out a document for a different canvas size. */
export function resizeDocument(document: DesignDocument, formatId: string, width: number, height: number): DesignDocument {
  const sx = width / document.width
  const sy = height / document.height
  const s = Math.min(sx, sy)
  return {
    ...document,
    formatId,
    width,
    height,
    pages: document.pages.map((page) => ({
      ...page,
      layers: page.layers.map((layer) => {
        // Keep each layer's centre in the same relative place; scale size uniformly.
        const cx = (layer.x + layer.width / 2) * sx
        const cy = (layer.y + layer.height / 2) * sy
        const w = layer.type === "text" ? Math.min(width * 0.92, layer.width * sx) : layer.width * s
        const h = layer.type === "text" ? layer.height * s : layer.height * s
        const scaled = { ...layer, width: w, height: h, x: cx - w / 2, y: cy - h / 2 }
        if (scaled.type === "text") return { ...scaled, fontSize: Math.max(8, Math.round(scaled.fontSize * s)), padding: scaled.padding * s }
        return scaled
      }),
    })),
  }
}
