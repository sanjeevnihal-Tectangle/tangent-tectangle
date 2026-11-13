import type { Background, DesignDocument, DesignFont, Layer } from "@/lib/creative/document"
import { contrastRatio, DEFAULT_DESIGN_STYLE, type DesignStyle } from "@/lib/creative/layout"

/**
 * Re-skins an existing design with another brand kit while keeping the user's
 * edits (positions, copy, images): brand colours are swapped role for role
 * (tints and shades of them follow), brand fonts, icon style and corners are
 * re-applied, and the logo is replaced.
 */

export interface BrandKitStyle {
  id: string
  name: string
  colors: { hex: string; role: string }[]
  logoAssetId: string | null
  style: DesignStyle
}

type Rgb = [number, number, number]
const HEX = /^#[0-9a-fA-F]{6}$/

const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
const toHex = (rgb: Rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase()
const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const luma = (hex: string) => {
  const [r, g, b] = toRgb(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Maps each colour of the old kit to the new kit's colour with the same role (or the closest in lightness). */
export function colorMapper(from: BrandKitStyle["colors"], to: BrandKitStyle["colors"]): (hex: string) => string {
  const target = to.filter((c) => HEX.test(c.hex))
  const source = from.filter((c) => HEX.test(c.hex))
  if (!target.length || !source.length) return (hex) => hex
  const pairs = source.map((c) => {
    const sameRole = target.find((t) => t.role === c.role)
    const nearest = [...target].sort((a, b) => Math.abs(luma(a.hex) - luma(c.hex)) - Math.abs(luma(b.hex) - luma(c.hex)))[0]!
    return { from: toRgb(c.hex), to: toRgb((sameRole ?? nearest).hex) }
  })
  const cache = new Map<string, string>()
  return (hex) => {
    if (!HEX.test(hex)) return hex
    const key = hex.toUpperCase()
    const cached = cache.get(key)
    if (cached) return cached
    const rgb = toRgb(key)
    const closest = pairs.reduce((best, p) => (distance(p.from, rgb) < distance(best.from, rgb) ? p : best))
    const gap = distance(closest.from, rgb)
    // Exact brand colours swap; tints/shades of them keep their offset; unrelated colours (white, black) stay.
    const mapped =
      gap === 0
        ? toHex(closest.to)
        : gap < 110
          ? toHex([0, 1, 2].map((i) => closest.to[i]! + (rgb[i]! - closest.from[i]!)) as Rgb)
          : key
    cache.set(key, mapped)
    return mapped
  }
}

function readable(background: string, preferred: string): string {
  if (contrastRatio(background, preferred) >= 3) return preferred
  return contrastRatio(background, "#FFFFFF") >= contrastRatio(background, "#111111") ? "#FFFFFF" : "#111111"
}

function mapBackground(background: Background, map: (hex: string) => string): Background {
  switch (background.type) {
    case "solid":
      return { ...background, color: map(background.color) }
    case "gradient":
      return { ...background, from: map(background.from), to: map(background.to) }
    case "image":
      return { ...background, fallback: map(background.fallback), overlayColor: map(background.overlayColor) }
  }
}

function fontFor(font: DesignFont, weight: number, from: DesignStyle, to: DesignStyle): DesignFont {
  const heading = font === from.headingFont && (from.headingFont !== from.bodyFont || weight >= 700)
  if (heading) return to.headingFont
  if (font === from.bodyFont) return to.bodyFont
  return font
}

export function applyBrandKit(document: DesignDocument, from: BrandKitStyle | null, to: BrandKitStyle): DesignDocument {
  const fromStyle = from?.style ?? DEFAULT_DESIGN_STYLE
  const toStyle = to.style
  const map = colorMapper(from?.colors ?? [], to.colors)
  const unit = Math.min(document.width, document.height)
  const softRadius = Math.round(unit * 0.02)
  const corner = (r: number) => (toStyle.cornerStyle === "sharp" ? 0 : toStyle.cornerStyle === "pill" ? Math.max(r, unit) : r === 0 || r >= unit ? softRadius : r)

  return {
    ...document,
    pages: document.pages.map((page) => {
      const background = mapBackground(page.background, map)
      const pageColor = background.type === "solid" ? background.color : background.type === "gradient" ? background.from : null
      const layers = page.layers.map((layer): Layer => {
        switch (layer.type) {
          case "text": {
            const fill = layer.background ? map(layer.background) : null
            const behind = fill ?? pageColor
            const color = map(layer.color)
            return {
              ...layer,
              font: fontFor(layer.font, layer.fontWeight, fromStyle, toStyle),
              color: behind ? readable(behind, color) : color,
              background: fill,
              radius: fill ? corner(layer.radius) : layer.radius,
            }
          }
          case "shape":
            return { ...layer, fill: map(layer.fill) }
          case "icon":
            return {
              ...layer,
              color: map(layer.color),
              background: layer.background ? map(layer.background) : null,
              variant: toStyle.iconVariant,
              radius: toStyle.cornerStyle === "pill" ? layer.width : toStyle.cornerStyle === "sharp" ? 0 : layer.radius,
            }
          case "pattern":
            return { ...layer, color: map(layer.color) }
          case "image":
            if (layer.name === "Logo") {
              return to.logoAssetId ? { ...layer, assetId: to.logoAssetId, hidden: false } : { ...layer, hidden: true }
            }
            return layer.radius > 0 ? { ...layer, radius: toStyle.cornerStyle === "sharp" ? 0 : layer.radius } : layer
        }
      })
      return { ...page, background, layers }
    }),
  }
}
