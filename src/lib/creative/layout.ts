import { z } from "zod"

import {
  newId,
  type Background,
  type DesignDocument,
  type DesignPage,
  type ImageLayer,
  type Layer,
  type ShapeLayer,
  type TextLayer,
} from "@/lib/creative/document"
import type { CreativeFormat } from "@/lib/creative/formats"

export const DESIGN_LAYOUTS = ["centered_hero", "bottom_band", "split", "top_headline", "bold_type", "corner_minimal"] as const
export type DesignLayout = (typeof DESIGN_LAYOUTS)[number]

export const LAYOUT_LABELS: Record<DesignLayout, string> = {
  centered_hero: "Centred hero",
  bottom_band: "Bottom band",
  split: "Split",
  top_headline: "Top headline",
  bold_type: "Bold type",
  corner_minimal: "Minimal",
}

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
  backgroundStyle: z.enum(["solid", "gradient", "image"]),
  imagePrompt: z.string().describe("Generation-ready prompt for a background photo; no text in the image"),
  slides: z
    .array(z.object({ headline: z.string(), body: z.string() }))
    .describe("Carousel slides after the cover (3-6 for carousels, empty otherwise)"),
})
export type DesignSpec = z.infer<typeof designSpecSchema>

export interface ComposeContext {
  format: CreativeFormat
  brandColors: { hex: string; role: string }[]
  businessName: string
  logoAssetId: string | null
  /** Background/hero photo to use when the spec asks for an image. */
  imageAssetId: string | null
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
  return { background, text, accent, onAccent: readableOn(accent, "#FFFFFF") }
}

function base(name: string, x: number, y: number, width: number, height: number) {
  return { id: newId("layer"), name, x, y, width, height, rotation: 0, opacity: 1, locked: false, hidden: false }
}

function estimateTextHeight(text: string, fontSize: number, width: number, lineHeight: number, padding: number): number {
  const charsPerLine = Math.max(1, Math.floor((width - padding * 2) / (fontSize * 0.52)))
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
  const height = opts.height ?? estimateTextHeight(value, opts.fontSize, opts.width, lineHeight, padding)
  return {
    ...base(name, opts.x, opts.y, opts.width, height),
    type: "text",
    text: value,
    font: opts.font ?? "heading",
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

function backgroundFor(spec: DesignSpec, palette: ReturnType<typeof resolvePalette>, imageAssetId: string | null): Background {
  if (spec.backgroundStyle === "image" && imageAssetId) {
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
      const button = cta(tx, Math.min(y, panel.y + panel.h - m - ctaSize * 2.6))
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
  const palette = resolvePalette(spec.palette, ctx.brandColors)
  const background = backgroundFor(spec, palette, ctx.imageAssetId)
  const onImage = background.type === "image" && spec.layout !== "split" && spec.layout !== "bottom_band"
  const cover: DesignPage = {
    id: newId("page"),
    background,
    layers: [...coverLayers(spec, ctx, palette, onImage), ...brandMark(ctx, onImage ? "#FFFFFF" : palette.text)],
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
