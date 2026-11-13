import { z } from "zod"

import { DESIGN_ICONS } from "@/lib/creative/icons"
import {
  newId,
  PATTERN_KINDS,
  type Background,
  type DesignDocument,
  type DesignPage,
  type DesignFont,
  type IconLayer,
  type ImageLayer,
  type Layer,
  type PatternLayer,
  type ShapeLayer,
  type TextLayer,
} from "@/lib/creative/document"
import type { CreativeFormat } from "@/lib/creative/formats"

export const DESIGN_LAYOUTS = [
  "centered_hero",
  "bottom_band",
  "split",
  "top_headline",
  "bold_type",
  "corner_minimal",
  "feature_list",
  "showcase",
] as const
export type DesignLayout = (typeof DESIGN_LAYOUTS)[number]

export const LAYOUT_LABELS: Record<DesignLayout, string> = {
  centered_hero: "Centred hero",
  bottom_band: "Bottom band",
  split: "Split",
  top_headline: "Top headline",
  bold_type: "Bold type",
  corner_minimal: "Minimal",
  feature_list: "Features with icons",
  showcase: "Product showcase",
}

export const DESIGN_DECORATIONS = ["none", "blobs", "circles", "lines", "frame"] as const
export const IMAGE_TREATMENTS = ["full_bleed", "framed", "none"] as const

/**
 * What the AI (or a template) decides: copy, layout, palette and background.
 * Geometry is computed deterministically from this, so designs are always well-formed.
 * All fields are required so the schema works as a strict structured output.
 */
export const designSpecSchema = z.object({
  layout: z.enum(DESIGN_LAYOUTS),
  headline: z.string().describe("Max ~8 words"),
  subheadline: z.string().describe("Max ~16 words, or empty"),
  callToAction: z.string().describe("2-4 words, or empty"),
  badge: z.string().describe("Very short tag such as 'NEW' or '20% OFF', or empty"),
  palette: z.object({
    background: z.string().describe("Hex colour from the brand palette, e.g. #FAF6EF"),
    text: z.string().describe("Hex colour with strong contrast against background"),
    accent: z.string().describe("Hex colour from the brand palette for CTA and highlights"),
  }),
  backgroundStyle: z.enum(["solid", "gradient", "image", "pattern"]),
  imagePrompt: z.string().describe("Generation-ready prompt for a background photo; no text in the image"),
  slides: z
    .array(z.object({ headline: z.string(), body: z.string() }))
    .describe("Carousel slides after the cover (3-6 for carousels, empty otherwise)"),
  features: z
    .array(z.object({ icon: z.enum(DESIGN_ICONS), label: z.string().describe("2-5 words") }))
    .describe("0-4 benefit or feature callouts, each with a fitting icon; empty when the design doesn't need them"),
  pattern: z.enum([...PATTERN_KINDS, "none"]).describe("Subtle background pattern from the brand's patterns, or none"),
  decoration: z.enum(DESIGN_DECORATIONS).describe("Graphic accents around the edges: organic blobs, circles, line accents, an inset frame, or none"),
  imageTreatment: z.enum(IMAGE_TREATMENTS).describe("full_bleed = photo fills the background; framed = image in a rounded card; none = no image"),
})
export type DesignSpec = z.infer<typeof designSpecSchema>

/** Lenient variant for specs saved before features/patterns/decorations existed. */
export const storedDesignSpecSchema = designSpecSchema.extend({
  backgroundStyle: z.enum(["solid", "gradient", "image", "pattern"]),
  features: designSpecSchema.shape.features.default([]),
  pattern: designSpecSchema.shape.pattern.default("none"),
  decoration: designSpecSchema.shape.decoration.default("none"),
  imageTreatment: designSpecSchema.shape.imageTreatment.default("full_bleed"),
})

/** Spec fields added for graphic designs; templates and blanks may leave them out. */
export const SPEC_GRAPHIC_DEFAULTS: Pick<DesignSpec, "features" | "pattern" | "decoration" | "imageTreatment"> = {
  features: [],
  pattern: "none",
  decoration: "none",
  imageTreatment: "full_bleed",
}

export interface DesignStyle {
  headingFont: DesignFont
  bodyFont: DesignFont
  iconVariant: IconLayer["variant"]
  cornerStyle: "rounded" | "sharp" | "pill"
}

export const DEFAULT_DESIGN_STYLE: DesignStyle = { headingFont: "heading", bodyFont: "body", iconVariant: "outline", cornerStyle: "rounded" }

export interface ComposeContext {
  format: CreativeFormat
  brandColors: { hex: string; role: string }[]
  businessName: string
  logoAssetId: string | null
  /** Background/hero photo to use when the spec asks for an image. */
  imageAssetId: string | null
  /** Brand visual style (fonts, icons, corners); defaults when absent. */
  style?: DesignStyle
}

const HEX = /^#[0-9a-fA-F]{6}$/

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

function readableOn(background: string, preferred: string): string {
  if (contrastRatio(background, preferred) >= 4.5) return preferred
  return contrastRatio(background, "#FFFFFF") >= contrastRatio(background, "#111111") ? "#FFFFFF" : "#111111"
}

function shade(hex: string, amount: number): string {
  const n = (i: number) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 + amount))))
  return `#${[n(1), n(3), n(5)].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase()
}

/** Validates AI palette choices against hex format and contrast; falls back to brand colours. */
export function resolvePalette(spec: DesignSpec["palette"], brandColors: ComposeContext["brandColors"]) {
  const byRole = (role: string) => brandColors.find((c) => c.role === role)?.hex
  const background = HEX.test(spec.background) ? spec.background.toUpperCase() : byRole("background") ?? byRole("neutral") ?? "#FAFAF9"
  const accentCandidate = HEX.test(spec.accent) ? spec.accent.toUpperCase() : byRole("primary") ?? byRole("accent") ?? "#E4572E"
  const accent = contrastRatio(background, accentCandidate) < 1.6 ? shade(accentCandidate, -0.35) : accentCandidate
  const text = readableOn(background, HEX.test(spec.text) ? spec.text.toUpperCase() : "#111111")
  const secondaryCandidate = byRole("secondary") ?? shade(accent, luminance(accent) > 0.4 ? -0.3 : 0.45)
  const secondary = contrastRatio(background, secondaryCandidate) < 1.3 ? shade(secondaryCandidate, -0.3) : secondaryCandidate
  return { background, text, accent, onAccent: readableOn(accent, "#FFFFFF"), secondary, soft: mix(accent, background, 0.82) }
}

function mix(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16)
  const v = (i: number) => Math.round(ch(a, i) * (1 - t) + ch(b, i) * t)
  return `#${[v(1), v(3), v(5)].map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase()
}

function base(name: string, x: number, y: number, width: number, height: number) {
  return { id: newId("layer"), name, x, y, width, height, rotation: 0, opacity: 1, locked: false, hidden: false }
}

/** Average glyph width per font, as a fraction of the font size (bold and uppercase run wider). */
const GLYPH_WIDTH: Record<DesignFont, number> = { heading: 0.56, body: 0.54, serif: 0.55, display: 0.62, condensed: 0.42 }

/** Brand style for the document being composed (composeDocument is synchronous). */
let activeStyle: DesignStyle | null = null

function brandFont(font: DesignFont): DesignFont {
  const style = activeStyle ?? DEFAULT_DESIGN_STYLE
  return font === "heading" ? style.headingFont : font === "body" ? style.bodyFont : font
}

function estimateTextHeight(text: string, fontSize: number, width: number, lineHeight: number, padding: number, glyph = 0.54): number {
  const charsPerLine = Math.max(1, Math.floor((width - padding * 2) / (fontSize * glyph * 1.06)))
  const lines = text.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
  return Math.ceil(lines * fontSize * lineHeight + padding * 2)
}

function text(
  name: string,
  value: string,
  opts: Partial<Omit<TextLayer, "type" | "text">> & { x: number; y: number; width: number; fontSize: number; color: string }
): TextLayer {
  const lineHeight = opts.lineHeight ?? 1.15
  const padding = opts.padding ?? 0
  const font = brandFont(opts.font ?? "heading")
  const glyph = GLYPH_WIDTH[font] * ((opts.fontWeight ?? 700) >= 700 ? 1.05 : 1) * (opts.uppercase ? 1.12 : 1)
  const height = opts.height ?? estimateTextHeight(value, opts.fontSize, opts.width, lineHeight, padding, glyph)
  return {
    ...base(name, opts.x, opts.y, opts.width, height),
    type: "text",
    text: value,
    font,
    fontSize: opts.fontSize,
    fontWeight: opts.fontWeight ?? 700,
    color: opts.color,
    align: opts.align ?? "left",
    lineHeight,
    letterSpacing: opts.letterSpacing ?? 0,
    uppercase: opts.uppercase ?? false,
    background: opts.background ?? null,
    padding,
    radius: opts.radius ?? 0,
  }
}

function shape(name: string, x: number, y: number, width: number, height: number, fill: string, extra: Partial<ShapeLayer> = {}): ShapeLayer {
  return { ...base(name, x, y, width, height), type: "shape", shape: "rect", fill, radius: 0, ...extra }
}

function image(name: string, assetId: string, x: number, y: number, width: number, height: number, extra: Partial<ImageLayer> = {}): ImageLayer {
  return { ...base(name, x, y, width, height), type: "image", assetId, fit: "cover", radius: 0, ...extra }
}


function icon(name: string, glyph: DesignSpec["features"][number]["icon"], x: number, y: number, size: number, color: string, chip: string | null, variant: IconLayer["variant"]): IconLayer {
  return {
    ...base(name, x, y, size, size),
    type: "icon",
    icon: glyph,
    color,
    variant,
    strokeWidth: 2,
    background: chip,
    padding: chip ? Math.round(size * 0.24) : 0,
    radius: Math.round(size * 0.3),
  }
}

function pattern(kind: PatternLayer["pattern"], x: number, y: number, width: number, height: number, color: string, opacity: number, scale: number): PatternLayer {
  return { ...base("Pattern", x, y, width, height), type: "pattern", pattern: kind, color, scale, radius: 0, opacity }
}

/** Edge accents drawn behind the content (never over the text column). */
function decorations(spec: DesignSpec, W: number, H: number, palette: ReturnType<typeof resolvePalette>, onImage: boolean): Layer[] {
  const unit = Math.min(W, H)
  if (W / H > 2.2) return []
  switch (onImage ? (spec.decoration === "lines" || spec.decoration === "frame" ? spec.decoration : "none") : spec.decoration) {
    case "blobs":
      return [
        { ...shape("Blob", W - unit * 0.34, -unit * 0.16, unit * 0.52, unit * 0.48, palette.accent, { shape: "blob" }), opacity: 0.16 },
        { ...shape("Blob", -unit * 0.18, H - unit * 0.3, unit * 0.46, unit * 0.42, palette.secondary, { shape: "blob" }), opacity: 0.14 },
      ]
    case "circles":
      return [
        { ...shape("Circle", W - unit * 0.26, -unit * 0.12, unit * 0.4, unit * 0.4, palette.accent, { shape: "ellipse" }), opacity: 0.14 },
        { ...shape("Circle", W - unit * 0.12, unit * 0.16, unit * 0.16, unit * 0.16, palette.secondary, { shape: "ellipse" }), opacity: 0.2 },
        { ...shape("Circle", -unit * 0.1, H - unit * 0.18, unit * 0.26, unit * 0.26, palette.accent, { shape: "ellipse" }), opacity: 0.12 },
      ]
    case "lines": {
      const t = Math.max(3, Math.round(unit * 0.008))
      return [
        shape("Accent line", unit * 0.07, unit * 0.045, unit * 0.12, t, palette.accent),
        shape("Accent line", W - unit * 0.07 - unit * 0.2, H - unit * 0.035, unit * 0.2, t, palette.accent),
      ]
    }
    case "frame": {
      const t = Math.max(3, Math.round(unit * 0.007))
      const i = Math.round(unit * 0.03)
      const c = onImage ? "#FFFFFF" : palette.accent
      return [
        shape("Frame", i, i, W - i * 2, t, c),
        shape("Frame", i, H - i - t, W - i * 2, t, c),
        shape("Frame", i, i, t, H - i * 2, c),
        shape("Frame", W - i - t, i, t, H - i * 2, c),
      ]
    }
    case "none":
      return []
    default: {
      const unreachable: never = spec.decoration as never
      return unreachable
    }
  }
}

/** Applies the brand's fonts and corner style to the generated layers. */
function applyStyle(layers: Layer[], style: DesignStyle, unit: number): Layer[] {
  const corner = (r: number) => (style.cornerStyle === "sharp" ? 0 : style.cornerStyle === "pill" ? Math.max(r, unit) : r)
  return layers.map((layer) => {
    if (layer.type === "text") return { ...layer, radius: layer.background ? corner(layer.radius) : layer.radius }
    if (layer.type === "icon") return { ...layer, variant: style.iconVariant, radius: style.cornerStyle === "pill" ? layer.width : style.cornerStyle === "sharp" ? 0 : layer.radius }
    if (layer.type === "image" && layer.name !== "Logo" && layer.radius > 0) return { ...layer, radius: style.cornerStyle === "sharp" ? 0 : layer.radius }
    return layer
  })
}

function backgroundFor(spec: DesignSpec, palette: ReturnType<typeof resolvePalette>, imageAssetId: string | null): Background {
  // Layouts without an image card show a "framed" image full-bleed rather than dropping it.
  const framedInLayout = spec.imageTreatment === "framed" && (spec.layout === "feature_list" || spec.layout === "showcase")
  const wantsImage = spec.backgroundStyle === "image" || (spec.imageTreatment === "framed" && !framedInLayout && spec.layout !== "split")
  if (wantsImage && imageAssetId && spec.imageTreatment !== "none" && !framedInLayout) {
    return { type: "image", assetId: imageAssetId, fallback: palette.background, overlayColor: "#000000", overlayOpacity: 0.35 }
  }
  if (spec.backgroundStyle === "gradient") {
    return { type: "gradient", from: palette.background, to: shade(palette.background, luminance(palette.background) > 0.5 ? -0.12 : 0.25), angle: 160 }
  }
  return { type: "solid", color: palette.background }
}

/** Builds the cover page for a layout in the format's pixel space. */
function coverLayers(spec: DesignSpec, ctx: ComposeContext, palette: ReturnType<typeof resolvePalette>, onImage: boolean): Layer[] {
  const { width: W, height: H } = ctx.format
  const unit = Math.min(W, H)
  const wide = W / H > 2.2
  const m = Math.round(unit * (wide ? 0.12 : 0.07))
  const ink = onImage ? "#FFFFFF" : palette.text
  const style = ctx.style ?? DEFAULT_DESIGN_STYLE
  const layers: Layer[] = []

  const headlineSize = Math.round(unit * (wide ? 0.32 : W / H > 1.2 ? 0.1 : 0.09))
  const subSize = Math.round(headlineSize * 0.42)
  const ctaSize = Math.round(Math.max(subSize * 0.9, unit * 0.032))

  const cta = (x: number, y: number, align: "left" | "center" = "left") =>
    spec.callToAction
      ? text("Call to action", spec.callToAction, {
          x,
          y,
          width: Math.min(W - m * 2, ctaSize * (spec.callToAction.length * 0.62 + 3)),
          fontSize: ctaSize,
          color: palette.onAccent,
          background: palette.accent,
          padding: Math.round(ctaSize * 0.7),
          radius: Math.round(ctaSize * 0.5),
          fontWeight: 600,
          font: "body",
          align: "center",
          lineHeight: 1.1,
          ...(align === "center" ? { x: W / 2 - Math.min(W - m * 2, ctaSize * (spec.callToAction.length * 0.62 + 3)) / 2 } : {}),
        })
      : null

  const badge = (x: number, y: number) =>
    spec.badge
      ? text("Badge", spec.badge, {
          x,
          y,
          width: Math.round(subSize * (spec.badge.length * 0.62 + 2.4)),
          fontSize: Math.round(subSize * 0.75),
          color: palette.onAccent,
          background: palette.accent,
          padding: Math.round(subSize * 0.4),
          radius: 999,
          uppercase: true,
          letterSpacing: 0.08,
          font: "body",
          align: "center",
          fontWeight: 700,
        })
      : null

  if (wide) {
    // Strip banners (leaderboards, website heroes): headline left, CTA right.
    const headline = text("Headline", spec.headline, { x: m, y: H * 0.18, width: W * 0.58, fontSize: Math.round(H * 0.24), color: ink })
    headline.y = (H - headline.height) / 2
    layers.push(headline)
    const button = cta(W - m - Math.min(W * 0.28, ctaSize * 1.6 * (spec.callToAction.length * 0.62 + 3)), H / 2)
    if (button) {
      button.fontSize = Math.round(H * 0.13)
      button.padding = Math.round(H * 0.08)
      button.width = Math.min(W * 0.28, button.fontSize * (spec.callToAction.length * 0.62 + 3))
      button.height = Math.round(button.fontSize * 1.1 + button.padding * 2)
      button.x = W - m - button.width
      button.y = (H - button.height) / 2
      layers.push(button)
    }
    return layers
  }

  switch (spec.layout) {
    case "centered_hero": {
      let y = H * 0.3
      const b = badge(0, H * 0.18)
      if (b) {
        b.x = (W - b.width) / 2
        layers.push(b)
      }
      const headline = text("Headline", spec.headline, { x: m, y, width: W - m * 2, fontSize: headlineSize, color: ink, align: "center" })
      layers.push(headline)
      y += headline.height + unit * 0.03
      if (spec.subheadline) {
        const sub = text("Subheadline", spec.subheadline, { x: m * 1.5, y, width: W - m * 3, fontSize: subSize, color: ink, align: "center", font: "body", fontWeight: 400, lineHeight: 1.35 })
        layers.push(sub)
        y += sub.height + unit * 0.05
      }
      const button = cta(0, Math.max(y, H * 0.68), "center")
      if (button) layers.push(button)
      break
    }
    case "bottom_band": {
      const bandH = H * 0.36
      layers.push(shape("Band", 0, H - bandH, W, bandH, palette.accent))
      const b = badge(m, m)
      if (b) layers.push(b)
      const headline = text("Headline", spec.headline, { x: m, y: H - bandH + m * 0.8, width: W - m * 2, fontSize: Math.round(headlineSize * 0.85), color: palette.onAccent })
      layers.push(headline)
      if (spec.subheadline) {
        layers.push(text("Subheadline", spec.subheadline, { x: m, y: headline.y + headline.height + unit * 0.02, width: W * 0.62, fontSize: subSize, color: palette.onAccent, font: "body", fontWeight: 400, lineHeight: 1.35 }))
      }
      if (spec.callToAction) {
        const button = text("Call to action", spec.callToAction, {
          x: 0,
          y: H - m - ctaSize * 2.6,
          width: ctaSize * (spec.callToAction.length * 0.62 + 3),
          fontSize: ctaSize,
          color: palette.accent,
          background: palette.onAccent,
          padding: Math.round(ctaSize * 0.7),
          radius: Math.round(ctaSize * 0.5),
          font: "body",
          fontWeight: 600,
          align: "center",
          lineHeight: 1.1,
        })
        button.x = W - m - button.width
        layers.push(button)
      }
      break
    }
    case "split": {
      const landscape = W >= H
      const panel = landscape ? { x: 0, y: 0, w: W * 0.5, h: H } : { x: 0, y: H * 0.5, w: W, h: H * 0.5 }
      const media = landscape ? { x: W * 0.5, y: 0, w: W * 0.5, h: H } : { x: 0, y: 0, w: W, h: H * 0.5 }
      layers.push(
        ctx.imageAssetId
          ? image("Photo", ctx.imageAssetId, media.x, media.y, media.w, media.h)
          : shape("Accent block", media.x, media.y, media.w, media.h, palette.accent)
      )
      layers.push(shape("Text panel", panel.x, panel.y, panel.w, panel.h, palette.background))
      const tx = panel.x + m
      let y = panel.y + m * 1.2
      const b = badge(tx, y)
      if (b) {
        layers.push(b)
        y += b.height + unit * 0.03
      }
      const headline = text("Headline", spec.headline, { x: tx, y, width: panel.w - m * 2, fontSize: Math.round(headlineSize * 0.9), color: palette.text })
      layers.push(headline)
      y += headline.height + unit * 0.025
      if (spec.subheadline) {
        const sub = text("Subheadline", spec.subheadline, { x: tx, y, width: panel.w - m * 2, fontSize: subSize, color: palette.text, font: "body", fontWeight: 400, lineHeight: 1.35 })
        layers.push(sub)
        y += sub.height + unit * 0.04
      }
      const panelBottom = panel.y + panel.h - m - ctaSize * 2.6
      const chip = Math.round(unit * 0.06)
      for (const f of spec.features.slice(0, 3)) {
        if (y + chip > panelBottom - unit * 0.03) break
        layers.push(icon("Feature icon", f.icon, tx, y, chip, palette.accent, palette.soft, style.iconVariant))
        const label = text("Feature", f.label, { x: tx + chip + unit * 0.02, y, width: panel.w - m * 2 - chip - unit * 0.02, fontSize: Math.round(subSize * 0.8), color: palette.text, font: "body", fontWeight: 600, lineHeight: 1.2 })
        label.y = y + (chip - label.height) / 2
        layers.push(label)
        y += chip + unit * 0.02
      }
      const button = cta(tx, Math.min(y + unit * 0.02, panelBottom))
      if (button) layers.push(button)
      break
    }
    case "top_headline": {
      let y = m * 1.4
      const b = badge(m, y)
      if (b) {
        layers.push(b)
        y += b.height + unit * 0.035
      }
      const headline = text("Headline", spec.headline, { x: m, y, width: W - m * 2, fontSize: Math.round(headlineSize * 1.1), color: ink, lineHeight: 1.05 })
      layers.push(headline)
      y += headline.height + unit * 0.03
      if (spec.subheadline) {
        layers.push(text("Subheadline", spec.subheadline, { x: m, y, width: W * 0.7, fontSize: subSize, color: ink, font: "body", fontWeight: 400, lineHeight: 1.35 }))
      }
      if (!onImage) layers.push({ ...shape("Circle", W * 0.62, H - W * 0.3, W * 0.55, W * 0.55, palette.accent), shape: "ellipse", opacity: 0.9 })
      const button = cta(m, H - m - ctaSize * 2.6)
      if (button) layers.push(button)
      break
    }
    case "bold_type": {
      const headline = text("Headline", spec.headline, {
        x: m,
        y: H * 0.22,
        width: W - m * 2,
        fontSize: Math.round(headlineSize * 1.6),
        color: ink,
        font: "condensed",
        fontWeight: 400,
        uppercase: true,
        lineHeight: 0.95,
        letterSpacing: 0.01,
      })
      layers.push(shape("Accent bar", m, H * 0.22 - unit * 0.05, unit * 0.14, unit * 0.022, palette.accent))
      layers.push(headline)
      let y = headline.y + headline.height + unit * 0.035
      if (spec.subheadline) {
        const sub = text("Subheadline", spec.subheadline, { x: m, y, width: W * 0.75, fontSize: subSize, color: ink, font: "body", fontWeight: 500, lineHeight: 1.35 })
        layers.push(sub)
        y += sub.height + unit * 0.04
      }
      const button = cta(m, Math.min(y, H - m - ctaSize * 2.6))
      if (button) layers.push(button)
      break
    }
    case "corner_minimal": {
      const b = badge(0, m)
      if (b) {
        b.x = W - m - b.width
        layers.push(b)
      }
      const headline = text("Headline", spec.headline, { x: m, y: 0, width: W * 0.78, fontSize: Math.round(headlineSize * 0.8), color: ink, font: "serif", fontWeight: 600, lineHeight: 1.1 })
      const sub = spec.subheadline
        ? text("Subheadline", spec.subheadline, { x: m, y: 0, width: W * 0.7, fontSize: Math.round(subSize * 0.9), color: ink, font: "body", fontWeight: 400, lineHeight: 1.35 })
        : null
      const blockHeight = headline.height + (sub ? sub.height + unit * 0.025 : 0)
      headline.y = H - m * 1.6 - blockHeight
      layers.push(shape("Rule", m, headline.y - unit * 0.04, unit * 0.1, Math.max(2, unit * 0.006), palette.accent))
      layers.push(headline)
      if (sub) {
        sub.y = headline.y + headline.height + unit * 0.025
        layers.push(sub)
      }
      break
    }
    case "feature_list": {
      let y = m * 1.1
      const b = badge(m, y)
      if (b) {
        layers.push(b)
        y += b.height + unit * 0.03
      }
      const headline = text("Headline", spec.headline, { x: m, y, width: W - m * 2, fontSize: Math.round(headlineSize * 0.85), color: ink, lineHeight: 1.08 })
      layers.push(headline)
      y += headline.height + unit * 0.025
      if (spec.subheadline) {
        const sub = text("Subheadline", spec.subheadline, { x: m, y, width: W * 0.78, fontSize: Math.round(subSize * 0.9), color: ink, font: "body", fontWeight: 400, lineHeight: 1.35 })
        layers.push(sub)
        y += sub.height + unit * 0.045
      }
      const framed = Boolean(ctx.imageAssetId) && spec.imageTreatment !== "none"
      const colW = framed ? W * 0.5 - m : W - m * 2
      const items = spec.features.slice(0, 4)
      const chip = Math.round(unit * 0.085)
      const ctaTop = H - m - ctaSize * 2.6
      const rowH = Math.min(chip + unit * 0.035, (ctaTop - unit * 0.04 - y) / Math.max(1, items.length))
      items.forEach((f, i) => {
        const ry = y + i * rowH
        layers.push(icon("Feature icon", f.icon, m, ry, Math.min(chip, rowH - unit * 0.01), palette.accent, palette.soft, style.iconVariant))
        const label = text("Feature", f.label, { x: m + chip + unit * 0.03, y: ry, width: colW - chip - unit * 0.03, fontSize: Math.round(subSize * 0.95), color: ink, font: "body", fontWeight: 600, lineHeight: 1.2 })
        label.y = ry + (Math.min(chip, rowH) - label.height) / 2
        layers.push(label)
      })
      if (framed && ctx.imageAssetId) {
        const fx = W * 0.54
        const fh = Math.max(unit * 0.3, ctaTop - y - unit * 0.02)
        layers.push({ ...shape("Image backdrop", fx + unit * 0.025, y + unit * 0.025, W - m - fx, fh, palette.accent), radius: Math.round(unit * 0.04), opacity: 0.9 })
        layers.push(image("Photo", ctx.imageAssetId, fx, y, W - m - fx, fh, { radius: Math.round(unit * 0.04) }))
      }
      const button = cta(m, ctaTop)
      if (button) layers.push(button)
      break
    }
    case "showcase": {
      const hasImage = Boolean(ctx.imageAssetId) && spec.imageTreatment !== "none"
      let y = m
      if (hasImage && ctx.imageAssetId) {
        const fw = W * (H > W ? 0.8 : 0.72)
        const fh = H * (H > W ? 0.46 : 0.5)
        const fx = (W - fw) / 2
        layers.push({ ...shape("Image backdrop", fx + unit * 0.03, y + unit * 0.03, fw, fh, palette.accent), radius: Math.round(unit * 0.045) })
        layers.push(image("Photo", ctx.imageAssetId, fx, y, fw, fh, { radius: Math.round(unit * 0.045) }))
        const b = badge(0, y + fh - unit * 0.05)
        if (b) {
          b.x = fx + fw - b.width + unit * 0.02
          layers.push(b)
        }
        y += fh + unit * 0.06
      } else {
        const b = badge(0, y)
        if (b) {
          b.x = (W - b.width) / 2
          layers.push(b)
          y += b.height + unit * 0.05
        }
        y = Math.max(y, H * 0.24)
      }
      const headline = text("Headline", spec.headline, { x: m, y, width: W - m * 2, fontSize: Math.round(headlineSize * (hasImage ? 0.75 : 1)), color: ink, align: "center", lineHeight: 1.08 })
      layers.push(headline)
      y += headline.height + unit * 0.02
      if (spec.subheadline) {
        const sub = text("Subheadline", spec.subheadline, { x: m * 1.4, y, width: W - m * 2.8, fontSize: Math.round(subSize * 0.88), color: ink, align: "center", font: "body", fontWeight: 400, lineHeight: 1.35 })
        layers.push(sub)
        y += sub.height + unit * 0.03
      }
      const items = hasImage ? [] : spec.features.slice(0, 3)
      if (items.length) {
        const size = Math.round(unit * 0.1)
        const gap = (W - m * 2 - size * items.length) / (items.length + 1)
        items.forEach((f, i) => {
          const x = m + gap * (i + 1) + size * i
          layers.push(icon("Feature icon", f.icon, x, y, size, palette.accent, palette.soft, style.iconVariant))
          layers.push(text("Feature", f.label, { x: x - gap / 2 + 4, y: y + size + unit * 0.015, width: size + gap - 8, fontSize: Math.round(subSize * 0.72), color: ink, align: "center", font: "body", fontWeight: 600, lineHeight: 1.2 }))
        })
        y += size + unit * 0.11
      }
      const button = cta(0, Math.min(Math.max(y, H * 0.7), H - m - ctaSize * 2.6), "center")
      if (button) layers.push(button)
      break
    }
    default: {
      const unreachable: never = spec.layout
      throw new Error(`Unknown layout ${String(unreachable)}`)
    }
  }

  return layers
}

function brandMark(ctx: ComposeContext, ink: string): Layer[] {
  const { width: W, height: H } = ctx.format
  const unit = Math.min(W, H)
  if (W / H > 2.2) return []
  const size = Math.round(unit * 0.026)
  if (ctx.logoAssetId) {
    const h = unit * 0.07
    return [image("Logo", ctx.logoAssetId, W - unit * 0.07 - h * 2.4, H - unit * 0.06 - h, h * 2.4, h, { fit: "contain" })]
  }
  return [
    text("Brand name", ctx.businessName, {
      x: W - unit * 0.07 - W * 0.5,
      y: H - unit * 0.06 - size * 1.3,
      width: W * 0.5,
      fontSize: size,
      color: ink,
      align: "right",
      font: "body",
      fontWeight: 600,
      letterSpacing: 0.04,
      uppercase: true,
      opacity: 0.8,
    }),
  ]
}

function slidePage(slide: DesignSpec["slides"][number], index: number, total: number, ctx: ComposeContext, palette: ReturnType<typeof resolvePalette>): DesignPage {
  const { width: W, height: H } = ctx.format
  const unit = Math.min(W, H)
  const m = Math.round(unit * 0.08)
  const alt = index % 2 === 1
  const bg = alt ? palette.accent : palette.background
  const ink = alt ? palette.onAccent : palette.text
  const layers: Layer[] = [
    text("Slide number", String(index + 2).padStart(2, "0"), { x: m, y: m, width: unit * 0.3, fontSize: Math.round(unit * 0.07), color: alt ? palette.onAccent : palette.accent, font: "condensed", fontWeight: 400 }),
  ]
  const headline = text("Headline", slide.headline, { x: m, y: H * 0.3, width: W - m * 2, fontSize: Math.round(unit * 0.075), color: ink })
  layers.push(headline)
  layers.push(
    text("Body", slide.body, { x: m, y: headline.y + headline.height + unit * 0.035, width: W - m * 2, fontSize: Math.round(unit * 0.036), color: ink, font: "body", fontWeight: 400, lineHeight: 1.45 })
  )
  if (index < total - 1) {
    layers.push(text("Swipe", "Swipe →", { x: W - m - unit * 0.3, y: H - m - unit * 0.05, width: unit * 0.3, fontSize: Math.round(unit * 0.032), color: ink, align: "right", font: "body", fontWeight: 600 }))
  }
  return { id: newId("page"), background: { type: "solid", color: bg }, layers }
}

/** Deterministic layout engine: spec + format + brand → editable design document. */
export function composeDocument(spec: DesignSpec, ctx: ComposeContext): DesignDocument {
  activeStyle = ctx.style ?? DEFAULT_DESIGN_STYLE
  try {
    return composeWithStyle(spec, ctx)
  } finally {
    activeStyle = null
  }
}

function composeWithStyle(spec: DesignSpec, ctx: ComposeContext): DesignDocument {
  const palette = resolvePalette(spec.palette, ctx.brandColors)
  const background = backgroundFor(spec, palette, ctx.imageAssetId)
  const onImage =
    background.type === "image" && spec.layout !== "split" && spec.layout !== "bottom_band" && spec.layout !== "feature_list" && spec.layout !== "showcase"
  const { width: W, height: H } = ctx.format
  const unit = Math.min(W, H)
  const backdrop: Layer[] = []
  const patternKind = spec.pattern !== "none" ? spec.pattern : spec.backgroundStyle === "pattern" ? "dots" : null
  if (patternKind && !onImage) {
    backdrop.push(pattern(patternKind, 0, 0, W, H, palette.text, spec.backgroundStyle === "pattern" ? 0.12 : 0.07, Math.max(1, unit / 540)))
  }
  backdrop.push(...decorations(spec, W, H, palette, onImage))
  const cover: DesignPage = {
    id: newId("page"),
    background,
    layers: applyStyle(
      [...backdrop, ...coverLayers(spec, ctx, palette, onImage), ...brandMark(ctx, onImage ? "#FFFFFF" : palette.text)],
      ctx.style ?? DEFAULT_DESIGN_STYLE,
      unit
    ),
  }
  const slides = ctx.format.maxPages > 1 ? spec.slides.slice(0, ctx.format.maxPages - 1) : []
  return {
    version: 1,
    formatId: ctx.format.id,
    width: ctx.format.width,
    height: ctx.format.height,
    pages: [cover, ...slides.map((slide, i) => slidePage(slide, i, slides.length, ctx, palette))],
  }
}
